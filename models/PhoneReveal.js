const mongoose = require('mongoose');

// An open reveal is the idempotency key for a viewer and post.  This makes a
// retry/double-click return the already-authorised number without spending a
// second credit.
const PhoneRevealSchema = new mongoose.Schema({
    viewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    profileOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
    chargedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    status: { type: String, enum: ['PENDING', 'OPEN', 'CLOSED', 'REFUNDED'], default: 'PENDING' },
    // A PENDING reveal must be claimed before its credit is deducted.  This
    // prevents concurrent retries from charging the same reveal twice.
    chargingStartedAt: Date,
    refundedAt: Date,
    createdAt: { type: Date, default: Date.now },
    openedAt: Date,
    connectMethod: { type: String, enum: ['show_number', 'message', 'proposal'], default: 'show_number' }
});

// Only one currently open/pending reveal may exist for a viewer/post pair.
PhoneRevealSchema.index({ viewerId: 1, adId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'OPEN'] } } });

module.exports = mongoose.model('PhoneReveal', PhoneRevealSchema);
