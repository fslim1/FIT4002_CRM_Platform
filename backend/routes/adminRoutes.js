const express = require('express')
const {requireAuth, requireRole} = require('../middleware/auth')
const {listUsers, createUser, setUserStatus, deleteUser} = require('../controllers/adminUserController')

const router = express.Router()

// All admin routes require authentication AND the Admin role.
// requireAuth  -> 401 if no/invalid/expired token
// requireRole  -> 403 if authenticated but not Admin
router.use(requireAuth, requireRole('Admin'))

// GET  /api/admin/users   -- filterable user list
// POST /api/admin/users   -- add a member of the company, in any role
router.route('/users').get(listUsers).post(createUser)

// PATCH /api/admin/users/:id/status  -- close or reopen an account
router.patch('/users/:id/status', setUserStatus)

// DELETE /api/admin/users/:id  -- permanently remove a user
router.delete('/users/:id', deleteUser)

module.exports = router
