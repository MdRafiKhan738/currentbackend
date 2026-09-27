const mongoose = require('mongoose');

const subLocationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    subLocationNameBn: {
        type: String,
        trim: true,
        default: ''
    },
    location: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Location',
        required: true
    },
    mapLink: {
        type: String,
        trim: true,
        default: ''
    },
    order: {
        type: Number,
        default: 0
    },
    status: {
        type: Boolean,
        default: true
    },
    image: {
        type: String,
        default: null
    },
    createdBy: {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin'
        },
        adminName: {
            type: String,
            default: 'Admin'
        }
    }
}, {
    timestamps: true
});

subLocationSchema.index({ location: 1, order: 1 });
subLocationSchema.index({ name: 1, location: 1 });

module.exports = mongoose.model('SubLocation', subLocationSchema);
