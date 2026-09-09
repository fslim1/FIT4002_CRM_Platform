const User = require('../models/User')
const Team = require('../models/Team')
const {hasPermission} = require('./permissions')

// Central helpers implementing team-based data visibility.
//
// Rules:
//  - Admin sees everything, as does anyone granted the individual
//    "viewAllData" permission (Settings -> Permissions).
//  - Supervisors see every record belonging to their team.
//  - Users see their own records, plus teammates' records when the team's
//    customer-sharing toggle is enabled.
//  - Legacy records with no owner AND no team remain visible to all staff so
//    data created before team management existed does not disappear.

const seesEverything = (user) =>
    user.role === 'Admin' || hasPermission(user, 'viewAllData')

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Case-insensitive matcher for a company name.
const companyPattern = (companyName) =>
    new RegExp(`^${escapeRegex((companyName || '').trim())}$`, 'i')

const sameCompanyName = (a, b) =>
    (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()

// IDs of every user in the same company as `user`. Even "sees everything"
// access (Admin / viewAllData) is bounded to the user's own company.
const getCompanyUserIds = async (user) => {
    const members = await User.find({
        companyName: companyPattern(user.companyName),
    }).select('_id')
    const ids = members.map((m) => m._id)
    if (!ids.some((id) => String(id) === String(user._id))) ids.push(user._id)
    return ids
}

const isLegacyCustomer = (customer) => !customer.owner && !customer.team

const teamSharingEnabled = async (teamId) => {
    if (!teamId) return false
    const team = await Team.findById(teamId).select('sharingEnabled')
    return Boolean(team && team.sharingEnabled)
}

// Mongo filter matching every customer the user is allowed to see.
const getVisibleCustomerFilter = async (user) => {
    if (seesEverything(user)) {
        // Company bounded: records owned by the user's company, plus legacy
        // records that predate ownership tracking.
        return {
            $or: [
                {owner: {$in: await getCompanyUserIds(user)}},
                {owner: null, team: null},
            ],
        }
    }

    const clauses = [
        {owner: user._id},
        // Legacy/unassigned records (created before ownership existed)
        {owner: null, team: null},
    ]

    let tIds = [];
    if (user.team) {
        if (user.role === 'Supervisor' || await teamSharingEnabled(user.team)) {
            tIds.push(user.team);
        }
    }
    
    if (user.role === 'Supervisor') {
        const supervised = await Team.find({ supervisor: user._id }).select('_id');
        supervised.forEach(t => {
            if (!tIds.some(id => String(id) === String(t._id))) tIds.push(t._id);
        });
    }

    if (tIds.length > 0) {
        clauses.push({team: {$in: tIds}});
    }

    return {$or: clauses}
}

const canViewCustomer = async (user, customer) => {
    if (isLegacyCustomer(customer)) return true
    if (customer.owner && String(customer.owner._id || customer.owner) === String(user._id)) {
        return true
    }
    if (seesEverything(user)) {
        if (!customer.owner) return true
        const companyIds = await getCompanyUserIds(user)
        return companyIds.some(
            (id) => String(id) === String(customer.owner._id || customer.owner)
        )
    }
    if (user.role === 'Supervisor') {
        let tIds = [];
        if (user.team) tIds.push(user.team);
        const supervised = await Team.find({ supervisor: user._id }).select('_id');
        supervised.forEach(t => {
            if (!tIds.some(id => String(id) === String(t._id))) tIds.push(t._id);
        });
        if (customer.team && tIds.some(id => String(id) === String(customer.team._id || customer.team))) {
            return true;
        }
    } else if (user.team && customer.team && String(customer.team._id || customer.team) === String(user.team)) {
        return teamSharingEnabled(user.team)
    }
    return false
}

// IDs of all users in the teams this user has access to.
const getTeamMemberIds = async (user) => {
    let tIds = [];
    if (user.team) tIds.push(user.team);
    if (user.role === 'Supervisor') {
        const supervised = await Team.find({ supervisor: user._id }).select('_id');
        supervised.forEach(t => {
            if (!tIds.some(id => String(id) === String(t._id))) tIds.push(t._id);
        });
    }

    if (tIds.length === 0) return [user._id];

    const members = await User.find({team: {$in: tIds}}).select('_id');
    const ids = members.map((m) => m._id);
    if (!ids.some((id) => String(id) === String(user._id))) ids.push(user._id);
    return ids
}

// Mongo filter matching every deal the user is allowed to see.
// "Sees everything" access is bounded to deals created within the company.
const getVisibleDealFilter = async (user) => {
    if (seesEverything(user)) {
        return {createdBy: {$in: await getCompanyUserIds(user)}};
    }
    if (user.role === 'Supervisor') {
        return {createdBy: {$in: await getTeamMemberIds(user)}};
    }
    return {createdBy: user._id};
}

const canAccessDeal = async (user, deal) => {
    if (!deal.createdBy) return false
    
    if (seesEverything(user)) {
        const ids = await getCompanyUserIds(user);
        return ids.some((id) => String(id) === String(deal.createdBy._id || deal.createdBy));
    }
    if (user.role === 'Supervisor') {
        const ids = await getTeamMemberIds(user);
        return ids.some((id) => String(id) === String(deal.createdBy._id || deal.createdBy));
    }
    
    return String(user._id) === String(deal.createdBy._id || deal.createdBy);
}

// Scope for deleted-deal logs (DealLog documents, keyed by who made the change).
const getVisibleDealLogFilter = async (user) => {
    if (seesEverything(user)) {
        return {changedBy: {$in: await getCompanyUserIds(user)}};
    }
    if (user.role === 'Supervisor') {
        return {changedBy: {$in: await getTeamMemberIds(user)}};
    }
    return {changedBy: user._id};
}

module.exports = {
    seesEverything,
    getVisibleCustomerFilter,
    canViewCustomer,
    getTeamMemberIds,
    getCompanyUserIds,
    getVisibleDealFilter,
    getVisibleDealLogFilter,
    canAccessDeal,
    companyPattern,
    sameCompanyName,
}
