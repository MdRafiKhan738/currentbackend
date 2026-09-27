const express = require('express');
const router = express.Router();
const { initPayment, successPayment, failPayment, cancelPayment, ipnPayment } = require('../controllers/paymentController');
const { authenticateUser } = require('../middleware/auth');

router.post('/init', authenticateUser, initPayment);
router.post('/success/:transactionId', successPayment);
router.post('/fail/:transactionId', failPayment);
router.post('/cancel/:transactionId', cancelPayment);
router.post('/ipn', ipnPayment);

module.exports = router;
