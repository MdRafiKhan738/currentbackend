const Package = require('../models/Package');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const Transaction = require('../models/Transaction');

exports.createPackage = async (req, res) => {
    try {
        const { 
            name, packageType, oldPrice, price, total_connects, 
            maxProfileView, validDays, bestValueSuggestion, 
            checkedFeatures, uncheckedFeatures, isActive 
        } = req.body;
        
        const credits = Number(maxProfileView ?? total_connects) || 0;
        const newPackage = new Package({ 
            name, packageType, oldPrice, price, total_connects, 
            maxProfileView: credits, total_connects: credits, validDays, bestValueSuggestion, 
            checkedFeatures, uncheckedFeatures, isActive 
        });
        await newPackage.save();
        res.status(201).json({ success: true, data: newPackage });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getPackages = async (req, res) => {
    try {
        const packages = await Package.find({ isActive: true }).sort({ bestValueSuggestion: -1, price: 1 });
        res.status(200).json({ success: true, data: packages });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updatePackage = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.maxProfileView !== undefined || updates.total_connects !== undefined) {
            const credits = Number(updates.maxProfileView ?? updates.total_connects) || 0;
            updates.maxProfileView = credits;
            updates.total_connects = credits;
        }
        const updatedPackage = await Package.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!updatedPackage) return res.status(404).json({ success: false, message: "Package not found" });
        res.status(200).json({ success: true, data: updatedPackage });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deletePackage = async (req, res) => {
    try {
        const deletedPackage = await Package.findByIdAndDelete(req.params.id);
        if (!deletedPackage) return res.status(404).json({ success: false, message: "Package not found" });
        res.status(200).json({ success: true, message: "Package deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Manually update connects balance
exports.manualInject = async (req, res) => {
    try {
        const { userId, connects, note, validDays, packageId, packageType, packageName } = req.body;
        const adminId = req.admin.id; // from admin auth middleware

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const creditAmount = Number(connects);
        if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Credit amount must be greater than zero.' });
        }
        const balanceBefore = Number(user.connectsBalance || 0);
        // Add connects
        user.connectsBalance = balanceBefore + creditAmount;
        user.creditsPurchased = Number(user.creditsPurchased || 0) + creditAmount;

        // Extend validity Date
        if (validDays) {
            const currentValidity = user.validityDate && user.validityDate > new Date() ? user.validityDate : new Date();
            user.validityDate = new Date(currentValidity.getTime() + Number(validDays) * 24 * 60 * 60 * 1000);
        }

        const selectedPackage = packageId ? await Package.findById(packageId) : null;
        user.activePackage = {
            packageId: packageId || undefined,
            name: packageName || selectedPackage?.name || 'Manual package',
            type: packageType === 'Both' || selectedPackage?.packageType === 'Both' ? 'Both' : 'You',
            creditsRemaining: Number(connects) || Number(selectedPackage?.maxProfileView || selectedPackage?.total_connects) || 0,
            totalCredits: Number(connects) || Number(selectedPackage?.maxProfileView || selectedPackage?.total_connects) || 0,
            usedCredits: 0,
            activatedAt: new Date(),
            paymentMethod: 'Manual admin assignment',
            returnCreditOnClose: (selectedPackage?.checkedFeatures || []).some((feature) => String(feature).trim().toLowerCase() === 'close number return credit'),
            validTill: user.validityDate
        };

        await user.save();

        await CreditTransaction.create({
            userId: user._id,
            type: 'ADMIN_ADJUSTMENT',
            amount: creditAmount,
            balanceBefore,
            balanceAfter: user.connectsBalance,
            source: 'ADMIN_PACKAGE_ASSIGNMENT',
            packageId: selectedPackage?._id,
            adminId,
            reason: note || 'Manual package assignment'
        });

        // Create a transaction log
        const Transaction = require('../models/Transaction');
        const trx = new Transaction({
            tnxId: 'MNL-' + Date.now(),
            mode: 'Admin',
            sellerId: user._id,
            amount: 0, // Manual injection is usually free/admin action
            payType: 'Admin',
            payeeName: note || 'Manual Injection',
            item: `${packageName || selectedPackage?.name || 'Manual Package'} - ${connects} Connects Added`,
            status: 'VALID'
        });
        await trx.save();

        res.status(200).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Manual refunds intentionally use the same ledger and active-package state as
// purchased/admin-assigned credits, so the dashboard has one source of truth.
exports.refundCredit = async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;
        const creditAmount = Number(amount);
        if (!Number.isFinite(creditAmount) || creditAmount <= 0 || !reason?.trim()) {
            return res.status(400).json({ success: false, message: 'A positive refund amount and reason are required.' });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (!user.activePackage?.validTill || user.activePackage.validTill <= new Date()) {
            return res.status(400).json({ success: false, message: 'The user does not have an active package to receive this refund.' });
        }
        const balanceBefore = Number(user.connectsBalance || 0);
        user.connectsBalance = balanceBefore + creditAmount;
        user.creditsRefunded = Number(user.creditsRefunded || 0) + creditAmount;
        user.activePackage.creditsRemaining = Number(user.activePackage.creditsRemaining || 0) + creditAmount;
        user.activePackage.totalCredits = Number(user.activePackage.totalCredits || 0) + creditAmount;
        await user.save();
        const transaction = await CreditTransaction.create({
            userId: user._id,
            type: 'REFUND',
            amount: creditAmount,
            balanceBefore,
            balanceAfter: user.connectsBalance,
            source: 'ADMIN_MANUAL_REFUND',
            packageId: user.activePackage.packageId,
            adminId: req.admin.id,
            reason: reason.trim()
        });
        await Transaction.create({
            tnxId: `RFD-${Date.now()}`,
            mode: 'Admin',
            sellerId: user._id,
            amount: creditAmount,
            payType: 'Admin Refund',
            payeeName: reason.trim(),
            item: `${user.activePackage.name || 'Package'} - ${creditAmount} Credits Refunded`,
            status: 'VALID'
        });

        const Notification = require('../models/Notification');
        await Notification.create({
            userId: user._id,
            title: 'Connect credit refund',
            message: `Admin refunded ${creditAmount} connect credit(s) to your account. Reason: ${reason.trim()}. Your current connect balance is ${user.connectsBalance}.`,
            type: 'system_alert',
            referenceId: user._id,
            referenceType: 'User'
        });

        res.json({ success: true, data: { user, transaction } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Unable to issue the credit refund.' });
    }
};

exports.searchUserByMobile = async (req, res) => {
    try {
        const mobile = String(req.query.mobile || '').trim();
        if (!mobile) return res.status(400).json({ success:false, message:'Mobile number is required.' });
        const user = await User.findOne({
            $or: [{ mobile }, { additionalMobiles: mobile }]
        }).select('-password').lean();
        if (!user) return res.status(404).json({ success:false, message:'User not found.' });
        res.json({ success:true, data:user });
    } catch (err) { res.status(500).json({ success:false, message:'Unable to search user.' }); }
};

exports.getPhoneViewHistory = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success:false, message:'User ID is required.' });
        const PhoneReveal = require('../models/PhoneReveal');
        const Ad = require('../models/Ad');
        const [asViewer, asOwner] = await Promise.all([
            PhoneReveal.find({ viewerId:userId }).populate('profileOwnerId','name mobile').populate('adId','headline phone user').sort({createdAt:-1}).limit(200).lean(),
            PhoneReveal.find({ profileOwnerId:userId }).populate('viewerId','name mobile').populate({path:'adId',select:'headline phone user'}).sort({createdAt:-1}).limit(200).lean()
        ]);
        const enrich = async (rows) => Promise.all(rows.map(async (row) => {
            const ad = row.adId;
            const ownerId = ad?.user || row.profileOwnerId;
            const owner = ownerId ? await User.findById(ownerId).select('name mobile').lean() : null;
            return { ...row, postOwner:owner };
        }));
        res.json({ success:true, data:{ userSeen:await enrich(asViewer), othersSeen:await enrich(asOwner) } });
    } catch (err) { res.status(500).json({ success:false, message:'Unable to load phone view history.' }); }
};
