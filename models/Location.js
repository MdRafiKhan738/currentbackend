const mongoose = require('mongoose');

const subLocationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const locationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    locationNameBn: { type: String, trim: true, default: '' },
    slug: { type: String, lowercase: true },
    order: { type: Number, default: 0 },
    image: { type: String },
    status: { type: Boolean, default: true },
    createdBy: {
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        adminName: String
    },
    postCount: { type: Number, default: 0 }
}, {
    timestamps: true
});

module.exports = mongoose.model('Location', locationSchema);
