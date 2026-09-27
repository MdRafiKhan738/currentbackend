const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    tnxId: { type: String, required: true },
    mode: { type: String, required: true }, // e.g., 'Online', 'Admin'
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
    mobileNumber: { type: String },
    amount: { type: Number, required: true },
    payType: { type: String }, // e.g., 'Bkash', 'Visa', 'Rocket', 'DBBL', 'Admin'
    payeeName: { type: String },
    item: { type: String }, // e.g., 'Verify Badge', 'Highlight', 'Urgent'
    payTime: { type: Date, default: Date.now },
    status: { type: String, default: 'VALID' } // VALID, FAILED, CANCELLED, PENDING
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
