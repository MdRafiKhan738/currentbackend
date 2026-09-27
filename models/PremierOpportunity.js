const mongoose = require('mongoose');

const premierOpportunitySchema = new mongoose.Schema({
    verifyBadgePrice: { type: Number, default: 400 },
    verifyBadgeDuration: { type: Number, default: 365 },
    highlightPostPrice: { type: Number, default: 300 },
    labels: [
        {
            name: { type: String },
            price: { type: Number }
        }
    ],
    freeAdCredits: [
        {
            amount: { type: Number },
            forType: { type: String }, // 'product', 'all', 'category'
            forValue: { type: String }, // e.g. 'First Product', 'All', or Category Name
            startDate: { type: Date },
            endDate: { type: Date },
            status: { type: Boolean, default: true }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('PremierOpportunity', premierOpportunitySchema);
