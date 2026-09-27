const mongoose = require('mongoose');

// Immutable ledger for package credit changes.  The balance remains on User
// for efficient reads, while this model supplies the dispute/audit trail.
const CreditTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['PURCHASE', 'REVEAL', 'REFUND', 'ADMIN_ADJUSTMENT', 'EXPIRY'], required: true },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    source: { type: String, required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    phoneRevealId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneReveal', unique: true, sparse: true },
    reason: String,
    createdAt: { type: Date, default: Date.now }
});

CreditTransactionSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('CreditTransaction', CreditTransactionSchema);
