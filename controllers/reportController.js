const Report = require('../models/Report');
const Ad = require('../models/Ad');
const mongoose = require('mongoose');

// @desc    Create a report
// @route   POST /api/reports
// @access  Private
exports.createReport = async (req, res) => {
    try {
        const { adId, ownerId, reason } = req.body;
        const reporterId = req.user._id || req.user.id;

        if (!adId || !ownerId || !reason) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }

        const report = await Report.create({
            ad: adId,
            owner: ownerId,
            reporter: reporterId,
            reason
        });

        res.status(201).json({
            success: true,
            message: 'Report submitted successfully',
            data: report
        });
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get all reports (Admin)
// @route   GET /api/reports
// @access  Private (Admin)
exports.getReports = async (req, res) => {
    try {
        const { userId, productId, mobile, category, status, cusSeller } = req.query;
        let query = {};

        if (status && status !== 'All') {
            if (status === 'Maximum Report') {
                // Special handling if needed, for now just skip reason filter
            } else {
                query.reason = status;
            }
        }

        const reports = await Report.find(query)
            .populate({
                path: 'ad',
                populate: { path: 'user', select: 'name mobile email merchantType' }
            })
            .populate('reporter', 'name mobile email createdAt merchantType')
            .populate('owner', 'name mobile email merchantType')
            .sort({ createdAt: -1 });

        // Filtering logic after fetch if population is complex, or use aggregate.
        // For simplicity with grouped results, we'll filter here or use a refined query.
        
        let filteredReports = reports.filter(r => r.ad && r.reporter && r.owner);

        if (userId) {
            filteredReports = filteredReports.filter(r => 
                r.reporter._id.toString().includes(userId) || 
                r.owner._id.toString().includes(userId)
            );
        }

        if (productId) {
            filteredReports = filteredReports.filter(r => 
                r.ad._id.toString().includes(productId)
            );
        }

        if (mobile) {
            filteredReports = filteredReports.filter(r => 
                (r.reporter.mobile && r.reporter.mobile.includes(mobile)) || 
                (r.owner.mobile && r.owner.mobile.includes(mobile)) ||
                (r.ad.phone && r.ad.phone.includes(mobile))
            );
        }

        if (category && category !== 'Select') {
            filteredReports = filteredReports.filter(r => r.ad.category === category);
        }

        if (cusSeller && cusSeller !== 'Select') {
            filteredReports = filteredReports.filter(r => {
                const isSeller = r.reporter.merchantType === 'Premium' || r.reporter.merchantType === 'Free Saller';
                const isCustomer = r.reporter.merchantType === 'Free';
                return cusSeller === 'Seller' ? isSeller : isCustomer;
            });
        }

        // Group by Ad
        const grouped = filteredReports.reduce((acc, report) => {
            const adId = report.ad._id.toString();
            if (!acc[adId]) {
                acc[adId] = {
                    ad: report.ad,
                    owner: report.owner,
                    reporters: [],
                    totalReport: 0,
                    mainReason: report.reason
                };
            }
            acc[adId].totalReport += 1;
            acc[adId].reporters.push({
                _id: report.reporter._id,
                name: report.reporter.name,
                mobile: report.reporter.mobile,
                email: report.reporter.email,
                createdAt: report.reporter.createdAt,
                merchantType: report.reporter.merchantType,
                reportReason: report.reason,
                reportId: report._id
            });
            return acc;
        }, {});

        let finalData = Object.values(grouped);

        if (status === 'Maximum Report') {
            finalData.sort((a, b) => b.totalReport - a.totalReport);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const total = finalData.length;
        const paginatedData = finalData.slice((page - 1) * limit, page * limit);

        // Fetch Post Ad counts for the paginated data
        const Ad = require('../models/Ad');
        for (let item of paginatedData) {
            // Count for owner
            if (item.owner?._id) {
                const count = await Ad.countDocuments({ user: item.owner._id });
                const ownerData = item.owner.toObject ? item.owner.toObject() : item.owner;
                item.owner = { ...ownerData, totalPostAd: count };
            }
            // Count for each reporter
            for (let rep of item.reporters) {
                if (rep._id) {
                    const count = await Ad.countDocuments({ user: rep._id });
                    rep.totalPostAd = count;
                } else {
                    rep.totalPostAd = 0;
                }
            }
        }

        res.json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: paginatedData
        });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete a report or all reports for an ad
// @route   DELETE /api/reports/:id
exports.deleteReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { deleteAllForAd } = req.query;

        if (deleteAllForAd === 'true') {
            await Report.deleteMany({ ad: id });
        } else {
            await Report.findByIdAndDelete(id);
        }

        res.json({ success: true, message: 'Report(s) deleted successfully' });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
