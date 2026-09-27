const mongoose = require('mongoose');

const AdPositionSchema = new mongoose.Schema({
    positionId: {
        type: Number,
        required: true,
        unique: true
    },
    placeName: {
        type: String,
        required: true
    },
    deskWidth: {
        type: String,
        default: ""
    },
    deskHeight: {
        type: String,
        default: ""
    },
    mobWidth: {
        type: String,
        default: ""
    },
    mobHeight: {
        type: String,
        default: ""
    },
    link: {
        type: String,
        default: ""
    },
    endDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'Yes'
    },
    imageDesk: {
        type: String // Base64 or URL
    },
    imageMob: {
        type: String // Base64 or URL
    }
}, { timestamps: true });

module.exports = mongoose.model('AdPosition', AdPositionSchema);
