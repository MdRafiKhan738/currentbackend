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


exports.getAllPackages = async (req, res) => {
    try {
        const packages = await Package.find({}).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: packages });
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

        const selectedPackage = packageId ? await Package.findById(packageId) : null;
        const effectiveValidDays = Number(validDays || selectedPackage?.validDays || 30);
        if (!Number.isFinite(effectiveValidDays) || effectiveValidDays <= 0) {
            return res.status(400).json({ success: false, message: "Validity days must be greater than zero." });
        }

        // Extend validity from the current active validity when it is still live.
        // Otherwise start a fresh validity period from now.
        const now = new Date();
        const currentValidity =
            user.validityDate && new Date(user.validityDate) > now
                ? new Date(user.validityDate)
                : user.activePackage?.validTill && new Date(user.activePackage.validTill) > now
                    ? new Date(user.activePackage.validTill)
                    : now;
        user.validityDate = new Date(
            currentValidity.getTime() + effectiveValidDays * 24 * 60 * 60 * 1000
        );

        const selectedPackageType = selectedPackage?.packageType === "Both" ? "Both" : "You";
        const selectedPackageName = selectedPackage?.name || packageName || "Manual package";
        user.activePackage = {
            packageId: packageId || undefined,
            name: selectedPackageName,
            type: packageType === 'Both' || selectedPackageType === 'Both' ? 'Both' : 'You',
            creditsRemaining: Number(connects) || Number(selectedPackage?.maxProfileView || selectedPackage?.total_connects) || 0,
            totalCredits: Number(connects) || Number(selectedPackage?.maxProfileView || selectedPackage?.total_connects) || 0,
            usedCredits: 0,
            activatedAt: new Date(),
            paymentMethod: 'Manual admin assignment',
            returnCreditOnClose: (selectedPackage?.checkedFeatures || []).some((feature) => String(feature).trim().toLowerCase() === 'close number return credit'),
            validTill: user.validityDate
        };

        await user.save();

        const socketio = req.app.get('socketio');
        if (socketio) {
            socketio.to(String(user._id)).emit('credit balance updated', {
                userId: String(user._id),
                balance: user.connectsBalance,
                creditsUsed: user.creditsUsed,
                activePackage: user.activePackage
            });
            socketio.to(String(user._id)).emit('package updated', {
                userId: String(user._id),
                activePackage: user.activePackage,
                connectsBalance: user.connectsBalance,
                validityDate: user.validityDate
            });
        }

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
            item: `${selectedPackageName} (${user.activePackage.type}) - ${connects} Connects Added`,
            status: 'VALID'
        });
        await trx.save();

        res.status(200).json({
            success: true,
            message: selectedPackageName + " package activated with " + creditAmount + " connects for " + effectiveValidDays + " days.",
            data: user
        });
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

        const socketio = req.app.get('socketio');
        if (socketio) {
            const payload = {
                userId: String(user._id),
                balance: user.connectsBalance,
                creditsUsed: user.creditsUsed,
                activePackage: user.activePackage,
                validityDate: user.validityDate
            };
            socketio.to(String(user._id)).emit('credit balance updated', payload);
            socketio.to(String(user._id)).emit('package updated', payload);
        }

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
        const query = String(req.query.mobile || req.query.email || req.query.query || '').trim();
        if (!query) return res.status(400).json({ success:false, message:'Email or mobile number is required.' });
        const user = await User.findOne({
            $or: [
                { mobile: query },
                { additionalMobiles: query },
                { email: query.toLowerCase() }
            ]
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
        const userSeen = await enrich(asViewer);
        const othersSeen = await enrich(asOwner);
        res.json({
            success:true,
            data:{
                userSeen,
                othersSeen,
                totalSeen: [...userSeen, ...othersSeen].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
            }
        });
    } catch (err) { res.status(500).json({ success:false, message:'Unable to load phone view history.' }); }
};


exports.setConnectBalance = async (req, res) => {
    try {
        const { userId, targetConnects, reason } = req.body;
        const target = Number(targetConnects);

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required.' });
        }
        if (!Number.isFinite(target) || target < 0) {
            return res.status(400).json({ success: false, message: 'Connect balance must be zero or greater.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const balanceBefore = Number(user.connectsBalance || 0);
        const difference = target - balanceBefore;

        user.connectsBalance = target;

        // Keep the active package's remaining credit in sync with the manually
        // corrected connect balance. Used credits are preserved.
        if (user.activePackage) {
            const usedCredits = Number(user.activePackage.usedCredits || 0);
            user.activePackage.creditsRemaining = target;
            user.activePackage.totalCredits = target + usedCredits;
        }

        await user.save();

        if (difference !== 0) {
            await CreditTransaction.create({
                userId: user._id,
                type: difference > 0 ? 'ADMIN_ADJUSTMENT' : 'ADMIN_ADJUSTMENT',
                amount: difference,
                balanceBefore,
                balanceAfter: target,
                source: 'ADMIN_CONNECT_BALANCE_CORRECTION',
                packageId: user.activePackage?.packageId,
                adminId: req.admin.id,
                reason: reason?.trim() || 'Manual current connect balance correction'
            });
        }

        await Transaction.create({
            tnxId: 'BAL-' + Date.now(),
            mode: 'Admin',
            sellerId: user._id,
            amount: 0,
            payType: 'Admin',
            payeeName: reason?.trim() || 'Connect Balance Correction',
            item: `Current Connect set from ${balanceBefore} to ${target}`,
            status: 'VALID'
        });

        const socketio = req.app.get('socketio');
        if (socketio) {
            const payload = {
                userId: String(user._id),
                balance: user.connectsBalance,
                creditsUsed: user.creditsUsed,
                activePackage: user.activePackage,
                validityDate: user.validityDate
            };
            socketio.to(String(user._id)).emit('credit balance updated', payload);
            socketio.to(String(user._id)).emit('package updated', payload);
        }

        return res.status(200).json({
            success: true,
            message: `Connect balance updated to ${target}.`,
            data: user
        });
    } catch (err) {
        console.error('setConnectBalance error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
