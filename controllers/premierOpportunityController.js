const PremierOpportunity = require('../models/PremierOpportunity');

exports.getSettings = async (req, res) => {
    try {
        let settings = await PremierOpportunity.findOne();
        if (!settings) {
            settings = await PremierOpportunity.create({
                verifyBadgePrice: 400,
                verifyBadgeDuration: 365,
                highlightPostPrice: 300,
                labels: [
                    { name: 'Discount', price: 500 }
                ],
                freeAdCredits: [
                    { amount: 400, forType: 'product', forValue: 'First Product', status: true },
                    { amount: 400, forType: 'all', forValue: 'All', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: true },
                    { amount: 100, forType: 'category', forValue: '', status: true }
                ]
            });
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const updateData = req.body;
        let settings = await PremierOpportunity.findOne();

        if (settings) {
            // Use Object.assign to update all fields including arrays correctly
            Object.assign(settings, updateData);
            await settings.save();
        } else {
            settings = await PremierOpportunity.create(updateData);
        }

        res.json({ success: true, data: settings, message: 'Premier Settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
