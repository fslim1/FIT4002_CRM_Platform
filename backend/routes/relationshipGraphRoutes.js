const express = require('express')
const router = express.Router()

const {requireAuth} = require('../middleware/auth')
const {getAccountGraph} = require('../controllers/relationshipGraphController')

// GET only. The relationship graph reads interaction data and never writes it,
// so no other verb is exposed on this router.
router.get('/account/:customerId', requireAuth, getAccountGraph)

module.exports = router
