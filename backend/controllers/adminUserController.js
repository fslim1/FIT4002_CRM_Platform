const mongoose = require('mongoose')
const User = require('../models/User')
const {ROLES} = require('../models/User')
const Team = require('../models/Team')
const Customer = require('../models/Customer')
const Deal = require('../models/Deal')
const DealLog = require('../models/DealLog')
const Task = require('../models/Task')
const Notification = require('../models/Notification')

// Helpers
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sameCompanyFilter = (user) => ({
    companyName: new RegExp(`^${escapeRegex(user.companyName || '')}$`, 'i'),
})

const isSameCompany = (a, b) =>
    (a.companyName || '').trim().toLowerCase() ===
    (b.companyName || '').trim().toLowerCase()

const isValidEmail = (email) =>
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Roles that Admins are permitted to create via user management.
// Admins cannot create another Admin through this UI endpoint.
const CREATABLE_ROLES = ['User', 'Supervisor']

// GET /api/admin/users
// List all users in the admin's company with optional search and filters.
// Query params: search (name/email), role, status ('active'|'inactive')
exports.listUsers = async (req, res) => {
    try {
        const {search, role, status} = req.query
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

        if (status) {
            if (status === 'active') filter.isActive = {$ne: false}
            else if (status === 'inactive') filter.isActive = false
            else return res.status(400).json({message: 'status must be "active" or "inactive"'})
        }

        const users = await User.find(filter)
            .populate('team', 'name')
            .sort({fullName: 1})

        return res.json({users: users.map((u) => u.toSafeJSON())})
    } catch (err) {
        console.error('Admin listUsers error:', err)
        return res.status(500).json({message: 'Unable to load users'})
    }
}

// POST /api/admin/users
// Create a new salesperson or supervisor in the admin's company.
// Body: { fullName, email, password, confirmPassword, role, teamId? }
exports.createUser = async (req, res) => {
    try {
        const {fullName, email, password, confirmPassword, role, teamId} =
            req.body || {}

        if (!fullName || !email || !password || !role) {
            return res.status(400).json({
                message: 'Full name, email, password and role are required',
            })
        }
        if (fullName.trim().length > 120) {
            return res
                .status(400)
                .json({message: 'Full name cannot be more than 120 characters'})
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({message: 'Please provide a valid email'})
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res
                .status(400)
                .json({message: 'Password must be at least 8 characters'})
        }
        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res
                .status(400)
                .json({message: 'Password and confirm password do not match'})
        }
        if (!CREATABLE_ROLES.includes(role)) {
            return res.status(400).json({
                message: `Role must be one of: ${CREATABLE_ROLES.join(', ')}. Admin accounts must be created via the seed script.`,
            })
        }

        const existing = await User.findOne({email: email.toLowerCase().trim()})
        if (existing) {
            return res
                .status(409)
                .json({message: 'An account with this email already exists'})
        }

        let team = null
        if (teamId) {
            if (!mongoose.Types.ObjectId.isValid(teamId)) {
                return res.status(400).json({message: 'Invalid team ID'})
            }
            team = await Team.findById(teamId)
            if (
                !team ||
                (team.company &&
                    team.company.trim().toLowerCase() !==
                        (req.user.companyName || '').trim().toLowerCase())
            ) {
                return res.status(404).json({message: 'Team not found'})
            }
        }

        const companyName = (req.user.companyName || '').trim() || 'NexGen CRM'

        // Password is hashed by the User model pre-save hook
        const newUser = await User.create({
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            password,
            companyName,
            role,
            team: team ? team._id : null,
            authProvider: 'local',
        })

        await newUser.populate('team', 'name')
        return res.status(201).json({user: newUser.toSafeJSON()})
    } catch (err) {
        if (err && err.name === 'ValidationError') {
            const message = Object.values(err.errors)
                .map((e) => e.message)
                .join(', ')
            return res.status(400).json({message})
        }
        console.error('Admin createUser error:', err)
        return res.status(500).json({message: 'Unable to create user'})
    }
}

// DELETE /api/admin/users/:id
// Permanently remove a user from the admin's company.
//
// Referential-integrity rationale:
//   Customer.owner                     -> set null  (customer stays, ownership cleared)
//   Customer.interactions[].createdBy  -> set null  (historical record preserved)
//   Deal.createdBy                     -> set null  (deal stays, attribution cleared)
//   Deal.statusLogs[].changedBy        -> set null  (audit trail preserved)
//   DealLog.changedBy                  -> set null  (deletion log preserved)
//   Task.createdBy                     -> set null  (task stays, attribution cleared)
//   Task.assignedTo                    -> pull user (task becomes unassigned)
//   Notification.user                  -> delete    (personal, no value without the user)
//   Team.supervisor                    -> set null  (team stays, supervisor cleared)
//
// Note: Use the A21 deactivation flag to block access while preserving history.
// Delete is for genuine data removal where attribution loss is acceptable.
exports.deleteUser = async (req, res) => {
    try {
        const targetId = req.params.id

        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({message: 'Invalid user ID'})
        }

        if (String(targetId) === String(req.user._id)) {
            return res
                .status(400)
                .json({message: 'You cannot delete your own account'})
        }

        const target = await User.findById(targetId)
        if (!target || !isSameCompany(req.user, target)) {
            return res.status(404).json({message: 'User not found'})
        }

        // Safe cleanup of all foreign-key references before removing the document
        await Promise.all([
            Customer.updateMany({owner: target._id}, {$set: {owner: null}}),
            Customer.updateMany(
                {'interactions.createdBy': target._id},
                {$set: {'interactions.$[elem].createdBy': null}},
                {arrayFilters: [{'elem.createdBy': target._id}]}
            ),
            Deal.updateMany({createdBy: target._id}, {$set: {createdBy: null}}),
            Deal.updateMany(
                {'statusLogs.changedBy': target._id},
                {$set: {'statusLogs.$[elem].changedBy': null}},
                {arrayFilters: [{'elem.changedBy': target._id}]}
            ),
            DealLog.updateMany({changedBy: target._id}, {$set: {changedBy: null}}),
            Task.updateMany({createdBy: target._id}, {$set: {createdBy: null}}),
            Task.updateMany({assignedTo: target._id}, {$pull: {assignedTo: target._id}}),
            Notification.deleteMany({user: target._id}),
            Team.updateMany({supervisor: target._id}, {$set: {supervisor: null}}),
        ])

        await User.deleteOne({_id: target._id})

        return res.json({message: 'User deleted successfully'})
    } catch (err) {
        console.error('Admin deleteUser error:', err)
        return res.status(500).json({message: 'Unable to delete user'})
    }
}
