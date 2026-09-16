const express = require('express')
const {requireAuth, requireRole} = require('../middleware/auth')
const {listUsers, createUser, deleteUser} = require('../controllers/adminUserController')

const router = express.Router()

// All admin routes require authentication AND the Admin role.
// requireAuth  -> 401 if no/invalid/expired token
// requireRole  -> 403 if authenticated but not Admin
router.use(requireAuth, requireRole('Admin'))

// GET  /api/admin/users   -- paginated, filterable user list
// POST /api/admin/users   -- create a new salesperson or supervisor
router.route('/users').get(listUsers).post(createUser)

// DELETE /api/admin/users/:id  -- permanently remove a user
router.delete('/users/:id', deleteUser)

module.exports = router
