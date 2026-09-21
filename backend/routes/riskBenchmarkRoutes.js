const express = require('express')
const mongoose = require('mongoose')
const RiskBenchmark = require('../models/RiskBenchmark')
const {requireAuth, requireRole} = require('../middleware/auth')
const {getCompanyKey, companyScopeFilter} = require('../middleware/companyScope')

const router = express.Router()

const serialize = (b) => ({
    id: b._id,
    dealType: b.dealType,
    stage: b.stage,
    healthyMaxDays: b.healthyMaxDays,
    warningMaxDays: b.warningMaxDays,
    highRiskMinDays: b.highRiskMinDays,
    updatedAt: b.updatedAt,
})

// H6 AC1: healthy < warning < highRisk must hold, or the three tiers make no sense.
const validateOrdering = (healthyMaxDays, warningMaxDays, highRiskMinDays) => {
    if (healthyMaxDays >= warningMaxDays) {
        return 'healthyMaxDays must be less than warningMaxDays'
    }
    if (warningMaxDays >= highRiskMinDays) {
        return 'warningMaxDays must be less than highRiskMinDays'
    }
    return null
}

// GET /api/risk-benchmarks — every benchmark belonging to the requester's company.
// Any authenticated user can read (per the client's visibility rules — everyone
// can see the reasoning behind their own deal's risk score); only Admin can write.
router.get('/', requireAuth, async (req, res) => {
    try {
        const benchmarks = await RiskBenchmark.find(companyScopeFilter(req.user)).sort({
            dealType: 1,
            stage: 1,
        })
        return res.json({benchmarks: benchmarks.map(serialize)})
    } catch (err) {
        console.error('List risk benchmarks error:', err)
        return res.status(500).json({message: 'Unable to load benchmarks'})
    }
})

// POST /api/risk-benchmarks — create a benchmark row for the admin's own company
router.post('/', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const {dealType, stage, healthyMaxDays, warningMaxDays, highRiskMinDays} = req.body || {}

        if (!stage) return res.status(400).json({message: 'Stage is required'})
        if ([healthyMaxDays, warningMaxDays, highRiskMinDays].some((v) => typeof v !== 'number' || v < 0)) {
            return res
                .status(400)
                .json({message: 'healthyMaxDays, warningMaxDays and highRiskMinDays must be non-negative numbers'})
        }

        const orderingError = validateOrdering(healthyMaxDays, warningMaxDays, highRiskMinDays)
        if (orderingError) return res.status(400).json({message: orderingError})

        const companyKey = getCompanyKey(req.user)
        const dealTypeValue = (dealType || 'Standard').trim()

        const existing = await RiskBenchmark.findOne({companyKey, dealType: dealTypeValue, stage})
        if (existing) {
            return res.status(409).json({message: 'A benchmark for this deal type and stage already exists'})
        }

        const benchmark = await RiskBenchmark.create({
            companyKey,
            companyName: req.user.companyName,
            dealType: dealTypeValue,
            stage,
            healthyMaxDays,
            warningMaxDays,
            highRiskMinDays,
        })

        return res.status(201).json({benchmark: serialize(benchmark)})
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(409).json({message: 'A benchmark for this deal type and stage already exists'})
        }
        console.error('Create risk benchmark error:', err)
        return res.status(500).json({message: 'Unable to create benchmark'})
    }
})

// PATCH /api/risk-benchmarks/:id — update a benchmark, own company only
router.patch('/:id', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({message: 'Invalid benchmark ID'})
        }

        // The companyKey check here is what actually stops a guessed ID from
        // ever touching another company's record — findById alone is not enough.
        const benchmark = await RiskBenchmark.findOne(companyScopeFilter(req.user, {_id: req.params.id}))
        if (!benchmark) return res.status(404).json({message: 'Benchmark not found'})

        const {healthyMaxDays, warningMaxDays, highRiskMinDays} = req.body || {}
        const next = {
            healthyMaxDays: healthyMaxDays ?? benchmark.healthyMaxDays,
            warningMaxDays: warningMaxDays ?? benchmark.warningMaxDays,
            highRiskMinDays: highRiskMinDays ?? benchmark.highRiskMinDays,
        }

        for (const [key, value] of Object.entries({healthyMaxDays, warningMaxDays, highRiskMinDays})) {
            if (value === undefined) continue
            if (typeof value !== 'number' || value < 0) {
                return res.status(400).json({message: `${key} must be a non-negative number`})
            }
        }

        const orderingError = validateOrdering(next.healthyMaxDays, next.warningMaxDays, next.highRiskMinDays)
        if (orderingError) return res.status(400).json({message: orderingError})

        benchmark.healthyMaxDays = next.healthyMaxDays
        benchmark.warningMaxDays = next.warningMaxDays
        benchmark.highRiskMinDays = next.highRiskMinDays

        await benchmark.save()
        return res.json({benchmark: serialize(benchmark)})
    } catch (err) {
        console.error('Update risk benchmark error:', err)
        return res.status(500).json({message: 'Unable to update benchmark'})
    }
})

// DELETE /api/risk-benchmarks/:id — remove a benchmark, own company only
router.delete('/:id', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({message: 'Invalid benchmark ID'})
        }

        const benchmark = await RiskBenchmark.findOneAndDelete(
            companyScopeFilter(req.user, {_id: req.params.id})
        )
        if (!benchmark) return res.status(404).json({message: 'Benchmark not found'})

        return res.json({message: 'Benchmark deleted'})
    } catch (err) {
        console.error('Delete risk benchmark error:', err)
        return res.status(500).json({message: 'Unable to delete benchmark'})
    }
})

module.exports = router