const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    ad: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ad',
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: ["Wrong Catagorie", "Sold", "Fraud", "Duplicate", "Spam", "Others"]
    },
    status: {
        type: String,
        enum: ['Pending', 'Resolved', 'Dismissed'],
        default: 'Pending'
    }
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
