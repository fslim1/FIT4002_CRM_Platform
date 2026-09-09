const express = require('express');
const router = express.Router();
const {requireAuth} = require('../middleware/auth');
const {requirePermission} = require('../middleware/permissions');
const { getInteractions, createInteraction, deleteInteraction, editInteraction } = require('../controllers/interactionController');

router.get('/:customerId', getInteractions);
router.post('/create', createInteraction);
// Admin by default; grantable per person via Settings -> Permissions
router.delete('/:interactionId', requireAuth, requirePermission('deleteRecords'), deleteInteraction)
router.put('/:interactionId', editInteraction)

module.exports = router;