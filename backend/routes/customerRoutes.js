const express = require('express');
const router = express.Router();
const { uploadLogo, uploadDocument } = require('../middleware/uploadMiddleware');
const {requireAuth} = require("../middleware/auth");
const {requirePermission} = require("../middleware/permissions");
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
    deleteCustomer,
  uploadCustomerFile,
  viewCustomerFile,
  downloadCustomerFile,
  deleteCustomerFile,
  addInteraction,
  deleteInteraction,
    editInteraction,
    getCustomerByName
} = require('../controllers/customerController');

// Customer data is team scoped
router.route('/')
    .post(requireAuth, uploadLogo.single('companyLogo'), createCustomer)
    .get(requireAuth, getCustomers);

router.get('/search', getCustomerByName);

router.get('/search', getCustomerByName);

router.route('/:id')
    .get(requireAuth, getCustomerById)
    .put(requireAuth, uploadLogo.single('companyLogo'), updateCustomer)
    // Admin by default; grantable per person via Settings -> Permissions
    .delete(requireAuth, requirePermission('deleteCustomers'), deleteCustomer);

// File attachment endpoints
router.post('/:id/files', requireAuth, uploadDocument.single('file'), uploadCustomerFile);
router.get('/:id/files/:fileId/view', viewCustomerFile);
router.get('/:id/files/:fileId/download', downloadCustomerFile);
// Admin by default; grantable per person via Settings -> Permissions
router.delete('/:id/files/:fileId', requireAuth, requirePermission('deleteRecords'), deleteCustomerFile);

// Interactions endpoint
router.post('/:id/interactions', requireAuth, addInteraction);
// Admin by default; grantable per person via Settings -> Permissions
router.delete('/:id/interactions/:interactionId', requireAuth, requirePermission('deleteRecords'), deleteInteraction);
router.put('/:id/interactions/:interactionId', requireAuth, editInteraction);

module.exports = router;
