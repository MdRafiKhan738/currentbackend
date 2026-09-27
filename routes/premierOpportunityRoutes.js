const express = require('express');
const router = express.Router();
const controller = require('../controllers/premierOpportunityController');
const { verifyToken, checkPermission } = require('../middleware/auth'); // Reuse auth middleware from admin routes context

// @route   GET /api/premier-opportunity
// @desc    Get All Settings
// @access  Public
router.get('/', controller.getSettings);

// @route   PUT /api/premier-opportunity
// @desc    Update Settings
// @access  Private (Admin)
router.put('/', verifyToken, checkPermission('AD Position (W/A/Q)'), controller.updateSettings);

module.exports = router;
