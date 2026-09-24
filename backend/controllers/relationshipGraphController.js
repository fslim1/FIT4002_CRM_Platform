const mongoose = require('mongoose')

const Customer = require('../models/Customer')
const Deal = require('../models/Deal')
const Task = require('../models/Task')
const User = require('../models/User')
const {
    getVisibleCustomerFilter,
    getVisibleDealFilter,
    canViewCustomer,
    seesEverything,
    getCompanyUserIds,
    getTeamMemberIds,
} = require('../middleware/teamScope')
const {hasPermission} = require('../middleware/permissions')
const {ACTIVITY_TYPES, buildGraph, cutoffFrom} = require('../services/relationshipGraph')
const {contactsPipeline, dealsPipeline} = require('../services/relationshipGraphQueries')

// Describes the viewer's reach so the panel can say whose records the graph was
// built from. Two people with different permissions see a differently shaped
// graph of the same account, which is intended rather than a fault.
const scopeFor = (user) => {
    if (seesEverything(user)) {
        return {role: user.role, viewAllData: true, label: "your company's records"}
    }
    if (user.role === 'Supervisor') {
        return {role: user.role, viewAllData: false, label: "your team's records"}
    }
    return {role: user.role, viewAllData: hasPermission(user, 'viewAllData'), label: 'the records you have access to'}
}

// GET /api/relationship-graph/account/:customerId
//
// Read-only by design: this endpoint never creates, edits or deletes
// interaction data, and the router exposes no other verb.
//
// Scope is enforced in the database queries, never by filtering in Node and
// never in the browser. Records outside the viewer's scope are absent from
// the result set entirely, so they cannot be named, greyed out, or implied by a
// connection that points at nothing.
const getAccountGraph = async (req, res) => {
    const startedAt = Date.now()

    try {
        const {customerId} = req.params

        // A malformed id must not become a CastError and a 500.
        if (!mongoose.isValidObjectId(customerId)) {
            return res.status(400).json({message: 'Invalid customer id'})
        }

        // The focus record and the viewer's two scope filters do not depend on
        // one another, and each costs its own round trip, so they are started
        // together and the slowest becomes the cost rather than their sum. An
        // id that turns out to be unreadable wastes the two filters, which is
        // the cheaper trade: that path ends the request either way.
        const [focus, customerScope, dealScope] = await Promise.all([
            Customer.findById(customerId).select('_id fullName company owner team'),
            getVisibleCustomerFilter(req.user),
            getVisibleDealFilter(req.user),
        ])

        if (!focus) return res.status(404).json({message: 'Customer not found'})

        // Attempted access outside the viewer's scope is denied, and the body
        // names no record.
        if (!(await canViewCustomer(req.user, focus))) {
            return res.status(403).json({message: 'You do not have access to this account'})
        }

        const now = new Date()
        const cutoff = cutoffFrom(now)
        const companyRaw = typeof focus.company === 'string' ? focus.company : ''

        const contacts = await Customer.aggregate(
            contactsPipeline({
                scopeFilter: customerScope,
                focusId: focus._id,
                companyRaw,
                cutoff,
                activityTypes: ACTIVITY_TYPES,
            })
        )

        // Name keys computed by MongoDB above, fed back into the deal query, so
        // both sides of that comparison were normalised the same way.
        const contactNameKeys = [...new Set(contacts.map((c) => c.nameKey).filter(Boolean))]

        const deals = await Deal.aggregate(
            dealsPipeline({
                scopeFilter: dealScope,
                companyRaw,
                contactNameKeys,
            })
        )

        const contactIds = contacts
            .map((contact) => contact._id)
            .filter((id) => mongoose.isValidObjectId(id))
        const dealIds = deals
            .map((deal) => deal._id)
            .filter((id) => mongoose.isValidObjectId(id))

        let linkedTasks = []
        if (contactIds.length > 0 && dealIds.length > 0) {
            let visibleTaskUserIds
            if (seesEverything(req.user)) {
                visibleTaskUserIds = await getCompanyUserIds(req.user)
            } else if (req.user.role === 'Supervisor') {
                visibleTaskUserIds = await getTeamMemberIds(req.user)
            } else {
                visibleTaskUserIds = [req.user._id]
            }

            linkedTasks = await Task.find({
                customer: {$in: contactIds},
                deal: {$in: dealIds},
                $or: [
                    {createdBy: {$in: visibleTaskUserIds}},
                    {assignedTo: {$in: visibleTaskUserIds}},
                ],
            }).select('customer deal').lean()
        }

        const userIds = [
            ...new Set(
                [
                    ...contacts.map((c) => c.owner),
                    ...deals.map((d) => d.createdBy),
                ]
                    .filter(Boolean)
                    .map(String)
            ),
        ]
        const users = userIds.length
            ? await User.find({_id: {$in: userIds}}).select('fullName').lean()
            : []

        // contactsPipeline always returns the focus contact. Its absence means
        // the record was deleted between the two queries.
        const focusContact = contacts.find((c) => String(c._id) === String(focus._id))
        if (!focusContact) return res.status(404).json({message: 'Customer not found'})

        const dealContactLinks = linkedTasks.map((task) => ({
            deal: task.deal,
            contact: task.customer,
        }))
        const graph = buildGraph({focusContact, contacts, deals, users, dealContactLinks})

        return res.json({
            ...graph,
            meta: {
                ...graph.meta,
                generatedAt: now.toISOString(),
                buildMs: Date.now() - startedAt,
                scope: scopeFor(req.user),
            },
        })
    } catch (error) {
        console.error('Relationship graph error:', error)
        return res.status(500).json({message: 'Failed to build the relationship graph'})
    }
}

module.exports = {getAccountGraph, scopeFor}
