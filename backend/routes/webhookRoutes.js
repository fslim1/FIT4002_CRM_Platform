const express = require('express');
const router = express.Router();
const { handleGmailPush } = require('../controllers/webhookController');

// Ensure body-parser JSON middleware is applied
router.post('/gmail', express.json(), handleGmailPush);

module.exports = router;