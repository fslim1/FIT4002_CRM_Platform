const express = require('express')
const RiskWeightSetting = require('../models/RiskWeightSetting')
const {requireAuth, requireRole} = require('../middleware/auth')
const {getCompanyKey, companyScopeFilter} = require('../middleware/companyScope')
const {
    DEFAULT_INACTIVITY_THRESHOLDS,
    DEFAULT_STAGE_RISK_POINTS,
    DEFAULT_INACTIVITY_POINTS,
    DEFAULT_OVERDUE_TASK_POINTS,
    DEFAULT_LABEL_THRESHOLDS,
} = require('../services/defaultRiskWeights')

const router = express.Router()

const DEFAULTS = {
    inactivityThresholds: DEFAULT_INACTIVITY_THRESHOLDS,
    stageRiskPoints: DEFAULT_STAGE_RISK_POINTS,
    inactivityPoints: DEFAULT_INACTIVITY_POINTS,
    overdueTaskPoints: DEFAULT_OVERDUE_TASK_POINTS,
    scoreLabelThresholds: DEFAULT_LABEL_THRESHOLDS,
}

const KNOWN_KEYS = Object.keys(DEFAULTS)

// GET /api/risk-weights — every weight setting for the requester's company,
// merged with defaults so the response always shows a complete, usable set.
router.get('/', requireAuth, async (req, res) => {
    try {
        const saved = await RiskWeightSetting.find(companyScopeFilter(req.user))
        const savedMap = new Map(saved.map((s) => [s.key, s.value]))

        const settings = KNOWN_KEYS.map((key) => ({
            key,
            value: savedMap.has(key) ? savedMap.get(key) : DEFAULTS[key],
            isDefault: !savedMap.has(key),
        }))

        return res.json({settings})
    } catch (err) {
        console.error('List risk weights error:', err)
        return res.status(500).json({message: 'Unable to load weight settings'})
    }
})

// PUT /api/risk-weights/:key — upsert one setting for the admin's own company
router.put('/:key', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const {key} = req.params
        const {value} = req.body || {}

        if (!KNOWN_KEYS.includes(key)) {
            return res.status(400).json({message: `Unknown setting key: ${key}`})
        }
        if (value === undefined || value === null) {
            return res.status(400).json({message: 'value is required'})
        }

        const companyKey = getCompanyKey(req.user)
        const setting = await RiskWeightSetting.findOneAndUpdate(
            {companyKey, key},
            {companyKey, key, value},
            {upsert: true, new: true, setDefaultsOnInsert: true}
        )

        return res.json({key: setting.key, value: setting.value, isDefault: false})
    } catch (err) {
        console.error('Update risk weight error:', err)
        return res.status(500).json({message: 'Unable to update weight setting'})
    }
})

module.exports = router