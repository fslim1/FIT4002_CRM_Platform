const fs = require('fs');
const path = 'backend/controllers/dashboardController.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /        if \(Object\.keys\(dealDateCondition\)\.length > 0\) \{\n            dateMatchDeal = \[\{ \$match: \{ updatedAt: dealDateCondition \} \}\];\n        \}/,
    `        let dateMatchDealCreated = [];
        let dateMatchDealUpdated = [];
        if (Object.keys(dealDateCondition).length > 0) {
            dateMatchDealCreated = [{ $match: { createdAt: dealDateCondition } }];
            dateMatchDealUpdated = [{ $match: { updatedAt: dealDateCondition } }];
        }`
);

content = content.replace(
    /        let prevDateMatchDeal = \[\];\n        let prevDateMatchInteraction = \[\];\n        if \(showChange\) \{\n            let pDealDateCond = \{\};\n            if \(prevStartDate\) pDealDateCond\.\$gte = prevStartDate;\n            if \(prevEndDate\) pDealDateCond\.\$lte = new Date\(new Date\(prevEndDate\)\.setHours\(23, 59, 59, 999\)\);\n            if \(Object\.keys\(pDealDateCond\)\.length > 0\) \{\n                prevDateMatchDeal = \[\{ \$match: \{ updatedAt: pDealDateCond \} \}\];\n                prevDateMatchInteraction = \[\{ \$match: \{ "interactions\.date": pDealDateCond \} \}\];\n            \}\n        \}/,
    `        let prevDateMatchDealCreated = [];
        let prevDateMatchDealUpdated = [];
        let prevDateMatchInteraction = [];
        if (showChange) {
            let pDealDateCond = {};
            if (prevStartDate) pDealDateCond.$gte = prevStartDate;
            if (prevEndDate) pDealDateCond.$lte = new Date(new Date(prevEndDate).setHours(23, 59, 59, 999));
            if (Object.keys(pDealDateCond).length > 0) {
                prevDateMatchDealCreated = [{ $match: { createdAt: pDealDateCond } }];
                prevDateMatchDealUpdated = [{ $match: { updatedAt: pDealDateCond } }];
                prevDateMatchInteraction = [{ $match: { "interactions.date": pDealDateCond } }];
            }
        }`
);

const dealAggReplacement = `        // 1. Aggregation for Deals
        const ongoingAgg = await Deal.aggregate([
            ...dealMatch,
            ...dateMatchDealCreated,
            {
                $facet: {
                    totals: [
                        { $group: {
                            _id: null,
                            ongoingDeals: { $sum: { $cond: [{ $in: ["$stage", ["Won", "Lost"]] }, 0, 1] } }
                        }}
                    ],
                    stages: [
                        { $match: { stage: { $nin: ["Won", "Lost"] } } },
                        { $group: { _id: "$stage", count: { $sum: 1 } } }
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
                                { $eq: ["$stage", "Won"] }, 
                                { $convert: { input: "$price", to: "double", onError: 0, onNull: 0 } }, 
                                0
                            ] 
                        } 
                    },
                    dealsCompleted: { $sum: { $cond: [{ $eq: ["$stage", "Won"] }, 1, 0] } },
                    lostDeals: { $sum: { $cond: [{ $eq: ["$stage", "Lost"] }, 1, 0] } }
                }
            }
        ]);

        const ongoingTotals = ongoingAgg[0].totals[0] || { ongoingDeals: 0 };
        const completedTotals = completedAgg[0] || { totalSales: 0, dealsCompleted: 0, lostDeals: 0 };

        const dealTotals = {
            totalSales: completedTotals.totalSales,
            dealsCompleted: completedTotals.dealsCompleted,
            ongoingDeals: ongoingTotals.ongoingDeals,
            lostDeals: completedTotals.lostDeals,
            totalCount: completedTotals.dealsCompleted + ongoingTotals.ongoingDeals + completedTotals.lostDeals
        };
        const avgDealValue = dealTotals.dealsCompleted > 0 ? (dealTotals.totalSales / dealTotals.dealsCompleted) : 0;
        
        // Ensure standard pipeline stages exist
        const defaultStages = { 'Qualified': 0, 'Contact Made': 0, 'Demo Scheduled': 0, 'Proposal Made': 0, 'Negotiation': 0 };
        ongoingAgg[0].stages.forEach(s => { defaultStages[s._id] = s.count; });
        const stagesArray = Object.keys(defaultStages).map(k => ({ name: k, count: defaultStages[k] }));`;

