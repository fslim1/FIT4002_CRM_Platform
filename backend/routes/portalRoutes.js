const express = require('express')
const rateLimit = require('express-rate-limit')
const Customer = require('../models/Customer')
const CustomerAccount = require('../models/CustomerAccount')
const Deal = require('../models/Deal')
const {signPortalToken, requirePortalAuth} = require('../middleware/portalAuth')

const router = express.Router()

const portalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {message: 'Too many attempts in a short period. Please try again later.'},
})

const STAGE_ORDER = [
    'Qualified',
    'Contact Made',
    'Demo Scheduled',
    'Proposal Made',
    'Negotiation',
    'Won',
    'Lost',
]

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isValidEmail = (email) =>
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Only the customer's own contact details are ever exposed: no internal
// interactions, attachments, notes or ownership data.
const serializeProfile = (customer) => ({
    id: customer._id,
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    address: customer.address,
    designation: customer.designation,
    department: customer.department,
})

// The portal only exposes stage progression and the person in charge.
// `stages` is the happy path (Lost is reported via `stage` instead) and
// `progressIndex` is the furthest happy-path stage the deal has reached.
const HAPPY_PATH = STAGE_ORDER.slice(0, 6) // Qualified … Won

const serializeDeal = (deal) => {
    let progressIndex
    if (deal.stage === 'Lost') {
        const lostLog = [...(deal.statusLogs || [])]
            .reverse()
            .find((log) => log.toStage === 'Lost')
        const from = lostLog ? HAPPY_PATH.indexOf(lostLog.fromStage) : -1
        progressIndex = from >= 0 ? from : 0
    } else {
        progressIndex = Math.max(HAPPY_PATH.indexOf(deal.stage), 0)
    }

    return {
        id: deal._id,
        name: deal.name,
        stage: deal.stage,
        progressIndex,
        stages: HAPPY_PATH,
        inCharge: deal.assignee || deal.createdBy?.fullName || 'Sales Team',
        updatedAt: deal.updatedAt,
    }
}

// POST /api/portal/register: customers create a portal login.
// Registration is only possible for email addresses that already exist as a
// customer record in the CRM, so a login can never expose someone else's data.
router.post('/register', portalLimiter, async (req, res) => {
    try {
        const {email, password} = req.body || {}

        if (!email || !password) {
            return res.status(400).json({message: 'Email and password are required'})
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({message: 'Please provide a valid email'})
        }
        if (
            typeof password !== 'string' ||
            password.length < 8 ||
            !/[a-z]/.test(password) ||
            !/[A-Z]/.test(password) ||
            !/[0-9]/.test(password)
        ) {
            return res.status(400).json({
                message:
                    'Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number',
            })
        }

        const normalized = email.toLowerCase().trim()

        const customer = await Customer.findOne({
            email: new RegExp(`^${escapeRegex(normalized)}$`, 'i'),
        }).sort({createdAt: -1})
        if (!customer) {
            return res.status(404).json({
                message:
                    'We could not find a customer record for this email. Please contact your account manager.',
            })
        }

        const existing = await CustomerAccount.findOne({email: normalized})
        if (existing) {
            return res
                .status(409)
                .json({message: 'An account with this email already exists. Please log in.'})
        }

        const account = await CustomerAccount.create({
            email: normalized,
            password,
            customer: customer._id,
        })

        const token = signPortalToken(account._id)
        return res.status(201).json({token, profile: serializeProfile(customer)})
    } catch (err) {
        if (err && err.code === 11000) {
            return res
                .status(409)
                .json({message: 'An account with this email already exists. Please log in.'})
        }
        console.error('Portal register error:', err)
        return res.status(500).json({message: 'Unable to create portal account'})
    }
})

// POST /api/portal/login: customer portal login
router.post('/login', portalLimiter, async (req, res) => {
    try {
        const {email, password} = req.body || {}
        if (!email || !password) {
            return res.status(400).json({message: 'Email and password are required'})
        }

        const account = await CustomerAccount.findOne({email: String(email).toLowerCase().trim()})
            .select('+password')
            .populate('customer')
        if (!account || !account.customer) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        const ok = await account.comparePassword(password)
        if (!ok) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        const token = signPortalToken(account._id)
        return res.json({token, profile: serializeProfile(account.customer)})
    } catch (err) {
        console.error('Portal login error:', err)
        return res.status(500).json({message: 'Unable to log in'})
    }
})

// GET /api/portal/me: the customer's own profile, and only their own data
router.get('/me', requirePortalAuth, async (req, res) => {
    return res.json({profile: serializeProfile(req.customer)})
})

// PUT /api/portal/profile: update own contact details
router.put('/profile', requirePortalAuth, async (req, res) => {
    try {
        const {fullName, email, phone, company, address} = req.body || {}
        const customer = req.customer

        const updates = {fullName, email, phone, company, address}
        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) continue
            const trimmed = String(value).trim()
            if (!trimmed) {
                return res.status(400).json({message: `${key} cannot be empty`})
            }
            if (key === 'email' && !isValidEmail(trimmed)) {
                return res.status(400).json({message: 'Please provide a valid email'})
            }
            customer[key] = key === 'email' ? trimmed.toLowerCase() : trimmed
        }

        // Keep the portal login in sync when the contact email changes.
        const account = req.portalAccount
        if (customer.email !== account.email) {
            const clash = await CustomerAccount.findOne({
                email: customer.email,
                _id: {$ne: account._id},
            })
            if (clash) {
                return res
                    .status(409)
                    .json({message: 'Another portal account already uses this email'})
            }
            account.email = customer.email
            await account.save()
        }

        // Surface the change to the sales team in the interaction timeline.
        customer.interactions.push({
            type: 'Note',
            details: 'Customer updated their contact details via the self-service portal',
            author: customer.fullName,
        })

        await customer.save()
        return res.json({profile: serializeProfile(customer)})
    } catch (err) {
        console.error('Portal profile update error:', err)
        return res.status(500).json({message: 'Unable to update profile'})
    }
})

// GET /api/portal/deals: stage progression and person in charge only
router.get('/deals', requirePortalAuth, async (req, res) => {
    try {
        const deals = await Deal.find({
            customer: new RegExp(`^${escapeRegex(req.customer.fullName)}$`, 'i'),
        })
            .select('name stage assignee createdBy updatedAt statusLogs')
            .populate('createdBy', 'fullName')
            .sort({updatedAt: -1})

        return res.json({deals: deals.map(serializeDeal)})
    } catch (err) {
        console.error('Portal deals error:', err)
        return res.status(500).json({message: 'Unable to load deals'})
    }
})

module.exports = router
