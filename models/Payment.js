const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ad: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ad'
    },
    userName: {
        type: String,
        required: true
    },
    userMobile: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    method: {
        type: String,
        // required: true // Can be added after payment is successful
    },
    transactionId: {
        type: String,
        required: true
    },
    description: {
        type: String // e.g., "Post ID : 55241778, TId : dfgdgfgg52548"
    },
    promotionDetails: {
        type: Object // Store promotion settings like promoteType, duration, etc.
    },
    status: {
        type: String,
        enum: ['PENDING', 'VALID', 'FAILED', 'CANCELLED'],
        default: 'PENDING'
    },
    paymentDetails: {
        type: Object // Full response from SSL Commerz
    },
    validTill: {
        type: Date
    },
    result: {
        type: String // e.g. "8420 views"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Payment', PaymentSchema);
