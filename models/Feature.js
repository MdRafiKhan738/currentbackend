const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
    name: { type: String, required: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory', required: true },
    inputType: { type: String, default: 'Text' },
    order: { type: Number, default: 0 },
    status: { type: Boolean, default: true },
    buttonType: { type: String },
    selectionType: { type: String, enum: ['Single', 'Multi'], default: 'Single' },
    boxFadeName: { type: String },
    buttonItemNames: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('Feature', featureSchema);
