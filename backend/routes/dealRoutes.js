const express = require('express')
const router = express.Router()
const Deal = require('../models/Deal')
const { requireAuth, requireRole } = require('../middleware/auth')
const {requirePermission} = require('../middleware/permissions')
const DealLog = require('../models/DealLog')
const Customer = require('../models/Customer')
const User = require('../models/User')
const {
    getVisibleDealFilter,
    getVisibleCustomerFilter,
    getVisibleDealLogFilter,
    canAccessDeal,
    getCompanyUserIds,
    getTeamMemberIds
} = require('../middleware/teamScope')
const {hasPermission} = require('../middleware/permissions')


const STAGE_ORDER = [
  'Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation', 'Won', 'Lost'
]

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// GET all deals visible to the requester (team scoped)
// Optional query params: ?userId=<id> or ?teamId=<id>
router.get('/', requireAuth, async (req, res) => {
  try {
      const {userId, teamId} = req.query

      if (userId) {
          // Validate the target user exists and is accessible
          const targetUser = await User.findById(userId).select('_id team companyName')
          if (!targetUser) return res.status(404).json({message: 'User not found'})

          // Admin/viewAllData: any user in their company
          // Supervisor: only users in their own team
          if (req.user.role === 'Admin' || hasPermission(req.user, 'viewAllData')) {
              const companyIds = await getCompanyUserIds(req.user)
              const inCompany = companyIds.some(id => String(id) === String(userId))
              if (!inCompany) return res.status(403).json({message: 'Access denied'})
          } else if (req.user.role === 'Supervisor') {
              const teamIds = await getTeamMemberIds(req.user)
              const inTeam = teamIds.some(id => String(id) === String(userId))
              if (!inTeam) return res.status(403).json({message: 'Access denied'})
          } else {
              return res.status(403).json({message: 'Insufficient permissions'})
          }

          const deals = await Deal.find({createdBy: targetUser._id}).sort({createdAt: -1})
          return res.json(deals)
      }

      if (teamId) {
          // Only Admin or Supervisor with viewAllData
          if (req.user.role !== 'Admin' && !hasPermission(req.user, 'viewAllData')) {
              return res.status(403).json({message: 'Insufficient permissions'})
          }
          const teamMembers = await User.find({team: teamId}).select('_id')
          const memberIds = teamMembers.map(m => m._id)
          const deals = await Deal.find({createdBy: {$in: memberIds}}).sort({createdAt: -1})
          return res.json(deals)
      }

      // Default: return all deals visible to this user
      const scope = await getVisibleDealFilter(req.user)
      const deals = await Deal.find(scope).sort({createdAt: -1})
    res.json(deals)
  } catch {
    res.status(500).json({ message: 'Failed to fetch deals' })
  }
})

// GET all status logs across visible deals (for Deal History)
router.get('/logs', requireAuth, async (req, res) => {
  try {
      const scope = await getVisibleDealFilter(req.user)
      const deals = await Deal.find({...scope, 'statusLogs.0': {$exists: true}}, 'name statusLogs')
    const logs = []
    deals.forEach(deal => {
      deal.statusLogs.forEach(log => {
        logs.push({
          dealName: deal.name,
          fromStage: log.fromStage,
          toStage: log.toStage,
          changedAt: log.changedAt
        })
      })
    })

      // Also pull deleted deal logs, scoped the same way as live deals
      const deletedLogs = await DealLog.find(await getVisibleDealLogFilter(req.user)).lean()
    deletedLogs.forEach(log => {
      logs.push({
        dealName: log.dealName,
        fromStage: log.fromStage,
        toStage: log.toStage,
        changedAt: log.changedAt
      })
    })

    logs.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
    res.json(logs)
  } catch {
    res.status(500).json({ message: 'Failed to fetch logs' })
  }
})


