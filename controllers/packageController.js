const splitFeatures = (value) => {
    const source = Array.isArray(value) ? value : [value];
    return source
        .flatMap((item) => String(item ?? '').split(/[,\n]/))
        .map((item) => item.trim())
        .filter(Boolean);
};

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
            checkedFeatures: splitFeatures(checkedFeatures), uncheckedFeatures: splitFeatures(uncheckedFeatures), isActive 
        });
        await newPackage.save();
        res.status(201).json({ success: true, data: newPackage });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};



exports.getMyPackage = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('activePackage connectsBalance creditsUsed validityDate');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const activePackage = user.activePackage?.validTill && new Date(user.activePackage.validTill) > new Date()
            ? user.activePackage
            : (user.activePackage || null);

        res.status(200).json({
            success: true,
            data: {
                activePackage,
                connectsBalance: Number(user.connectsBalance || 0),
                creditsUsed: Number(user.creditsUsed || 0),
                validityDate: user.validityDate || activePackage?.validTill || null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Unable to load the active package.' });
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
        if (updates.checkedFeatures !== undefined) updates.checkedFeatures = splitFeatures(updates.checkedFeatures);
        if (updates.uncheckedFeatures !== undefined) updates.uncheckedFeatures = splitFeatures(updates.uncheckedFeatures);
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
        const adminId = req.admin.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const creditAmount = Number(connects);
        if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
            return res.status(400).json({ success: false, message: "Credit amount must be greater than zero." });
        }

        const selectedPackage = packageId ? await Package.findById(packageId) : null;
        if (packageId && !selectedPackage) {
            return res.status(404).json({ success: false, message: "Selected package not found." });
        }

        const balanceBefore = Number(user.connectsBalance || 0);
        user.connectsBalance = balanceBefore + creditAmount;
        user.creditsPurchased = Number(user.creditsPurchased || 0) + creditAmount;

        const previousPackage = user.activePackage?.toObject
            ? user.activePackage.toObject()
            : (user.activePackage || null);

        const effectivePackageType =
            selectedPackage?.packageType === "Both" ||
            packageType === "Both" ||
            previousPackage?.type === "Both"
                ? "Both"
                : "You";

        const effectivePackageName =
            selectedPackage?.name ||
            packageName ||
            previousPackage?.name ||
            "Manual package";

        const effectivePackageId =
            selectedPackage?._id ||
            packageId ||
            previousPackage?.packageId;

        const hasNewPackageSelection = Boolean(selectedPackage || packageId || packageName || packageType);

        const requestedDays = Number(validDays);
        const defaultPackageDays = Number(selectedPackage?.validDays || previousPackage?.validDays || 30);
        const effectiveValidDays =
            Number.isFinite(requestedDays) && requestedDays > 0
                ? requestedDays
                : (Number.isFinite(defaultPackageDays) && defaultPackageDays > 0 ? defaultPackageDays : 30);

        // Package validity is independent from wallet credits. Adding more
        // credits to the same active package must not silently reset its exact
        // expiry. Use "Update Valid To" when the admin actually wants to change
        // the date.
        const sameActivePackage =
            Boolean(previousPackage?.name) &&
            (!selectedPackage ||
                String(previousPackage?.packageId || "") === String(selectedPackage._id));

        let expiry;
        if (selectedPackage) {
            expiry = new Date(Date.now() + effectiveValidDays * 86400000);
        } else if (sameActivePackage && previousPackage?.validTill && new Date(previousPackage.validTill) > new Date()) {
            expiry = new Date(previousPackage.validTill);
        } else {
            expiry = new Date(Date.now() + effectiveValidDays * 86400000);
        }

        const previousRemaining = Number(previousPackage?.creditsRemaining || 0);
        const previousTotal = Number(previousPackage?.totalCredits || 0);
        const previousUsed = Number(previousPackage?.usedCredits || 0);

        const shouldResetPackage =
            Boolean(selectedPackage) &&
            String(previousPackage?.packageId || "") !== String(selectedPackage._id);

        const packageRemaining = shouldResetPackage ? 0 : previousRemaining;
        const packageTotal = shouldResetPackage ? 0 : previousTotal;
        const packageUsed = shouldResetPackage ? 0 : previousUsed;

        const addedRemaining = packageRemaining + creditAmount;
        const addedTotal = packageTotal + creditAmount;

        user.validityDate = expiry;
        user.activePackage = {
            packageId: effectivePackageId,
            name: effectivePackageName,
            type: effectivePackageType,
            creditsRemaining: addedRemaining,
            totalCredits: addedTotal,
            usedCredits: packageUsed,
            activatedAt: shouldResetPackage || hasNewPackageSelection ? new Date() : (previousPackage?.activatedAt || new Date()),
            paymentMethod: "Manual admin assignment",
            returnCreditOnClose:
                (selectedPackage?.checkedFeatures || previousPackage?.returnCreditOnClose)
                    ? Boolean(
                        (selectedPackage?.checkedFeatures || []).some(
                            (feature) => String(feature).trim().toLowerCase().includes("close number return credit")
                        ) || previousPackage?.returnCreditOnClose
                    )
                    : false,
            validTill: expiry
        };

        await user.save();

        const socketio = req.app.get("socketio");
        if (socketio) {
            const payload = {
                userId: String(user._id),
                balance: user.connectsBalance,
                connectsBalance: user.connectsBalance,
                creditsUsed: user.creditsUsed,
                activePackage: user.activePackage,
                validityDate: user.validityDate
            };
            socketio.to(String(user._id)).emit("credit balance updated", payload);
            socketio.to(String(user._id)).emit("package updated", payload);
        }

        await CreditTransaction.create({
            userId: user._id,
            type: "ADMIN_ADJUSTMENT",
            amount: creditAmount,
            balanceBefore,
            balanceAfter: user.connectsBalance,
            source: "ADMIN_PACKAGE_ASSIGNMENT",
            packageId: selectedPackage?._id || user.activePackage?.packageId,
            adminId,
            reason: note || "Manual package assignment"
        });

        await Transaction.create({
            tnxId: "MNL-" + Date.now(),
            mode: "Admin",
            sellerId: user._id,
            amount: 0,
            payType: "Admin",
            payeeName: note || "Manual Injection",
            item: `${effectivePackageName} (${effectivePackageType}) - ${creditAmount} Connects Added`,
            status: "VALID"
        });

        res.status(200).json({
            success: true,
            message: effectivePackageName + " (" + effectivePackageType + ") updated with " + creditAmount + " connects.",
            data: user
        });
    } catch (err) {
        console.error("manualInject error:", err);
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
                connectsBalance: user.connectsBalance,
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
        const {
            userId,
            targetConnects,
            reason,
            packageId,
            packageType,
            packageName,
            validDays
        } = req.body;
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

        const selectedPackage = packageId ? await Package.findById(packageId) : null;
        if (packageId && !selectedPackage) {
            return res.status(404).json({ success: false, message: 'Selected package not found.' });
        }

        const balanceBefore = Number(user.connectsBalance || 0);
        const difference = target - balanceBefore;
        user.connectsBalance = target;

        const previousPackage = user.activePackage?.toObject
            ? user.activePackage.toObject()
            : (user.activePackage || null);

        if (selectedPackage) {
            const samePackage = String(previousPackage?.packageId || '') === String(selectedPackage._id);
            const requestedDays = Number(validDays);
            const packageDays = Number(selectedPackage.validDays || 30);
            const effectiveDays = Number.isFinite(requestedDays) && requestedDays > 0
                ? requestedDays
                : (Number.isFinite(packageDays) && packageDays > 0 ? packageDays : 30);
            const validTill = new Date(Date.now() + effectiveDays * 86400000);
            const usedCredits = samePackage ? Number(previousPackage?.usedCredits || 0) : 0;
            const packageTypeResolved = selectedPackage.packageType === 'Both'
                ? 'Both'
                : (selectedPackage.packageType === 'You' ? 'You' : (packageType === 'Both' ? 'Both' : 'You'));

            user.activePackage = {
                packageId: selectedPackage._id,
                name: selectedPackage.name || packageName || 'Package',
                type: packageTypeResolved,
                creditsRemaining: target,
                totalCredits: target + usedCredits,
                usedCredits,
                activatedAt: samePackage && previousPackage?.activatedAt ? previousPackage.activatedAt : new Date(),
                paymentMethod: 'Manual admin assignment',
                returnCreditOnClose: Array.isArray(selectedPackage.checkedFeatures)
                    && selectedPackage.checkedFeatures.some((feature) =>
                        String(feature).trim().toLowerCase() === 'close number return credit'
                    ),
                validTill
            };
            user.validityDate = validTill;
        } else if (user.activePackage) {
            const usedCredits = Number(user.activePackage.usedCredits || 0);
            user.activePackage.creditsRemaining = target;
            user.activePackage.totalCredits = target + usedCredits;
        }

        await user.save();

        if (difference !== 0) {
            await CreditTransaction.create({
                userId: user._id,
                type: 'ADMIN_ADJUSTMENT',
                amount: difference,
                balanceBefore,
                balanceAfter: target,
                source: selectedPackage ? 'ADMIN_PACKAGE_SELECTION' : 'ADMIN_CONNECT_BALANCE_CORRECTION',
                packageId: selectedPackage?._id || user.activePackage?.packageId,
                adminId: req.admin.id,
                reason: reason?.trim() || (selectedPackage ? 'Package selected and current connect balance saved' : 'Manual current connect balance correction')
            });
        }

        await Transaction.create({
            tnxId: 'BAL-' + Date.now(),
            mode: 'Admin',
            sellerId: user._id,
            amount: 0,
            payType: 'Admin',
            payeeName: reason?.trim() || 'Connect Balance Correction',
            item: selectedPackage
                ? `${selectedPackage.name} (${user.activePackage?.type}) - Current Connect set to ${target}`
                : `Current Connect set from ${balanceBefore} to ${target}`,
            status: 'VALID'
        });

        const socketio = req.app.get('socketio');
        if (socketio) {
            const payload = {
                userId: String(user._id),
                balance: user.connectsBalance,
                connectsBalance: user.connectsBalance,
                creditsUsed: user.creditsUsed,
                activePackage: user.activePackage,
                validityDate: user.validityDate
            };
            socketio.to(String(user._id)).emit('credit balance updated', payload);
            socketio.to(String(user._id)).emit('package updated', payload);
        }

        return res.status(200).json({
            success: true,
            message: selectedPackage
                ? `${selectedPackage.name} (${user.activePackage?.type}) is now active with ${target} connects.`
                : `Connect balance updated to ${target}.`,
            data: user
        });
    } catch (err) {
        console.error('setConnectBalance error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


// Update only the active package validity. Wallet/connect balance and package type
// remain untouched so an admin can change the expiry independently.
exports.updateManualPackageValidity = async (req, res) => {
    try {
        const { userId, validDays, validTill } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (!user.activePackage?.name) return res.status(400).json({ success: false, message: 'No active package is assigned.' });

        let expiry;
        if (validTill) {
            expiry = new Date(validTill);
        } else {
            const days = Number(validDays);
            if (!Number.isFinite(days) || days <= 0) {
                return res.status(400).json({ success: false, message: 'Validity days must be greater than zero.' });
            }
            expiry = new Date(Date.now() + days * 86400000);
        }
        if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
            return res.status(400).json({ success: false, message: 'Valid to must be a future date.' });
        }

        user.validityDate = expiry;
        user.activePackage.validTill = expiry;
        await user.save();

        req.app.get('socketio')?.to(String(user._id)).emit('package updated', {
            userId: String(user._id),
            activePackage: user.activePackage,
            connectsBalance: user.connectsBalance,
            validityDate: user.validityDate
        });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
