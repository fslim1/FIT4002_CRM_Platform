const express = require('express');
const router = express.Router();
const {getDashboardData} = require('../controllers/dashboardController');

const {requireAuth} = require('../middleware/auth');

// GET /api/dashboard
router.get('/', requireAuth, getDashboardData);

module.exports = router;
