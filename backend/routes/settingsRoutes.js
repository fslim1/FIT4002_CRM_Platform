const express = require('express')
const SystemSettings = require('../models/SystemSettings')
const Team = require('../models/Team')
const User = require('../models/User')
const {requireAuth, requireRole} = require('../middleware/auth')
const {companyPattern, sameCompanyName} = require('../middleware/teamScope')

const router = express.Router()

const serializeSettings = (settings) => ({
    companyName: settings.companyName,
    timezone: settings.timezone,
    currency: settings.currency,
    language: settings.language,
    updatedAt: settings.updatedAt,
})

// GET /api/settings: the requester's company settings, for any authenticated staff
router.get('/', requireAuth, async (req, res) => {
    try {
        const settings = await SystemSettings.getForCompany(req.user.companyName)
        return res.json({settings: serializeSettings(settings)})
    } catch (err) {
        console.error('Get settings error:', err)
        return res.status(500).json({message: 'Unable to load settings'})
    }
})

// PUT /api/settings: update the admin's company settings (Admin only).
// Renaming the company cascades to every user and team of that company.
router.put('/', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const {companyName, timezone, currency, language} = req.body || {}
        const updates = {}

        const fields = {companyName, timezone, currency, language}
        const limits = {companyName: 120, timezone: 64, currency: 8, language: 40}

        for (const [key, value] of Object.entries(fields)) {
            if (value === undefined) continue
            const trimmed = String(value).trim()
            if (!trimmed) {
                return res.status(400).json({message: `${key} cannot be empty`})
            }
            if (trimmed.length > limits[key]) {
                return res
                    .status(400)
                    .json({message: `${key} cannot be more than ${limits[key]} characters`})
            }
            updates[key] = trimmed
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({message: 'No settings provided'})
        }

        const previousCompany = (req.user.companyName || '').trim()
        const renaming = Boolean(
            updates.companyName &&
            previousCompany &&
            updates.companyName !== previousCompany
        )

        // Renaming into another existing company would merge two companies'
        // data, so reject when the target name is already in use elsewhere.
        if (renaming && !sameCompanyName(updates.companyName, previousCompany)) {
            const taken = await User.findOne({
                companyName: companyPattern(updates.companyName),
            })
            if (taken) {
                return res
                    .status(409)
                    .json({message: 'Another company already uses this name'})
            }
        }

        const settings = await SystemSettings.getForCompany(previousCompany)
        settings.set(updates)
        if (renaming) {
            // Keep the document keyed by the new company name
            settings.companyKey = updates.companyName.toLowerCase()
        }
        await settings.save()

        if (renaming) {
            const previousPattern = companyPattern(previousCompany)
            await User.updateMany(
                {companyName: previousPattern},
                {companyName: updates.companyName}
            )
            await Team.updateMany(
                {company: previousPattern},
                {company: updates.companyName}
            )
        }

        return res.json({settings: serializeSettings(settings)})
    } catch (err) {
        if (err && err.code === 11000) {
            return res
                .status(409)
                .json({message: 'Another company already uses this name'})
        }
        console.error('Update settings error:', err)
        return res.status(500).json({message: 'Unable to update settings'})
    }
})

module.exports = router
