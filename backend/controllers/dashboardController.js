const Deal = require('../models/Deal');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

const User = require('../models/User');

exports.getDashboardData = async (req, res) => {
    try {
        const isSupervisor = req.user && ['Admin', 'Supervisor'].includes(req.user.role);

        const { seesEverything, getCompanyUserIds, getTeamMemberIds } = require('../middleware/teamScope');

        let allowedUserIds = [];
        if (req.user) {
            if (seesEverything(req.user)) {
                allowedUserIds = await getCompanyUserIds(req.user);
            } else {
                allowedUserIds = await getTeamMemberIds(req.user);
            }
        }

        let targetUserIds = allowedUserIds;

        if (req.query.memberId && mongoose.isValidObjectId(req.query.memberId)) {
            const memberIdStr = String(req.query.memberId);
            if (allowedUserIds.some(id => String(id) === memberIdStr)) {
                targetUserIds = [new mongoose.Types.ObjectId(req.query.memberId)];
            }
        } else if (!isSupervisor && req.user) {
            targetUserIds = [req.user._id];
        }

        const dealMatch = targetUserIds.length > 0 
            ? [{$match: {createdBy: {$in: targetUserIds}}}]
            : [];

        const interactionMatch = targetUserIds.length > 0
            ? [{$match: {"interactions.createdBy": {$in: targetUserIds}}}]
            : [];

        const timeFilter = req.query.timeFilter || 'thisMonth';
        let startDate = null;
        let endDate = null;
        if (timeFilter === 'today') {
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
        } else if (timeFilter === 'thisWeek') {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
        } else if (timeFilter === 'thisMonth') {
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);
        } else if (timeFilter === 'thisYear') {
            startDate = new Date(new Date().getFullYear(), 0, 1);
        } else if (timeFilter === 'custom') {
            if (req.query.startDate) startDate = new Date(req.query.startDate);
            if (req.query.endDate) endDate = new Date(req.query.endDate);
        }

        let dateMatchDeal = [];
        let dealDateCondition = {};
        if (startDate) dealDateCondition.$gte = startDate;
        if (endDate) dealDateCondition.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        let dateMatchDealCreated = [];
        let dateMatchDealUpdated = [];
        if (Object.keys(dealDateCondition).length > 0) {
            dateMatchDealCreated = [{$match: {createdAt: dealDateCondition}}];
            dateMatchDealUpdated = [{$match: {updatedAt: dealDateCondition}}];
        }

        let dateMatchInteraction = [];
        let interactionDateCondition = {};
        if (startDate) interactionDateCondition.$gte = startDate;
        if (endDate) interactionDateCondition.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        if (Object.keys(interactionDateCondition).length > 0) {
            dateMatchInteraction = [{$match: {"interactions.date": interactionDateCondition}}];
        }

        // Calculate previous period for KPIs
        let prevStartDate = null;
        let prevEndDate = null;
        let showChange = false;

        if (timeFilter === 'today') {
            prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - 1);
            prevEndDate = new Date(endDate);
            prevEndDate.setDate(prevEndDate.getDate() - 1);
            showChange = true;
        } else if (timeFilter === 'thisWeek') {
            prevEndDate = new Date(startDate);
            prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - 7);
            showChange = true;
        } else if (timeFilter === 'thisMonth') {
            prevEndDate = new Date(startDate);
            prevStartDate = new Date(startDate);
            prevStartDate.setMonth(prevStartDate.getMonth() - 1);
            showChange = true;
        } else if (timeFilter === 'thisYear') {
            prevEndDate = new Date(startDate);
            prevStartDate = new Date(startDate);
            prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
            showChange = true;
        }

        let prevDateMatchDealCreated = [];
        let prevDateMatchDealUpdated = [];
        let prevDateMatchInteraction = [];
        if (showChange) {
            let pDealDateCond = {};
            if (prevStartDate) pDealDateCond.$gte = prevStartDate;
            if (prevEndDate) pDealDateCond.$lte = new Date(new Date(prevEndDate).setHours(23, 59, 59, 999));
            if (Object.keys(pDealDateCond).length > 0) {
                prevDateMatchDealCreated = [{$match: {createdAt: pDealDateCond}}];
                prevDateMatchDealUpdated = [{$match: {updatedAt: pDealDateCond}}];
                prevDateMatchInteraction = [{$match: {"interactions.date": pDealDateCond}}];
            }
        }

        // 1. Aggregation for Deals
        const ongoingAgg = await Deal.aggregate([
            ...dealMatch,
            ...dateMatchDealCreated,
            {
                $facet: {
                    totals: [
                        {
                            $group: {
                                _id: null,
                                ongoingDeals: {$sum: {$cond: [{$in: ["$stage", ["Won", "Lost"]]}, 0, 1]}}
                            }
                        }
                    ],
                    stages: [
                        {$match: {stage: {$nin: ["Won", "Lost"]}}},
                        {$group: {_id: "$stage", count: {$sum: 1}}}
                    ]
                }
            }
        ]);

        const completedAgg = await Deal.aggregate([
            ...dealMatch,
            ...dateMatchDealUpdated,
            {
                $group: {
                    _id: null,
                    totalSales: {
                        $sum: {
                            $cond: [
                                {$eq: ["$stage", "Won"]},
                                {$convert: {input: "$price", to: "double", onError: 0, onNull: 0}},
                                0
                            ]
                        }
                    },
                    wonDeals: {$sum: {$cond: [{$eq: ["$stage", "Won"]}, 1, 0]}},
                    lostDeals: {$sum: {$cond: [{$eq: ["$stage", "Lost"]}, 1, 0]}}
                }
            }
        ]);

        const ongoingTotals = ongoingAgg[0].totals[0] || {ongoingDeals: 0};
        const completedTotals = completedAgg[0] || {totalSales: 0, wonDeals: 0, lostDeals: 0};

        const dealTotals = {
            totalSales: completedTotals.totalSales,
            wonDeals: completedTotals.wonDeals,
            dealsCompleted: completedTotals.wonDeals + completedTotals.lostDeals, // Won + Lost
            ongoingDeals: ongoingTotals.ongoingDeals,
            lostDeals: completedTotals.lostDeals,
            totalCount: completedTotals.wonDeals + completedTotals.lostDeals + ongoingTotals.ongoingDeals
        };
        const avgDealValue = dealTotals.wonDeals > 0 ? (dealTotals.totalSales / dealTotals.wonDeals) : 0;

        // Ensure standard pipeline stages exist
        const defaultStages = {
            'Qualified': 0,
            'Contact Made': 0,
            'Demo Scheduled': 0,
            'Proposal Made': 0,
            'Negotiation': 0
        };
        ongoingAgg[0].stages.forEach(s => {
            defaultStages[s._id] = s.count;
        });
        const stagesArray = Object.keys(defaultStages).map(k => ({name: k, count: defaultStages[k]}));

        // 2. Aggregation for Interactions (Summary Counts)
        const interactionStats = await Customer.aggregate([
            {$unwind: "$interactions"},
            ...interactionMatch,
            ...dateMatchInteraction,
            {
                $group: {
                    _id: null,
                    callsMade: {$sum: {$cond: [{$eq: [{$toLower: "$interactions.type"}, "call"]}, 1, 0]}},
                    emailsSent: {$sum: {$cond: [{$eq: [{$toLower: "$interactions.type"}, "email"]}, 1, 0]}},
                    meetingsHeld: {$sum: {$cond: [{$in: [{$toLower: "$interactions.type"}, ["meeting", "task"]]}, 1, 0]}}
                }
            }
        ]);
        const iStats = interactionStats[0] || {callsMade: 0, emailsSent: 0, meetingsHeld: 0};

        // 2b. Aggregation for Previous Period
        let prevDealTotals = {totalSales: 0, dealsCompleted: 0, ongoingDeals: 0, avgDealValue: 0};
        let prevIStats = {callsMade: 0, emailsSent: 0, meetingsHeld: 0};
        if (showChange) {
            const prevOngoingAgg = await Deal.aggregate([
                ...dealMatch,
                ...prevDateMatchDealCreated,
                {
                    $group: {
                        _id: null,
                        ongoingDeals: {$sum: {$cond: [{$in: ["$stage", ["Won", "Lost"]]}, 0, 1]}}
                    }
                }
            ]);

            const prevCompletedAgg = await Deal.aggregate([
                ...dealMatch,
                ...prevDateMatchDealUpdated,
                {
                    $group: {
                        _id: null,
                        totalSales: {
                            $sum: {
                                $cond: [{$eq: ["$stage", "Won"]}, {
                                    $convert: {
                                        input: "$price",
                                        to: "double",
                                        onError: 0,
                                        onNull: 0
                                    }
                                }, 0]
                            }
                        },
                        wonDeals: {$sum: {$cond: [{$eq: ["$stage", "Won"]}, 1, 0]}},
                        lostDeals: {$sum: {$cond: [{$eq: ["$stage", "Lost"]}, 1, 0]}}
                    }
                }
            ]);

            prevDealTotals.ongoingDeals = prevOngoingAgg[0]?.ongoingDeals || 0;
            prevDealTotals.totalSales = prevCompletedAgg[0]?.totalSales || 0;
            prevDealTotals.wonDeals = prevCompletedAgg[0]?.wonDeals || 0;
            prevDealTotals.lostDeals = prevCompletedAgg[0]?.lostDeals || 0;
            prevDealTotals.dealsCompleted = (prevCompletedAgg[0]?.wonDeals || 0) + (prevCompletedAgg[0]?.lostDeals || 0);
            prevDealTotals.avgDealValue = prevDealTotals.wonDeals > 0 ? (prevDealTotals.totalSales / prevDealTotals.wonDeals) : 0;

            const prevInteractionAgg = await Customer.aggregate([
                {$unwind: "$interactions"},
                ...interactionMatch,
                ...prevDateMatchInteraction,
                {
                    $group: {
                        _id: null,
                        callsMade: {$sum: {$cond: [{$eq: [{$toLower: "$interactions.type"}, "call"]}, 1, 0]}},
                        emailsSent: {$sum: {$cond: [{$eq: [{$toLower: "$interactions.type"}, "email"]}, 1, 0]}},
                        meetingsHeld: {$sum: {$cond: [{$in: [{$toLower: "$interactions.type"}, ["meeting", "task"]]}, 1, 0]}}
                    }
                }
            ]);
            if (prevInteractionAgg.length > 0) prevIStats = prevInteractionAgg[0];
        }

        const calcChange = (curr, prev) => {
            if (!showChange) return null;
            if (prev === 0) return curr > 0 ? 100 : 0;
            return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
        };

        // 3. Aggregation for Recent Activities (Top 3 recent interactions, grouped by Customer)
        const recentInteractions = await Customer.aggregate([
            {$match: {"interactions.0": {$exists: true}}},
            {$unwind: "$interactions"},
            ...interactionMatch,
            ...dateMatchInteraction,
            {$sort: {"interactions.date": -1}},
            {$limit: 3},
            {
                $lookup: {
                    from: "users",
                    localField: "interactions.createdBy",
                    foreignField: "_id",
                    as: "creatorInfo"
                }
            },
            {$unwind: {path: "$creatorInfo", preserveNullAndEmptyArrays: true}},
            {
                $project: {
                    _id: "$interactions._id",
                    fullName: "$fullName",
                    company: "$company",
                    createdBy: "$interactions.createdBy",
                    creatorName: "$creatorInfo.fullName",
                    latest: "$interactions"
                }
            }
        ]);

        const timeAgo = (date) => {
            if (!date) return 'Just now';
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);
            let interval = seconds / 31536000;
            if (interval >= 1) return Math.floor(interval) + " years ago";
            interval = seconds / 2592000;
            if (interval >= 1) return Math.floor(interval) + " months ago";
            interval = seconds / 86400;
            if (interval >= 1) {
                const days = Math.floor(interval);
                return days === 1 ? "1 day ago" : days + " days ago";
            }
            interval = seconds / 3600;
            if (interval >= 1) {
                const hrs = Math.floor(interval);
                return hrs === 1 ? "1 hour ago" : hrs + " hours ago";
            }
            interval = seconds / 60;
            if (interval >= 1) {
                const mins = Math.floor(interval);
                return mins === 1 ? "1 minute ago" : mins + " minutes ago";
            }
            return "Just now";
        };

        const recentActivities = recentInteractions.map(inter => {
            let iconType = 'phone';
            let bg = '#eaf6ff';
            let color = '#253984';

            const t = inter.latest.type?.toLowerCase() || '';
            if (t === 'email') {
                iconType = 'mail';
                bg = '#e8f5e9';
                color = '#2e7d32';
            } else if (t === 'meeting') {
                iconType = 'video';
                bg = '#fff3e0';
                color = '#e65100';
            } else if (t === 'task') {
                iconType = 'task';
                bg = '#f3e5f5';
                color = '#7b1fa2';
            } else if (t === 'note') {
                iconType = 'note';
                bg = '#fffde7';
                color = '#fbc02d';
            } else if (t === 'file') {
                iconType = 'file';
                bg = '#eceff1';
                color = '#455a64';
            }

            const displayTime = timeAgo(inter.latest.date);
            const author = inter.createdBy ? 'Sales Rep' : 'You';

            let displayTitle = inter.fullName || 'Unknown Customer';
            if (inter.company) {
                displayTitle = `${inter.fullName} (${inter.company})`;
            }

            let desc = `${inter.latest.details || ''} • ${displayTime}`;
            if (isSupervisor && inter.creatorName) {
                desc = `${inter.creatorName}: ${inter.latest.details || ''} • ${displayTime}`;
            }

            return {
                id: inter._id,
                company: displayTitle,
                desc,
                iconType,
                bg,
                color
            };
        });

        // Sales Pipeline card: no user filter (shows all team deals like the SalesPipeline page)
        // Won/Lost are time-filtered by updatedAt (when the deal was dragged to that outcome)
        // Ongoing and stages have no time filter (shows current active pipeline)
        const pipelineUpdatedCond = Object.keys(dealDateCondition).length > 0
            ? {updatedAt: dealDateCondition}
            : null;

        const pipelineAgg = await Deal.aggregate([
            ...dealMatch,
            {
                $facet: {
                    completedDeals: [
                        ...(pipelineUpdatedCond ? [{$match: pipelineUpdatedCond}] : []),
                        {$match: {stage: 'Won'}},
                        {$count: 'count'}
                    ],
                    lostDeals: [
                        ...(pipelineUpdatedCond ? [{$match: pipelineUpdatedCond}] : []),
                        {$match: {stage: 'Lost'}},
                        {$count: 'count'}
                    ],
                    ongoingDeals: [
                        {$match: {stage: {$nin: ['Won', 'Lost']}}},
                        {$count: 'count'}
                    ],
                    stages: [
                        {$match: {stage: {$nin: ['Won', 'Lost']}}},
                        {$group: {_id: '$stage', count: {$sum: 1}}}
                    ]
                }
            }
        ]);

        const pipeCompletedDeals = pipelineAgg[0]?.completedDeals[0]?.count || 0;
        const pipeLostDeals = pipelineAgg[0]?.lostDeals[0]?.count || 0;
        const pipeOngoingDeals = pipelineAgg[0]?.ongoingDeals[0]?.count || 0;
        const pipeDefaultStages = {
            'Qualified': 0,
            'Contact Made': 0,
            'Demo Scheduled': 0,
            'Proposal Made': 0,
            'Negotiation': 0
        };
        pipelineAgg[0]?.stages?.forEach(s => {
            pipeDefaultStages[s._id] = s.count;
        });
        const pipeStagesArray = Object.keys(pipeDefaultStages).map(k => ({name: k, count: pipeDefaultStages[k]}));

        const pipeline = {
            total: pipeCompletedDeals + pipeLostDeals + pipeOngoingDeals,
            completedDeals: pipeCompletedDeals,
            ongoingDeals: pipeOngoingDeals,
            lostDeals: pipeLostDeals,
            stages: pipeStagesArray
        };

        const activitySummary = {
            callsMade: iStats.callsMade,
            callsChange: calcChange(iStats.callsMade, prevIStats.callsMade),
            meetingsHeld: iStats.meetingsHeld,
            meetingsChange: calcChange(iStats.meetingsHeld, prevIStats.meetingsHeld),
            emailsSent: iStats.emailsSent,
            emailsChange: calcChange(iStats.emailsSent, prevIStats.emailsSent),
            dealsClosed: dealTotals.dealsCompleted,
            dealsChange: calcChange(dealTotals.dealsCompleted, prevDealTotals.dealsCompleted)
        };

        const fmtDate = (d) => {
            if (!d) return '?';
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return `${d.getDate()} ${months[d.getMonth()]}`;
        };

        let formatFormat = '';
        if (timeFilter === 'thisWeek' || timeFilter === 'thisMonth' || timeFilter === 'custom') {
            formatFormat = '%Y-%m-%d';
        } else if (timeFilter === 'thisYear' || timeFilter === 'all') {
            formatFormat = '%Y-%m';
        }

        const salesTrendsRaw = await Deal.aggregate([
            ...dealMatch,
            ...dateMatchDealUpdated,
            {$match: {stage: "Won"}},
            {
                $group: {
                    _id: formatFormat === 'single_point' ? "single_point" : {
                        $dateToString: {
                            format: formatFormat,
                            date: "$updatedAt"
                        }
                    },
                    sales: {$sum: {$convert: {input: "$price", to: "double", onError: 0, onNull: 0}}}
                }
            },
            {$sort: {_id: 1}}
        ]);

        let salesTrends = [];
        if (timeFilter === 'thisWeek') {
            const days = [];
            const curDate = new Date(startDate);
            const endD = endDate ? new Date(endDate) : new Date();
            while (curDate <= endD) {
                days.push({
                    id: curDate.toISOString().split('T')[0],
                    label: fmtDate(curDate),
                    sales: 0
                });
                curDate.setDate(curDate.getDate() + 1);
            }
            salesTrendsRaw.forEach(t => {
                const dayObj = days.find(d => d.id === t._id);
                if (dayObj) dayObj.sales = t.sales;
            });
            salesTrends = days.map(d => ({week: d.label, sales: d.sales}));
        } else if (timeFilter === 'custom') {
            let curDate = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
            const endD = endDate ? new Date(endDate) : new Date();

            salesTrendsRaw.forEach(t => {
                salesTrends.push({id: t._id, week: fmtDate(new Date(t._id)), sales: t.sales});
            });

            const startId = curDate.toISOString().split('T')[0];
            if (!salesTrends.find(d => d.id === startId)) {
                salesTrends.push({id: startId, week: fmtDate(curDate), sales: 0});
            }

            const endId = endD.toISOString().split('T')[0];
            if (!salesTrends.find(d => d.id === endId)) {
                salesTrends.push({id: endId, week: fmtDate(endD), sales: 0});
            }

            salesTrends.sort((a, b) => a.id.localeCompare(b.id));
            salesTrends = salesTrends.map(d => ({week: d.week, sales: d.sales}));
        } else if (timeFilter === 'thisMonth') {
            const weeks = {'W1': 0, 'W2': 0, 'W3': 0, 'W4': 0, 'W5': 0};
            salesTrendsRaw.forEach(t => {
                if (!t._id) return;
                const day = parseInt(t._id.split('-')[2]);
                if (day <= 7) weeks['W1'] += t.sales;
                else if (day <= 14) weeks['W2'] += t.sales;
                else if (day <= 21) weeks['W3'] += t.sales;
                else if (day <= 28) weeks['W4'] += t.sales;
                else weeks['W5'] += t.sales;
            });
            salesTrends = Object.keys(weeks).map(k => ({week: k, sales: weeks[k]}));
            if (salesTrends[4].sales === 0) salesTrends.pop(); // hide W5 if empty
        } else if (timeFilter === 'thisYear') {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const yearData = {};
            monthNames.forEach(m => yearData[m] = 0);

            salesTrendsRaw.forEach(t => {
                if (!t._id) return;
                const monthIdx = parseInt(t._id.split('-')[1]) - 1;
                if (monthIdx >= 0 && monthIdx < 12) {
                    yearData[monthNames[monthIdx]] += t.sales;
                }
            });

            salesTrends = monthNames.map(m => ({week: m, sales: yearData[m]}));
        } else {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            salesTrends = salesTrendsRaw.map(t => {
                if (!t._id) return {id: '0000-00', week: 'Unknown', sales: t.sales};
                const parts = t._id.split('-');
                const year = parts[0].slice(2);
                const monthIdx = parseInt(parts[1]) - 1;
                return {
                    id: t._id,
                    week: `${monthNames[monthIdx]} '${year}`,
                    sales: t.sales
                };
            });

            const now = new Date();
            const currentMonthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (!salesTrends.find(d => d.id === currentMonthId)) {
                salesTrends.push({
                    id: currentMonthId,
                    week: `${monthNames[now.getMonth()]} '${String(now.getFullYear()).slice(2)}`,
                    sales: 0
                });
            }

            if (salesTrends.length === 1) {
                const prev = new Date();
                prev.setMonth(prev.getMonth() - 1);
                const prevId = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
                salesTrends.unshift({
                    id: prevId,
                    week: `${monthNames[prev.getMonth()]} '${String(prev.getFullYear()).slice(2)}`,
                    sales: 0
                });
            }

            salesTrends.sort((a, b) => a.id.localeCompare(b.id));
            salesTrends = salesTrends.map(d => ({week: d.week, sales: d.sales}));
        }

        const usersQuery = { _id: { $in: allowedUserIds } };
        const users = req.user ? await User.find(usersQuery).select('fullName _id role') : [];

        let tableUsers = users;
        if (req.query.memberId && mongoose.isValidObjectId(req.query.memberId)) {
            tableUsers = users.filter(u => u._id.toString() === req.query.memberId.toString());
        } else if (!isSupervisor && req.user) {
            tableUsers = users.filter(u => u._id.toString() === req.user._id.toString());
        }

        const tableUserIds = tableUsers.map(u => u._id);

        const dealUserStats = await Deal.aggregate([
            { $match: { createdBy: { $in: tableUserIds } } },
            ...dateMatchDealUpdated,
            {$match: {stage: "Won"}},
            {
                $group: {
                    _id: "$createdBy",
                    sales: {$sum: {$convert: {input: "$price", to: "double", onError: 0, onNull: 0}}},
                    deals: {$sum: 1}
                }
            }
        ]);

        const activityUserStats = await Customer.aggregate([
            {$unwind: "$interactions"},
            {$match: {"interactions.createdBy": { $in: tableUserIds }}},
            ...dateMatchInteraction,
            {
                $group: {
                    _id: "$interactions.createdBy",
                    activities: {$sum: 1}
                }
            }
        ]);

        let members = tableUsers.map(u => {
            const dStat = dealUserStats.find(d => d._id?.toString() === u._id.toString()) || {sales: 0, deals: 0};
            const aStat = activityUserStats.find(a => a._id?.toString() === u._id.toString()) || {activities: 0};
            return {
                name: u.fullName,
                sales: dStat.sales,
                deals: dStat.deals,
                activities: aStat.activities
            };
        });

        // Sort members by sales descending
        members.sort((a, b) => b.sales - a.sales);

        // Fallback for no users
        if (members.length === 0) {
            members = [{name: req.user?.fullName || 'Team Member', sales: 0, deals: 0, activities: 0}];
        }

        const teamPerformance = {
            topMember: members[0].name,
            members: members
        };

        const membersList = users.map(u => ({id: u._id.toString(), name: u.fullName}));

        res.json({
            membersList,
            totalSales: {
                value: dealTotals.totalSales,
                changePercent: calcChange(dealTotals.totalSales, prevDealTotals.totalSales),
                showChange
            },
            dealsCompleted: {
                value: dealTotals.dealsCompleted,
                changePercent: calcChange(dealTotals.dealsCompleted, prevDealTotals.dealsCompleted),
                showChange
            },
            ongoingDeals: {
                value: dealTotals.ongoingDeals,
                changePercent: calcChange(dealTotals.ongoingDeals, prevDealTotals.ongoingDeals),
                showChange
            },
            avgDealValue: {
                value: avgDealValue,
                changePercent: calcChange(avgDealValue, prevDealTotals.avgDealValue),
                showChange
            },
            salesTrends,
            pipeline,
            activitySummary,
            recentActivities,
            teamPerformance
        });
    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({message: "Error fetching dashboard data"});
    }
};
