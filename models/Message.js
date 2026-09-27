const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ad: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ad',
        required: true
    },
    text: {
        type: String,
        default: ''
    },
    image: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['delivered', 'seen'],
        default: 'delivered'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    messageType: {
        type: String,
        enum: ['text', 'callme', 'notify'],
        default: 'text'
    },
    deletedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }]
});

module.exports = mongoose.model('Message', MessageSchema);
