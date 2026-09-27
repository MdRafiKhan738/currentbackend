const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 } // Auto-delete after 5 minutes (for safety, though frontend says 30s)
});

module.exports = mongoose.model('OTP', otpSchema);
