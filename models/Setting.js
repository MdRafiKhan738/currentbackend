const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    siteLogo: { type: String, default: null },
    favIcon: { type: String, default: null },
    watermarkLogo: { type: String, default: null },
    ogImage: { type: String, default: null },
    productAutoInactiveTime: { type: Number, default: 90 },
    userRepeatAdViewTime: { type: Number, default: 3 },
    adReShowAfterMinutes: { type: Number, default: 0 },
    productPhotoLimit: { type: Number, default: 5 },
    blockCheckInHeadline: [{ type: String }],
    blockCheckInDescription: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
