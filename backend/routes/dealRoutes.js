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
const { hasPermission } = require('../middleware/permissions')
const { getDaysInStage, getDaysSinceActivity, getOverdueTaskCount } = require('../services/riskFactors')
const { computeRiskScore } = require('../services/riskScoring')
const { getCompanyKey } = require('../middleware/companyScope')
const DealRiskScore = require('../models/DealRiskScore')


const STAGE_ORDER = [
  'Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation', 'Won', 'Lost'
]

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// GET all deals visible to the requester (team scoped)
// Optional query params: ?userId=<id> or ?teamId=<id>
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId, teamId } = req.query

    if (userId) {
      const targetUser = await User.findById(userId).select('_id team companyName')
      if (!targetUser) return res.status(404).json({ message: 'User not found' })

      if (req.user.role === 'Admin' || hasPermission(req.user, 'viewAllData')) {
        const companyIds = await getCompanyUserIds(req.user)
        const inCompany = companyIds.some(id => String(id) === String(userId))
        if (!inCompany) return res.status(403).json({ message: 'Access denied' })
      } else if (req.user.role === 'Supervisor') {
        const teamIds = await getTeamMemberIds(req.user)
        const inTeam = teamIds.some(id => String(id) === String(userId))
        if (!inTeam) return res.status(403).json({ message: 'Access denied' })
      } else {
        return res.status(403).json({ message: 'Insufficient permissions' })
      }

      const deals = await Deal.find({ createdBy: targetUser._id }).sort({ createdAt: -1 })
      return res.json(deals)
    }

    if (teamId) {
      if (req.user.role !== 'Admin' && !hasPermission(req.user, 'viewAllData')) {
        return res.status(403).json({ message: 'Insufficient permissions' })
      }
      const teamMembers = await User.find({ team: teamId }).select('_id')
      const memberIds = teamMembers.map(m => m._id)
      const deals = await Deal.find({ createdBy: { $in: memberIds } }).sort({ createdAt: -1 })
      return res.json(deals)
    }

    const scope = await getVisibleDealFilter(req.user)
    const deals = await Deal.find(scope).sort({ createdAt: -1 })
    res.json(deals)
  } catch {
    res.status(500).json({ message: 'Failed to fetch deals' })
  }
})

// GET all visible deal risk scores keyed by dealId
router.get('/risks', requireAuth, async (req, res) => {
  try {
    // 1. Prevent aggressive browser 304 caching while developing
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    // 2. Fetch all risk scores directly from the collection
    const risks = await DealRiskScore.find({}).lean();

    // 3. Map into a dictionary keyed by stringified dealId
    const riskByDealId = {};
    risks.forEach((risk) => {
      if (risk.dealId) {
        riskByDealId[String(risk.dealId)] = {
          dealId: String(risk.dealId),
          riskLevel: risk.riskLevel || 'Low',
          score: risk.score ?? 0,
          reason: risk.reason || '',
          updatedAt: risk.updatedAt,
        };
      }
    });

    return res.status(200).json(riskByDealId);
  } catch (error) {
    console.error('Failed to fetch deal risks:', error);
    return res.status(500).json({ message: 'Failed to fetch deal risks' });
  }
});

// GET all status logs across visible deals (for Deal History)
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const scope = await getVisibleDealFilter(req.user)
    const deals = await Deal.find({ ...scope, 'statusLogs.0': { $exists: true } }, 'name statusLogs')
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

router.post('/', requireAuth, requireRole('User', 'Admin'), async (req, res) => {
  try {
    const { name, company, price, priority, probability, assignee, customer } = req.body

    if (customer) {
      const customerScope = await getVisibleCustomerFilter(req.user)
      const existingCustomer = await Customer.findOne({
        $and: [
          { fullName: { $regex: `^${escapeRegex(customer)}$`, $options: 'i' } },
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
      stageEnteredDate: new Date(),
      createdBy: req.user._id
    })
    await deal.save()
    res.status(201).json(deal)
  } catch {
    res.status(500).json({ message: 'Failed to create deal' })
  }
})

router.patch('/:id/stage', requireAuth, async (req, res) => {
  try {
    const { stage } = req.body
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
    if (!(await canAccessDeal(req.user, deal)))
      return res.status(403).json({ message: 'You do not have access to this deal' })

    const currentIndex = STAGE_ORDER.indexOf(deal.stage)
    const nextIndex = STAGE_ORDER.indexOf(stage)

    if (currentIndex === -1 || nextIndex === -1)
      return res.status(400).json({ message: 'Invalid stage' })

    if (nextIndex < currentIndex || ['Won', 'Lost'].includes(deal.stage))
      return res.status(400).json({ message: 'Stage transition not allowed' })

    if (['Won', 'Lost'].includes(stage))
      return res.status(400).json({ message: 'Use /outcome to mark Won or Lost' })

    deal.statusLogs.push({ fromStage: deal.stage, toStage: stage, changedBy: req.user._id })
    deal.stage = stage
    deal.stageEnteredDate = new Date()
    await deal.save()
    res.json(deal)
  } catch {
    res.status(500).json({ message: 'Failed to update deal stage' })
  }
})

router.patch('/:id/outcome', requireAuth, async (req, res) => {
  try {
    const { outcome } = req.body
    if (!['Won', 'Lost'].includes(outcome))
      return res.status(400).json({ message: 'Outcome must be Won or Lost' })

    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
    if (!(await canAccessDeal(req.user, deal)))
      return res.status(403).json({ message: 'You do not have access to this deal' })

    if (['Won', 'Lost'].includes(deal.stage))
      return res.status(400).json({ message: 'Deal already finalised' })

    deal.statusLogs.push({ fromStage: deal.stage, toStage: outcome, changedBy: req.user._id })
    deal.stage = outcome
    deal.stageEnteredDate = new Date()
    await deal.save()
    res.json(deal)
  } catch {
    res.status(500).json({ message: 'Failed to update deal outcome' })
  }
})

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

// GET /api/deals/:id/risk-factors — H3, H4, H5 raw signals only, no scoring.
router.get('/:id/risk-factors', requireAuth, async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
    if (!(await canAccessDeal(req.user, deal)))
      return res.status(403).json({ message: 'You do not have access to this deal' })

    const [daysSinceActivity, overdueTaskCount] = await Promise.all([
      getDaysSinceActivity(deal),
      getOverdueTaskCount(deal._id),
    ])

    res.json({
      dealId: deal._id,
      daysInStage: getDaysInStage(deal),
      daysSinceActivity: daysSinceActivity.days,
      neverContacted: daysSinceActivity.neverContacted,
      overdueTaskCount,
    })
  } catch (err) {
    console.error('Get risk factors error:', err)
    res.status(500).json({ message: 'Failed to compute risk factors' })
  }
})

// GET /api/deals/:id/risk-score — H7. Always computed fresh from live data
// (never a stale cached job result), then persisted for history/reporting.
router.get('/:id/risk-score', requireAuth, async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
    if (!(await canAccessDeal(req.user, deal)))
      return res.status(403).json({ message: 'You do not have access to this deal' })

    const companyKey = getCompanyKey(req.user)
    const result = await computeRiskScore(deal, companyKey)

    await DealRiskScore.findOneAndUpdate(
      { companyKey, deal: deal._id },
      {
        companyKey,
        deal: deal._id,
        riskLevel: result.riskLevel,
        points: result.points,
        factors: result.factors,
        reasons: result.reasons,
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    )

    res.json({ dealId: deal._id, ...result })
  } catch (err) {
    console.error('Get risk score error:', err)
    res.status(500).json({ message: 'Failed to compute risk score' })
  }
})

module.exports = router