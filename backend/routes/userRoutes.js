const express = require('express')
const mongoose = require('mongoose')
const User = require('../models/User')
const {ROLES} = require('../models/User')
const Team = require('../models/Team')
const {requireAuth, requireRole} = require('../middleware/auth')
const {PERMISSION_KEYS} = require('../middleware/permissions')
const {sameCompanyName} = require('../middleware/teamScope')

const router = express.Router()

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const serializeUser = (user) => user.toSafeJSON()

// Admins manage only their own company's people. Company names are matched
// case-insensitively so "NexGen" and "nexgen" are treated as one company.
const sameCompanyFilter = (user) => ({
    companyName: new RegExp(`^${escapeRegex(user.companyName || '')}$`, 'i'),
})

const isSameCompany = (a, b) =>
    (a.companyName || '').trim().toLowerCase() ===
    (b.companyName || '').trim().toLowerCase()

// Loads the target user for a mutation. Users outside the admin's company are
// reported as not found so the directory never leaks other companies.
const findManagedUser = async (req, res) => {
    const user = await User.findById(req.params.id)
    if (!user || !isSameCompany(req.user, user)) {
        res.status(404).json({message: 'User not found'})
        return null
    }
    return user
}

// GET /api/users/assignable: people the caller can assign work to, such as the
// task assignee pickers. Open to any authenticated user but limited to their
// own company. Returns a plain array, which is the shape those pickers expect.
// Declared before '/' so it is never shadowed by the directory route.
router.get('/assignable', requireAuth, async (req, res) => {
    try {
        const users = await User.find(sameCompanyFilter(req.user))
            .select('_id fullName email role')
            .sort({fullName: 1})
        return res.json(users)
    } catch (err) {
        console.error('List assignable users error:', err)
        return res.status(500).json({message: 'Failed to fetch users'})
    }
})

// GET /api/users: directory of the admin's own company with search and filters
// Query params: search (name/email), role (Admin|Supervisor|User), team (id | 'none')
router.get('/', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const {search, role, team} = req.query
        const filter = {...sameCompanyFilter(req.user)}

        if (search && String(search).trim()) {
            const pattern = new RegExp(escapeRegex(String(search).trim()), 'i')
            filter.$or = [{fullName: pattern}, {email: pattern}]
        }

        if (role) {
            if (!ROLES.includes(role)) {
                return res.status(400).json({message: 'Invalid role filter'})
            }
            filter.role = role
        }

        if (team) {
            if (team === 'none') {
                filter.team = null
            } else if (mongoose.Types.ObjectId.isValid(team)) {
                filter.team = team
            } else {
                return res.status(400).json({message: 'Invalid team filter'})
            }
        }

        const users = await User.find(filter)
            .populate('team', 'name')
            .sort({fullName: 1})

        return res.json({users: users.map(serializeUser)})
    } catch (err) {
        console.error('List users error:', err)
        return res.status(500).json({message: 'Unable to load users'})
    }
})

// PATCH /api/users/:id/role: assign a role to a user in the admin's company
router.patch('/:id/role', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const {role} = req.body || {}
        if (!ROLES.includes(role)) {
            return res.status(400).json({message: 'Role must be one of: ' + ROLES.join(', ')})
        }

        if (String(req.params.id) === String(req.user._id)) {
            return res
                .status(400)
                .json({message: 'You cannot change your own role'})
        }

        const user = await findManagedUser(req, res)
        if (!user) return

        user.role = role
        await user.save()

        // Keep the "one supervisor per team" invariant: if this user was a
        // designated team supervisor and no longer holds the Supervisor role,
        // clear the designation.
        if (role !== 'Supervisor') {
            await Team.updateMany({supervisor: user._id}, {supervisor: null})
        }

        await user.populate('team', 'name')
        return res.json({user: serializeUser(user)})
    } catch (err) {
        console.error('Update role error:', err)
        return res.status(500).json({message: 'Unable to update role'})
    }
})

// PATCH /api/users/:id/team: assign or transfer a user's team
// Body: { teamId: '<id>' | null }
router.patch('/:id/team', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const {teamId} = req.body || {}

        let team = null
        if (teamId) {
            if (!mongoose.Types.ObjectId.isValid(teamId)) {
                return res.status(400).json({message: 'Invalid team'})
            }
            team = await Team.findById(teamId)
            // Another company's team reads as not found
            if (
                !team ||
                (team.company && !sameCompanyName(team.company, req.user.companyName))
            ) {
                return res.status(404).json({message: 'Team not found'})
            }
        }

        const user = await findManagedUser(req, res)
        if (!user) return

        const previousTeam = user.team ? String(user.team) : null
        const nextTeam = team ? String(team._id) : null

        user.team = team ? team._id : null
        await user.save()

        // A supervisor leaving their team stops supervising it.
        if (previousTeam && previousTeam !== nextTeam) {
            await Team.updateMany(
                {_id: previousTeam, supervisor: user._id},
                {supervisor: null}
            )
        }

        await user.populate('team', 'name')
        return res.json({user: serializeUser(user)})
    } catch (err) {
        console.error('Update team error:', err)
        return res.status(500).json({message: 'Unable to update team'})
    }
})

// PATCH /api/users/:id/permissions: grant or revoke individual permission
// overrides for restricted features (Settings -> Permissions, Admin only).
// Body: { permissions: { deleteCustomers?, deleteRecords?, viewAllData? } }
router.patch('/:id/permissions', requireAuth, requireRole('Admin'), async (req, res) => {
    try {
        const updates = req.body?.permissions
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            return res.status(400).json({message: 'permissions object is required'})
        }

        const keys = Object.keys(updates)
        if (keys.length === 0) {
            return res.status(400).json({message: 'No permissions provided'})
        }
        for (const key of keys) {
            if (!PERMISSION_KEYS.includes(key)) {
                return res.status(400).json({message: `Unknown permission: ${key}`})
            }
            if (typeof updates[key] !== 'boolean') {
                return res.status(400).json({message: `Permission ${key} must be true or false`})
            }
        }

        const user = await findManagedUser(req, res)
        if (!user) return

        if (user.role === 'Admin') {
            return res
                .status(400)
                .json({message: 'Admins always have full access; their permissions cannot be edited'})
        }

        for (const key of keys) {
            user.permissions[key] = updates[key]
        }
        await user.save()

        await user.populate('team', 'name')
        return res.json({user: serializeUser(user)})
    } catch (err) {
        console.error('Update permissions error:', err)
        return res.status(500).json({message: 'Unable to update permissions'})
    }
})

module.exports = router