content = content.replace(/\/\/ 1\. Aggregation for Deals[\s\S]*?const stagesArray = Object\.keys\(defaultStages\)\.map\(k => \(\{ name: k, count: defaultStages\[k\] \}\)\);/, dealAggReplacement);

const prevDealAggReplacement = `        let prevDealTotals = { totalSales: 0, dealsCompleted: 0, ongoingDeals: 0, avgDealValue: 0 };
        let prevIStats = { callsMade: 0, emailsSent: 0, meetingsHeld: 0 };
        if (showChange) {
            const prevOngoingAgg = await Deal.aggregate([
                ...dealMatch,
                ...prevDateMatchDealCreated,
                { $group: {
                    _id: null,
                    ongoingDeals: { $sum: { $cond: [{ $in: ["$stage", ["Won", "Lost"]] }, 0, 1] } }
                }}
            ]);

            const prevCompletedAgg = await Deal.aggregate([
                ...dealMatch,
                ...prevDateMatchDealUpdated,
                { $group: {
                    _id: null,
                    totalSales: { $sum: { $cond: [{ $eq: ["$stage", "Won"] }, { $convert: { input: "$price", to: "double", onError: 0, onNull: 0 } }, 0] } },
                    dealsCompleted: { $sum: { $cond: [{ $eq: ["$stage", "Won"] }, 1, 0] } }
                }}
            ]);
            
            prevDealTotals.ongoingDeals = prevOngoingAgg[0]?.ongoingDeals || 0;
            prevDealTotals.totalSales = prevCompletedAgg[0]?.totalSales || 0;
            prevDealTotals.dealsCompleted = prevCompletedAgg[0]?.dealsCompleted || 0;
            prevDealTotals.avgDealValue = prevDealTotals.dealsCompleted > 0 ? (prevDealTotals.totalSales / prevDealTotals.dealsCompleted) : 0;`;

content = content.replace(/        let prevDealTotals = \{ totalSales: 0, dealsCompleted: 0, ongoingDeals: 0, avgDealValue: 0 \};\n        let prevIStats = \{ callsMade: 0, emailsSent: 0, meetingsHeld: 0 \};\n        if \(showChange\) \{\n            const prevDealAgg = await Deal\.aggregate\(\[\n                \.\.\.dealMatch,\n                \.\.\.prevDateMatchDeal,\n                \{ \$group: \{\n                    _id: null,\n                    totalSales: \{ \$sum: \{ \$cond: \[\{ \$eq: \["\$stage", "Won"\] \}, \{ \$convert: \{ input: "\$price", to: "double", onError: 0, onNull: 0 \} \}, 0\] \} \},\n                    dealsCompleted: \{ \$sum: \{ \$cond: \[\{ \$eq: \["\$stage", "Won"\] \}, 1, 0\] \} \},\n                    ongoingDeals: \{ \$sum: \{ \$cond: \[\{ \$in: \["\$stage", \["Won", "Lost"\]\] \}, 0, 1\] \} \}\n                \}\}\n            \]\);\n            if \(prevDealAgg\.length > 0\) \{\n                prevDealTotals = prevDealAgg\[0\];\n                prevDealTotals\.avgDealValue = prevDealTotals\.dealsCompleted > 0 \? \(prevDealTotals\.totalSales \/ prevDealTotals\.dealsCompleted\) : 0;\n            \}/, prevDealAggReplacement);

// Fix salesTrendsRaw and dealUserStats to use dateMatchDealUpdated
content = content.replace(/const salesTrendsRaw = await Deal.aggregate\(\[\n            \.\.\.dealMatch,\n            \.\.\.dateMatchDeal,/, `const salesTrendsRaw = await Deal.aggregate([\n            ...dealMatch,\n            ...dateMatchDealUpdated,`);

content = content.replace(/const dealUserStats = await Deal.aggregate\(\[\n            \.\.\.dateMatchDeal,/, `const dealUserStats = await Deal.aggregate([\n            ...dateMatchDealUpdated,`);


fs.writeFileSync(path, content, 'utf8');
console.log('Done replacing');
