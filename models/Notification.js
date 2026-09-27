const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Optional for broadcast notifications
    },
    isBroadcast: {
        type: Boolean,
        default: false
    },
    targetGroup: {
        type: String,
        enum: ['All', 'Seller', 'Customer', 'Selected'],
        default: 'Selected'
    },
    // Store filters used for this broadcast (optional)
    filters: {
        categories: [String],
        locations: [String],
        gender: String,
        trustedSeller: String,
        promotedType: String,
        postQuantity: String,
        loginStatus: {
            from: Date,
            to: Date
        }
    },
    // For complex broadcasts: specific list of users who should see this
    targetUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // For broadcast: track who read it
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    title: {
        type: String,
        default: 'SHADAMON'
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['admin_notification', 'system_alert'],
        default: 'admin_notification'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', NotificationSchema);
