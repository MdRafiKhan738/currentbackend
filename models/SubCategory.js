const mongoose = require('mongoose');

const subCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    subCategoryNameBn: { type: String, trim: true, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    features: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Feature' }],
    buttonType: { type: String },
    freePost: { type: Number, default: 1 },
    order: { type: Number, default: 0 },
    status: { type: Boolean, default: true },
    image: { type: String },
    priceBoxShow: { type: Boolean, default: false },
    priceBoxName: { type: String },
    // Admin-configured dynamic price/investment fields shown on post creation
    // and rendered on investment post cards/details.
    priceBoxFields: [{
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        labelBn: { type: String, trim: true, default: '' },
        placeholder: { type: String, trim: true, default: '' },
        placeholderBn: { type: String, trim: true, default: '' },
        inputType: { type: String, enum: ['text', 'number'], default: 'number' },
        required: { type: Boolean, default: false },
        order: { type: Number, default: 0 }
    }],
    minInvestment: { type: Number, min: 0, default: 0 },
    maxInvestment: { type: Number, min: 0, default: 0 },
    returnType: { type: String, enum: ['return', 'refund'], default: 'return' },
    returnProfit: { type: Number, min: 0, default: 0 },
    tags: [{ type: String }],
    createdBy: {
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        adminName: String
    }
}, { timestamps: true });

module.exports = mongoose.model('SubCategory', subCategorySchema);
