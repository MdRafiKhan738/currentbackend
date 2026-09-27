const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken, checkPermission } = require('../middleware/auth');
const auth = require('../middleware/auth');

router.post('/', auth.authenticateUser, reportController.createReport);

// Admin Routes
router.get('/', verifyToken, checkPermission('Report'), reportController.getReports);
router.delete('/:id', verifyToken, checkPermission('Report'), reportController.deleteReport);

module.exports = router;
