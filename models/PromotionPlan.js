const mongoose = require('mongoose');

const promotionPlanSchema = new mongoose.Schema({
    categories: [{
        type: String,
        required: true
    }],
    amount: {
        type: Number,
        required: true
    },
    reach: {
        type: Number,
        required: true
    },
    traffic: {
        type: Number,
        required: true
    },
    minReach: {
        type: Number,
        required: true
    },
    minTraffic: {
        type: Number,
        required: true
    },
    gapAmount: {
        type: String, // Storing as string to include '%' if needed, or just number
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PromotionPlan', promotionPlanSchema);