// CREATE deal
// CREATE deal
router.post('/', requireAuth, requireRole('User', 'Admin'), async (req, res) => {
  try {
    const { name, company, price, priority, probability, assignee, customer } = req.body

    if (customer) {
        // Deals can only be linked to customers the creator can actually see
        const customerScope = await getVisibleCustomerFilter(req.user)
      const existingCustomer = await Customer.findOne({
          $and: [
              {fullName: {$regex: `^${escapeRegex(customer)}$`, $options: 'i'}},
              customerScope
          ]
      })
      if (!existingCustomer) {
        return res.status(400).json({ message: 'Customer does not exist in the system' })
      }
    }

    if (assignee) {
      const existingUser = await User.findOne({
        fullName: { $regex: `^${escapeRegex(assignee)}$`, $options: 'i' }
      })
      if (!existingUser) {
        return res.status(400).json({ message: 'Assignee is not a registered user' })
      }
    }

    const deal = new Deal({
      name, company, price, priority, probability, assignee, customer,
      stage: 'Qualified',
      createdBy: req.user._id
    })
    await deal.save()
    res.status(201).json(deal)
  } catch {
    res.status(500).json({ message: 'Failed to create deal' })
  }
})

// UPDATE deal stage (drag & drop within pipeline)
router.patch('/:id/stage', requireAuth, async (req, res) => {
  try {
    const { stage } = req.body
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
      if (!(await canAccessDeal(req.user, deal)))
          return res.status(403).json({message: 'You do not have access to this deal'})

    const currentIndex = STAGE_ORDER.indexOf(deal.stage)
    const nextIndex = STAGE_ORDER.indexOf(stage)

    if (currentIndex === -1 || nextIndex === -1)
      return res.status(400).json({ message: 'Invalid stage' })

    if (nextIndex < currentIndex || ['Won', 'Lost'].includes(deal.stage))
      return res.status(400).json({ message: 'Stage transition not allowed' })

    // Won/Lost must use /outcome route
    if (['Won', 'Lost'].includes(stage))
      return res.status(400).json({ message: 'Use /outcome to mark Won or Lost' })

    deal.statusLogs.push({ fromStage: deal.stage, toStage: stage, changedBy: req.user._id })
    deal.stage = stage
    await deal.save()
    res.json(deal)
  } catch {
    res.status(500).json({ message: 'Failed to update deal stage' })
  }
})

// MARK deal as Won or Lost
router.patch('/:id/outcome', requireAuth, async (req, res) => {
  try {
    const { outcome } = req.body
    if (!['Won', 'Lost'].includes(outcome))
      return res.status(400).json({ message: 'Outcome must be Won or Lost' })

    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
      if (!(await canAccessDeal(req.user, deal)))
          return res.status(403).json({message: 'You do not have access to this deal'})

    if (['Won', 'Lost'].includes(deal.stage))
      return res.status(400).json({ message: 'Deal already finalised' })

    deal.statusLogs.push({ fromStage: deal.stage, toStage: outcome, changedBy: req.user._id })
    deal.stage = outcome
    await deal.save()
    res.json(deal)
  } catch {
    res.status(500).json({ message: 'Failed to update deal outcome' })
  }
})

// DELETE deal. Admin by default; grantable per person via
// Settings -> Permissions. Non-admin holders stay team scoped.
router.delete('/:id', requireAuth, requirePermission('deleteRecords'), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
      if (!(await canAccessDeal(req.user, deal)))
          return res.status(403).json({message: 'You do not have access to this deal'})

    await DealLog.create({
      dealName: deal.name,
      fromStage: deal.stage,
      toStage: 'Deleted',
      changedBy: req.user._id
    })

    await Deal.findByIdAndDelete(req.params.id)
    res.json({ message: 'Deal deleted', dealName: deal.name })
  } catch {
    res.status(500).json({ message: 'Failed to delete deal' })
  }
})

// UPDATE deal probability
router.patch('/:id/probability', requireAuth, async (req, res) => {
    try {
        const {probability} = req.body
        if (typeof probability !== 'number' || probability < 0 || probability > 100)
            return res.status(400).json({message: 'Probability must be a number between 0 and 100'})

        const deal = await Deal.findByIdAndUpdate(
            req.params.id,
            {probability},
            {new: true, runValidators: true}
        )
        if (!deal) return res.status(404).json({message: 'Deal not found'})
        res.json(deal)
    } catch {
        res.status(500).json({message: 'Failed to update probability'})
    }
})

module.exports = router