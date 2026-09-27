const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');
const Location = require('../models/Location');
const fs = require('fs');
const path = require('path');
// Removed unused imageHelper import

const User = require('../models/User'); // Import User model
const PromotionPlan = require('../models/PromotionPlan'); // Import PromotionPlan model
const Setting = require('../models/Setting'); // Import Setting model

const getFilterQueryValue = (query, longKey, shortKey) => query[longKey] || query[shortKey];

// Returns 1 (00:00-07:59), 2 (08:00-15:59), or 3 (16:00-23:59)
const getCurrentTimeSlot = () => {
    const h = new Date().getHours();
    if (h < 8) return 1;
    if (h < 16) return 2;
    return 3;
};

// @route   POST api/ads
// @desc    Create a new ad
// @access  Public (Optional Auth)
exports.createAd = async (req, res) => {
    try {
        // Optional: Associate with user if logged in
        let userId = null;
        if (req.user) {
            const user = await User.findById(req.user.id);
            if (user) {
                userId = user._id;
                // Removed verification check as per requirement
            }
        }

        const {
            headline,
            description,
            category,
            subCategory,
            location,
            subLocation,
            phone,
            hidePhone,
            url,
            actionType,
            price,
            priceType,
            features,
            verificationInfo
        } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        // Process images
        let imagePaths = req.files ? req.files.map(file => file.path.replace(/\\/g, "/")) : [];

        let adStatus = 'review'; // Default
        let limitReached = false;
        let subCategoryFreeLimit = 1; // Default fallback
        let pauseReason = null;

        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                const isTrustedMerchant = user.merchantTrustStatus === 'Trusted';

                // Check free post limitations at category level
                const subCategoryDoc = await SubCategory.findOne({ name: subCategory });
                if (subCategoryDoc && Number(subCategoryDoc.freePost) > 0) {
                    subCategoryFreeLimit = Number(subCategoryDoc.freePost);
                }

                const activeAdCountInCategory = await Ad.countDocuments({
                    user: userId,
                    category: category,
                    status: { $in: ['active', 'pending', 'review'] },
                    adType: { $ne: 'Promoted' }
                });

                if (activeAdCountInCategory >= subCategoryFreeLimit) {
                    // Category free limit reached: always pause regardless of merchant trust status
                    adStatus = 'pause';
                    limitReached = true;
                    pauseReason = 'LIMIT_EXCEEDED';
                } else if (isTrustedMerchant) {
                    // Trusted + free slot available: publish immediately
                    adStatus = 'active';
                } else {
                    // Untrusted users continue normal review flow
                    adStatus = 'review';
                }
            }
        } else {
            // Anonymous users are treated as untrusted and go through review
            adStatus = 'review';
        }

        const newAd = new Ad({
            user: userId, // Can be null now
            headline,
            description,
            category,
            subCategory,
            location,
            subLocation,
            phone,
            phoneTypes: req.body.phoneTypes ? JSON.parse(req.body.phoneTypes) : ['call'],
            hidePhone: hidePhone === 'true' || hidePhone === true,
            additionalPhones: req.body.additionalPhones ? JSON.parse(req.body.additionalPhones) : [],
            url,
            actionType,
            images: imagePaths,
            adType: 'Free',
            price,
            priceType,
            features: features ? (typeof features === 'string' ? JSON.parse(features) : features) : {},\n            postRole, businessStatus, minInvestment: minInvestment !== undefined ? Number(minInvestment) : undefined, maxInvestment: maxInvestment !== undefined ? Number(maxInvestment) : undefined, expectedReturn: expectedReturn !== undefined ? Number(expectedReturn) : undefined,
            status: adStatus,
            note: pauseReason
        });

        // Set showTill based on settings
        const settings = await Setting.findOne();
        const inactiveDays = settings ? settings.productAutoInactiveTime : 90;
        const showTill = new Date();
        showTill.setDate(showTill.getDate() + inactiveDays);
        newAd.showTill = showTill;

        const ad = await newAd.save();

        // Update user verification status if verification info is provided
        if (verificationInfo && (ad.user || userId)) {
            try {
                const vInfo = typeof verificationInfo === 'string' ? JSON.parse(verificationInfo) : verificationInfo;
                await User.findByIdAndUpdate(ad.user || userId, {
                    verifiedBy: 'Mobile',
                    verifiedNumber: vInfo.number || phone,
                    mobile: vInfo.number || phone, // Store as main mobile too
                    verifiedAt: vInfo.at || new Date(),
                    mobileVerified: true,
                    lastPostCategory: category,
                    lastPostSubCategory: subCategory,
                    lastPostLocation: location,
                    lastPostSubLocation: subLocation
                });
            } catch (vErr) {
                console.error("Error updating verification info:", vErr.message);
            }
        } else if (ad.user || userId) {
            // Even if no verification info, update the last post category and location
            try {
                await User.findByIdAndUpdate(ad.user || userId, {
                    lastPostCategory: category,
                    lastPostSubCategory: subCategory,
                    lastPostLocation: location,
                    lastPostSubLocation: subLocation
                });
            } catch (err) {
                console.error("Error updating user last post data:", err.message);
            }
        }

        // Notify matching users
        try {
            const Message = require('../models/Message');
            const Conversation = require('../models/Conversation');

            const matchingUsers = await User.find({
                notifyPreferences: {
                    $elemMatch: {
                        subCategory: ad.subCategory,
                        location: ad.location
                    }
                },
                _id: { $ne: userId } // Don't notify the author
            });

            for (const matchingUser of matchingUsers) {
                const welcomeText = `নতুন প্রডাক্ট এলার্ট! আপনার পছন্দের (${ad.subCategory}) ক্যাটাগরিতে একটি নতুন প্রডাক্ট পোস্ট করা হয়েছে।`;

                // Create/Find conversation between system/seller and user?
                // User said "সাইট এই প্রডাক্টের... নোটিফাই মেসেজ পাঠাবে"
                // Let's use the Seller as sender so user can directly chat if interested
                const senderId = ad.user || userId;
                if (!senderId) continue; // Skip if no seller ID

                let conversation = await Conversation.findOne({
                    ad: ad._id,
                    participants: { $all: [senderId, matchingUser._id] }
                });

                if (!conversation) {
                    conversation = new Conversation({
                        participants: [senderId, matchingUser._id],
                        ad: ad._id
                    });
                }
                conversation.deletedBy = [];

                const notificationMsg = new Message({
                    sender: senderId,
                    receiver: matchingUser._id,
                    ad: ad._id,
                    text: welcomeText,
                    messageType: 'notify',
                    status: 'delivered'
                });

                const savedMsg = await notificationMsg.save();
                conversation.lastMessage = savedMsg._id;
                conversation.updatedAt = Date.now();
                await conversation.save();
            }
        } catch (notifyErr) {
            console.error("Error in notify logic:", notifyErr);
        }

        // Increment Category Post Count
        await Category.findOneAndUpdate(
            { name: category },
            { $inc: { postCount: 1 } }
        );

        // Increment Location Post Count
        await Location.findOneAndUpdate(
            { name: location },
            { $inc: { postCount: 1 } }
        );

        res.status(201).json({
            success: true,
            message: 'Ad posted successfully',
            data: ad,
            limitReached,
            limit: subCategoryFreeLimit
        });
    } catch (err) {
        console.error("Error creating ad:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/admin/all
// @desc    Get all ads for admin with extensive filtering
// @access  Private (Admin)
exports.getAllAdsAdmin = async (req, res) => {
    try {
        const {
            adType,
            _id,
            mobile,
            email,
            status,
            userUpdated,
            packages,
            condition,
            category,
            subCategory,
            photoStatus,
            dateFrom,
            dateTo,
            promoteTag,
            featureName,
            featureValue,
            subLocation,
            actionType
        } = req.query;

        let query = {};

        // basic fields
        if (adType) query.adType = adType;
        if (_id && mongoose.Types.ObjectId.isValid(_id)) query._id = _id;
        if (status) query.status = status;
        if (userUpdated) query.userUpdated = userUpdated === 'true';
        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;
        if (subLocation) query.subLocation = subLocation;
        if (postRole === 'investor' || postRole === 'business_owner') query.postRole = postRole;
        if (photoStatus) query.photoStatus = photoStatus;
        if (actionType) query.actionType = actionType;
        if (promoteTag) query.promoteTag = promoteTag;

        // Dynamic Feature Search
        if (featureName && featureValue) {
            query[`features.${featureName}`] = featureValue;
        }

        // Packages logic
        if (packages) {
            if (packages === 'Free') {
                query.adType = 'Free';
            } else if (packages === 'Today') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                query.adType = 'Promoted';
                query.createdAt = { $gte: today };
            } else if (packages === 'Running') {
                query.adType = 'Promoted';
                query.status = 'active';
            }
        }

        // Feature search (Condition is a common feature)
        if (condition) {
            query['features.Condition'] = condition;
        }

        // Date range
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const dTo = new Date(dateTo);
                dTo.setHours(23, 59, 59, 999);
                query.createdAt.$lte = dTo;
            }
        }

        // User related fields (mobile, email)
        if (mobile || email) {
            let userQuery = {};
            if (mobile) userQuery.mobile = new RegExp(mobile, 'i');
            if (email) userQuery.email = new RegExp(email, 'i');

            const users = await User.find(userQuery).select('_id');
            const userIds = users.map(u => u._id);
            query.user = { $in: userIds };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Reset ads that haven't been seen today for both delivery and views
        // Also cleanup expired promotions
        if (!adType && !Object.keys(req.query).length) {
            await exports.cleanupExpiredPromotions();
            await Ad.updateMany(
                { lastDeliveryDate: { $lt: today } },
                { $set: { dailyDeliveryCount: 0, lastDeliveryDate: today } }
            );
            await Ad.updateMany(
                { lastViewsDate: { $lt: today } },
                { $set: { dailyViewsCount: 0, lastViewsDate: today } }
            );
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 100;
        const skip = (page - 1) * limit;

        const ads = await Ad.find(query)
            .populate('user', 'name email mobile storeLogo storeBanner merchantType mVerified merchantTrustStatus sellerPageUrl followers rating ratingCount')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Ad.countDocuments(query);

        res.json({
            success: true,
            count: ads.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: ads
        });
    } catch (err) {
        console.error("Error fetching ads:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/admin/promoted
// @desc    Get all promoted ads for admin
// @access  Private (Admin)
exports.getAllPromotedAdsAdmin = async (req, res) => {
    try {
        const ads = await Ad.find({ adType: 'Promoted' })
            .populate('user', 'name email mobile storeLogo storeBanner merchantType mVerified sellerPageUrl followers rating ratingCount')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: ads.length,
            data: ads
        });
    } catch (err) {
        console.error("Error fetching promoted ads:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/ads/admin/:id/status
// @desc    Update ad status
// @access  Private (Admin)
exports.updateAdStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!['active', 'pending', 'rejected', 'expired', 'pause', 'review'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        // If status is being set to active and it was in Processing adType, upgrade to Promoted
        if (status === 'active' && (ad.adType || '').toLowerCase() === 'processing') {
            ad.adType = 'Promoted';
        }

        ad.status = status;
        ad.userUpdated = false;
        ad.userNewPhotos = false;
        await ad.save();

        res.json({
            success: true,
            message: `Ad status updated to ${status}`,
            data: ad
        });
    } catch (err) {
        console.error("Error updating ad status:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   DELETE api/ads/admin/:id/image
// @desc    Remove specific image from ad
// @access  Private (Admin)
exports.deleteAdImage = async (req, res) => {
    try {
        const { imageUrl } = req.body;
        const adId = req.params.id;

        const ad = await Ad.findById(adId);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        // Remove from database array
        const newImages = ad.images.filter(img => img !== imageUrl);

        if (newImages.length === ad.images.length) {
            return res.status(400).json({ success: false, message: 'Image not found in ad' });
        }

        ad.images = newImages;
        await ad.save();

        // Delete file from filesystem
        if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
            const filePath = path.join(__dirname, '..', imageUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        res.json({
            success: true,
            message: 'Image removed successfully',
            data: ad
        });
    } catch (err) {
        console.error("Error removing image:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/ads/admin/:id/update
// @desc    Update ad details by admin
// @access  Private (Admin)
exports.updateAdDetails = async (req, res) => {
    try {
        const {
            headline,
            description,
            category,
            subCategory,
            location,
            subLocation,
            phone,
            phoneTypes,
            hidePhone,
            additionalPhones,
            url,
            actionType,
            adType,
            price,
            merchantID,
            pwrTarget,
            targetD,
            notificationDialogue,
            showTill,
            rep,
            lgs,
            senBy,
            edBy,
            note,
            targetValue,
            photoStatus,
            priceType,
            status,
            features,
            pendingDescriptionAction // 'accept' or 'decline'
        } = req.body;

        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        const originalStatus = ad.status;
        if (status !== undefined) ad.status = status;

        // Update fields
        if (headline) ad.headline = headline;
        if (description) ad.description = description;
        if (category) ad.category = category;
        if (subCategory !== undefined) ad.subCategory = subCategory;
        if (location) ad.location = location;
        if (subLocation !== undefined) ad.subLocation = subLocation;
        if (phone) ad.phone = phone;
        if (phoneTypes) ad.phoneTypes = typeof phoneTypes === 'string' ? JSON.parse(phoneTypes) : phoneTypes;
        if (hidePhone !== undefined) ad.hidePhone = hidePhone === 'true' || hidePhone === true;
        if (additionalPhones) ad.additionalPhones = typeof additionalPhones === 'string' ? JSON.parse(additionalPhones) : additionalPhones;
        if (url !== undefined) ad.url = url;
        if (actionType) ad.actionType = actionType;
        if (adType) {
            // Check if we are upgrading to Promoted or re-activating a Promoted ad
            if (adType === 'Promoted') {
                // Determine if we should archive the existing promotion metrics
                // We archive if it was already Promoted but is currently restricted (paused/review/expired)
                if (ad.adType === 'Promoted' && (originalStatus !== 'active' || (ad.promoteEndDate && ad.promoteEndDate < new Date()))) {
                    ad.promotionHistory = ad.promotionHistory || [];
                    ad.promotionHistory.push({
                        startDate: ad.promoteStartDate || ad.createdAt,
                        endDate: ad.promoteEndDate || new Date(),
                        adType: ad.adType,
                        promoteType: ad.promoteType,
                        promoteTag: ad.promoteTag,
                        budget: ad.promoteBudget,
                        targetD: ad.targetD,
                        targetValue: ad.targetValue,
                        views: ad.promotedViews || 0,
                        deliveryCount: ad.promotedDeliveryCount || 0,
                        createdAt: new Date()
                    });

                    // Reset for new period
                    ad.promoteStartDate = new Date();
                    ad.promotedViews = 0;
                    ad.promotedDeliveryCount = 0;
                } else if (!['promoted', 'processing'].includes((ad.adType || '').toLowerCase())) {
                    // Changing from Free to a Promotional type for the first time
                    ad.promoteStartDate = new Date();
                    ad.promotedViews = 0;
                    ad.promotedDeliveryCount = 0;
                }

                // TRUST-BASED LOGIC
                // Fetch user to check trust status
                let isTrusted = false;
                if (ad.user) {
                    const userDoc = await User.findById(ad.user);
                    if (userDoc && userDoc.merchantTrustStatus === 'Trusted') {
                        isTrusted = true;
                    }
                }

                const isReviewableState = ['pause', 'review', 'pending', 'inactive'].includes(originalStatus) || ['review', 'pause'].includes(ad.status);
                const currentAdTypeLower = (ad.adType || '').toLowerCase();
                const isNewPromotion = !['promoted', 'processing'].includes(currentAdTypeLower);

                if (!isTrusted && (isNewPromotion || isReviewableState)) {
                    // Force untrusted promotion to review
                    ad.adType = 'Processing';
                    ad.status = 'review';
                } else {
                    // Trusted user or already promoted active ad
                    ad.adType = 'Promoted';
                    // If it was restricted but is now allowed (trusted or from active), ensure it's active
                    if (['pause', 'review', 'pending'].includes(ad.status)) {
                        ad.status = 'active';
                    }
                }
            } else {
                ad.adType = adType;
            }

            // If it ends up as Promoted (after trust check), ensure user is Premium
            if (ad.adType === 'Promoted' && ad.user) {
                await User.findByIdAndUpdate(ad.user, { merchantType: 'Premium' });
            }
        }
        if (price !== undefined) {
            if (price === 'null' || price === null || price === '') {
                ad.price = undefined;
            } else {
                ad.price = Number(price);
            }
        }
        if (merchantID !== undefined) ad.merchantID = merchantID;
        if (pwrTarget !== undefined) ad.pwrTarget = typeof pwrTarget === 'string' ? JSON.parse(pwrTarget) : pwrTarget;
        if (targetD !== undefined) ad.targetD = targetD;
        if (notificationDialogue !== undefined) ad.notificationDialogue = notificationDialogue;
        if (showTill) {
            ad.showTill = showTill;
        } else if (!ad.showTill) {
            // Auto-repair if missing or cleared
            const settings = await Setting.findOne();
            const inactiveDays = settings ? (settings.productAutoInactiveTime || 90) : 90;
            const tillDate = new Date();
            tillDate.setDate(tillDate.getDate() + inactiveDays);
            ad.showTill = tillDate;
        }
        if (rep !== undefined) ad.rep = rep;
        if (lgs !== undefined) ad.lgs = lgs;
        if (senBy !== undefined) ad.senBy = senBy;

        // Auto-set edBy if admin is editing
        if (edBy !== undefined) {
            ad.edBy = edBy;
        } else {
            const adminName = req.admin.staffName || req.admin.email?.split('@')[0] || 'Admin';
            ad.edBy = adminName;
        }
        if (note !== undefined) ad.note = note;
        if (targetValue !== undefined) ad.targetValue = targetValue;
        if (photoStatus !== undefined) {
            ad.photoStatus = photoStatus;
            if (photoStatus === 'approved') {
                if (ad.pendingImages && ad.pendingImages.length > 0) {
                    ad.images = ad.pendingImages;
                    ad.pendingImages = [];
                }
                ad.userNewPhotos = false;
            } else if (photoStatus === 'rejected') {
                ad.pendingImages = [];
                ad.userNewPhotos = false;
            }
        }
        if (priceType !== undefined) ad.priceType = priceType;
        if (features !== undefined) ad.features = typeof features === 'string' ? JSON.parse(features) : features;
        if (req.body.pendingDescription !== undefined) ad.pendingDescription = req.body.pendingDescription;

        // Accept/Decline Pending Description
        if (pendingDescriptionAction === 'accept' && ad.pendingDescription) {
            ad.description = ad.pendingDescription;
            ad.pendingDescription = undefined;
            ad.userUpdated = false; // Reset the flag once moderated
            if (ad.status === 'review' && (ad.adType || '').toLowerCase() !== 'processing') ad.status = 'active'; // Restore visibility if it was in review due to edit
        } else if (pendingDescriptionAction === 'decline') {
            ad.pendingDescription = undefined;
            ad.userUpdated = false;
            if (ad.status === 'review' && (ad.adType || '').toLowerCase() !== 'processing') ad.status = 'active'; // Restore even if declined
        }

        // Process images: Combine remaining (existing) images + new uploads
        let currentImages = [];
        if (req.body.remainingImages) {
            try {
                const remaining = typeof req.body.remainingImages === 'string'
                    ? JSON.parse(req.body.remainingImages)
                    : req.body.remainingImages;
                if (Array.isArray(remaining)) {
                    currentImages = remaining;
                }
            } catch (e) {
                console.error("Error parsing remainingImages", e);
            }
        } else {
            // If remainingImages is NOT provided, assume we keep all existing images?
            // Or if this is coming from a form that always sends remainingImages, absence means empty?
            // For safety, if not provided, keep formatted ad.images.
            // But usually frontend sends it. Let's assume append mode if not provided, for backward compatibility.
            currentImages = ad.images;
        }

        const oldImages = ad.images;
        let newAdImages = [];

        if (req.files && req.files.length > 0) {
            const newImagePaths = req.files.map(file => file.path.replace(/\\/g, "/"));
            newAdImages = [...currentImages, ...newImagePaths].slice(0, 5);
        } else {
            // No new files, just update with remaining images (deletion case)
            if (req.body.remainingImages) {
                newAdImages = currentImages.slice(0, 5);
            } else {
                newAdImages = ad.images;
            }
        }

        ad.images = newAdImages;

        // Delete removed images from filesystem
        if (oldImages && oldImages.length > 0) {
            const deletedImages = oldImages.filter(img => !newAdImages.includes(img));
            deletedImages.forEach(img => {
                if (img && !img.startsWith('data:') && !img.startsWith('http')) {
                    const filePath = path.join(__dirname, '..', img);
                    fs.unlink(filePath, (err) => {
                        if (err && err.code !== 'ENOENT') console.error("Failed to delete old image:", err);
                    });
                }
            });
        }

        ad.userUpdated = false;
        ad.userNewPhotos = false;

        await ad.save();

        res.json({
            success: true,
            message: 'Ad updated successfully',
            data: ad
        });
    } catch (err) {
        console.error("Error updating ad details:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/public/feed
// @desc    Get paginated active ads for public feed (separated by adType for chunks)
// @access  Public
exports.getFeedAdsPublic = async (req, res) => {
    try {
        const { promoteTag, sort, search, page = 1, postRole } = req.query;
        const category = getFilterQueryValue(req.query, 'category', 'c');
        const subCategory = getFilterQueryValue(req.query, 'subCategory', 'sc');
        const location = getFilterQueryValue(req.query, 'location', 'l');
        const subLocation = getFilterQueryValue(req.query, 'subLocation', 'sl');

        const now = new Date();
        const PROMOTED_PER_PAGE = 24;
        const FREE_PER_PAGE = 20;

        let query = { status: 'active' };

        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;
        if (location) query.location = location;
        if (subLocation) query.subLocation = subLocation;
        if (promoteTag && promoteTag !== 'All') {
            if (promoteTag === 'Verified') {
                const verifiedUsers = await User.find({ mVerified: true }).select('_id');
                const verifiedUserIds = verifiedUsers.map(u => u._id);
                query.user = { $in: verifiedUserIds };
            } else {
                query.promoteTag = promoteTag;
            }
        }

        if (search) {
            const searchRegex = new RegExp(search.split(/\s+/).filter(Boolean).join('|'), 'i');
            query.$or = [
                { headline: searchRegex },
                { description: searchRegex }
            ];

            const words = search.trim().split(/\s+/);
            words.forEach(word => {
                if (mongoose.Types.ObjectId.isValid(word)) {
                    query.$or.push({ _id: word });
                    query.$or.push({ user: word });
                }
            });
        }

        let sortQuery = { createdAt: -1 };
        if (sort === 'oldest') sortQuery = { createdAt: 1 };
        else if (sort === 'price-high') sortQuery = { price: -1 };
        else if (sort === 'price-low') sortQuery = { price: 1 };

        const pageNum = parseInt(page);

        // NOTE: We build additional $and/$or clauses below; keep any existing search $or separate
        // to avoid overwriting it when adding type/expiry filters.
        const searchOr = Array.isArray(query.$or) ? query.$or : null;
        if (searchOr) delete query.$or;

        // If a specific promoteTag is selected (except "Verified"), only show currently-active promoted ads.
        // Otherwise: paginate in two phases — all active promoted first, then free/expired-promoted.
        const onlyPromotedByTag = !!(promoteTag && promoteTag !== 'All' && promoteTag !== 'Verified');

        const activePromotedQuery = {
            ...query,
            adType: 'Promoted',
            $and: [
                ...(searchOr ? [{ $or: searchOr }] : []),
                {
                    $or: [
                        { promoteStartDate: { $exists: false } },
                        { promoteStartDate: { $lte: now } }
                    ]
                },
                {
                    $or: [
                        { promoteEndDate: { $exists: false } },
                        { promoteEndDate: { $gte: now } }
                    ]
                }
            ]
        };

        // Treat expired promoted as free in the feed (so they don't "disappear" until cleanup runs).
        const freeOrExpiredPromotedQuery = {
            ...query,
            $and: [
                ...(searchOr ? [{ $or: searchOr }] : []),
                {
                    $or: [
                        { adType: { $ne: 'Promoted' } },
                        { adType: 'Promoted', promoteEndDate: { $lt: now } }
                    ]
                },
                {
                    $or: [
                        { adType: 'Promoted', promoteEndDate: { $gte: now } },
                        { adType: 'Processing' },
                        { showTill: { $gte: now } }
                    ]
                }
            ]
        };

        const selectFieldsPromoted =
            'headline description features labels views price images location subLocation category subCategory createdAt deliveryCount user adType phone hidePhone additionalPhones promotedViews promotedDeliveryCount dailyViewsCount dailyDeliveryCount slotDeliveryCount currentSlot promoteStartDate promoteEndDate promoteType trafficLink trafficButtonType promoteTag targetD postRole businessStatus minInvestment maxInvestment expectedReturn';
        const selectFieldsFree =
            'headline description features labels views price images location subLocation category subCategory createdAt deliveryCount user adType phone hidePhone additionalPhones promotedViews promotedDeliveryCount dailyViewsCount dailyDeliveryCount promoteStartDate promoteEndDate postRole businessStatus minInvestment maxInvestment expectedReturn';
        const populateUserFields =
            'name storeName photo photoStatus storeLogo storeBanner merchantType createdAt verifiedBy mVerified sellerPageUrl followers rating ratingCount';

        let promotedAds = [];
        let freeAds = [];
        let hasMore = false;

        const currentSlotNum = getCurrentTimeSlot();

        if (onlyPromotedByTag) {
            // Priority Ranking: sort by per-slot view gap — ad needing most views this slot shows first
            const promotedItems = await Ad.aggregate([
                { $match: activePromotedQuery },
                {
                    $addFields: {
                        targetDNum: { $convert: { input: "$targetD", to: "double", onError: 0, onNull: 0 } }
                    }
                },
                {
                    // Only count slotViewsCount if the stored currentSlot matches the actual slot;
                    // otherwise the field is stale from a previous slot and must be treated as 0
                    $addFields: {
                        effectiveSlotViews: {
                            $cond: {
                                if: { $eq: ["$currentSlot", currentSlotNum] },
                                then: { $ifNull: ["$slotViewsCount", 0] },
                                else: 0
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        slotTarget: { $ceil: { $divide: ["$targetDNum", 3] } },
                        slotGap: { $subtract: [{ $ceil: { $divide: ["$targetDNum", 3] } }, "$effectiveSlotViews"] }
                    }
                },
                { $sort: { slotGap: -1, createdAt: -1 } },
                { $skip: (pageNum - 1) * PROMOTED_PER_PAGE },
                { $limit: PROMOTED_PER_PAGE },
                { $project: { _id: 1 } }
            ]);

            const promotedIds = promotedItems.map(item => item._id);
            promotedAds = await Ad.find({ _id: { $in: promotedIds } })
                .select(selectFieldsPromoted)
                .populate('user', populateUserFields);

            // Re-sort to maintain the aggregation order
            promotedAds.sort((a, b) => {
                return promotedIds.findIndex(id => id.equals(a._id)) - promotedIds.findIndex(id => id.equals(b._id));
            });

            const promotedCount = await Ad.countDocuments(activePromotedQuery);
            hasMore = pageNum * PROMOTED_PER_PAGE < promotedCount;
        } else {
            const [promotedCount, freeCount] = await Promise.all([
                Ad.countDocuments(activePromotedQuery),
                Ad.countDocuments(freeOrExpiredPromotedQuery)
            ]);

            const promotedPages = Math.ceil(promotedCount / PROMOTED_PER_PAGE);

            if (promotedPages > 0 && pageNum <= promotedPages) {
                // Priority Ranking: Rank by slot view gap — ad needing most views this slot shows first
                const promotedItems = await Ad.aggregate([
                    { $match: activePromotedQuery },
                    {
                        $addFields: {
                            targetDNum: { $convert: { input: "$targetD", to: "double", onError: 0, onNull: 0 } }
                        }
                    },
                    {
                        // Only count slotViewsCount if the stored currentSlot matches the actual slot;
                        // otherwise the field is stale from a previous slot and must be treated as 0
                        $addFields: {
                            effectiveSlotViews: {
                                $cond: {
                                    if: { $eq: ["$currentSlot", currentSlotNum] },
                                    then: { $ifNull: ["$slotViewsCount", 0] },
                                    else: 0
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            slotTarget: { $ceil: { $divide: ["$targetDNum", 3] } },
                            slotGap: { $subtract: [{ $ceil: { $divide: ["$targetDNum", 3] } }, "$effectiveSlotViews"] }
                        }
                    },
                    { $sort: { slotGap: -1, createdAt: -1 } },
                    { $skip: (pageNum - 1) * PROMOTED_PER_PAGE },
                    { $limit: PROMOTED_PER_PAGE },
                    { $project: { _id: 1 } }
                ]);

                const promotedIds = promotedItems.map(item => item._id);
                promotedAds = await Ad.find({ _id: { $in: promotedIds } })
                    .select(selectFieldsPromoted)
                    .populate('user', populateUserFields);

                // Re-sort to maintain the aggregation order
                promotedAds.sort((a, b) => {
                    return promotedIds.findIndex(id => id.equals(a._id)) - promotedIds.findIndex(id => id.equals(b._id));
                });

                hasMore = pageNum < promotedPages || freeCount > 0;
            } else {
                const freePageIndex = Math.max(1, pageNum - promotedPages); // 1-based
                freeAds = await Ad.find(freeOrExpiredPromotedQuery)
                    .select(selectFieldsFree)
                    .populate('user', populateUserFields)
                    .sort(sortQuery)
                    .skip((freePageIndex - 1) * FREE_PER_PAGE)
                    .limit(FREE_PER_PAGE);

                hasMore = freePageIndex * FREE_PER_PAGE < freeCount;
            }
        }

        // Fetch 1 random Category per page for interleaving (randomized variety on every fetch)
        const categoriesPromise = Category.aggregate([
            { $match: { postCount: { $gt: 0 } } },
            { $sample: { size: 1 } },
            { $project: { name: 1, icon: 1, _id: 1 } }
        ]);

        const [interleavedCategories] = await Promise.all([categoriesPromise]);

        if (pageNum === 1) {
            exports.cleanupExpiredPromotions().catch(err => console.error("Feed Cleanup Error:", err));
        }

        const allAds = [...promotedAds, ...freeAds];

        const optimizedAds = allAds.map(ad => {
            const adObj = ad.toObject();
            // If an item is a "Promoted" ad but the promotion already ended, treat it as a Free post
            // in the feed response. (DB cleanup runs asynchronously and might not have updated it yet.)
            if (adObj.adType === 'Promoted' && adObj.promoteEndDate && new Date(adObj.promoteEndDate) < now) {
                adObj.adType = 'Free';
            }
            if (adObj.images && adObj.images.length > 0) {
                adObj.images = [adObj.images[0]];
            }
            return adObj;
        });

        // Send response first — impression counting is fire-and-forget and must never block the feed
        res.json({
            success: true,
            hasMore,
            data: optimizedAds,
            feedCategories: interleavedCategories
        });

        // Impression counting (async, non-blocking — errors here are logged but never reach the client)
        if (allAds.length > 0) {
            const adIds = allAds.map(ad => ad._id);
            const promotedActiveIds = allAds
                .filter(ad => ad.adType === 'Promoted' && (!ad.promoteEndDate || ad.promoteEndDate >= now))
                .map(ad => ad._id);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const slot = getCurrentTimeSlot();
            const now2 = new Date();

            // New day: compute dailyDeficit from yesterday's shortfall, reset slotDeficit + all counters
            Ad.updateMany(
                { _id: { $in: adIds }, lastDeliveryDate: { $lt: today } },
                [{
                    $set: {
                        dailyDeficit: {
                            $let: {
                                vars: {
                                    baseD: { $max: [0, { $convert: { input: '$targetD', to: 'double', onError: 0, onNull: 0 } }] },
                                    prevDeficit: { $ifNull: ['$dailyDeficit', 0] },
                                    dayViews: { $ifNull: ['$dailyViewsCount', 0] }
                                },
                                in: {
                                    $let: {
                                        vars: { effD: { $min: [{ $add: ['$$baseD', '$$prevDeficit'] }, { $multiply: ['$$baseD', 3] }] } },
                                        in: { $min: [{ $max: [0, { $subtract: ['$$effD', '$$dayViews'] }] }, { $multiply: ['$$baseD', 2] }] }
                                    }
                                }
                            }
                        },
                        slotDeficit: 0,
                        dailyDeliveryCount: 0,
                        slotDeliveryCount: 0,
                        dailyViewsCount: 0,
                        slotViewsCount: 0,
                        currentSlot: slot,
                        lastDeliveryDate: now2
                    }
                }]
            ).catch(err => console.error('Day-reset updateMany error:', err.message));

            // Same day, new slot: compute slotDeficit from previous slot's shortfall, reset slot counters
            Ad.updateMany(
                { _id: { $in: adIds }, lastDeliveryDate: { $gte: today }, currentSlot: { $ne: slot } },
                [{
                    $set: {
                        slotDeficit: {
                            $let: {
                                vars: {
                                    baseD: { $max: [0, { $convert: { input: '$targetD', to: 'double', onError: 0, onNull: 0 } }] },
                                    prevDailyDeficit: { $ifNull: ['$dailyDeficit', 0] },
                                    prevSlotDeficit: { $ifNull: ['$slotDeficit', 0] },
                                    slotViews: { $ifNull: ['$slotViewsCount', 0] }
                                },
                                in: {
                                    $let: {
                                        vars: {
                                            effD: { $min: [{ $add: ['$$baseD', '$$prevDailyDeficit'] }, { $multiply: ['$$baseD', 3] }] },
                                            baseSlotT: { $ceil: { $divide: ['$$baseD', 3] } }
                                        },
                                        in: {
                                            $let: {
                                                vars: { effSlotT: { $add: [{ $ceil: { $divide: ['$$effD', 3] } }, '$$prevSlotDeficit'] } },
                                                in: { $min: [{ $max: [0, { $subtract: ['$$effSlotT', '$$slotViews'] }] }, { $multiply: ['$$baseSlotT', 2] }] }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        slotDeliveryCount: 0,
                        slotViewsCount: 0,
                        currentSlot: slot
                    }
                }]
            ).catch(err => console.error('Slot-reset updateMany error:', err.message));

            // Increment delivery counters for all ads in this feed response
            Ad.updateMany(
                { _id: { $in: adIds } },
                { $inc: { deliveryCount: 1, dailyDeliveryCount: 1, slotDeliveryCount: 1 }, $set: { lastDeliveryDate: now2, currentSlot: slot } }
            ).catch(err => console.error('Delivery count updateMany error:', err.message));

            if (promotedActiveIds.length > 0) {
                Ad.updateMany(
                    { _id: { $in: promotedActiveIds } },
                    { $inc: { promotedDeliveryCount: 1 } }
                ).catch(err => console.error('Promoted delivery count updateMany error:', err.message));
            }
        }
    } catch (err) {
        console.error("Error fetching feed ads:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/public/all
// @desc    Get all active ads for public feed and increment views
// @access  Public
exports.getAllAdsPublic = async (req, res) => {
    try {
        const { promoteTag, sort, search, limit } = req.query;
        const category = getFilterQueryValue(req.query, 'category', 'c');
        const subCategory = getFilterQueryValue(req.query, 'subCategory', 'sc');
        const location = getFilterQueryValue(req.query, 'location', 'l');
        const subLocation = getFilterQueryValue(req.query, 'subLocation', 'sl');
        const now = new Date();

        let query = {
            status: 'active',
            $or: [
                { adType: 'Promoted', promoteEndDate: { $gte: now } },
                { adType: 'Processing' },
                { showTill: { $gte: now } }
            ]
        };

        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;
        if (location) query.location = location;
        if (subLocation) query.subLocation = subLocation;
        if (promoteTag && promoteTag !== 'All') {
            if (promoteTag === 'Verified') {
                const verifiedUsers = await User.find({ mVerified: true }).select('_id');
                const verifiedUserIds = verifiedUsers.map(u => u._id);
                query.user = { $in: verifiedUserIds };
            } else {
                query.promoteTag = promoteTag;
                query.adType = 'Promoted';
            }
        }

        if (search) {
            const searchRegex = new RegExp(search.split(/\s+/).filter(Boolean).join('|'), 'i');
            query.$or = [
                { headline: searchRegex },
                { description: searchRegex }
            ];

            // If any word in search query is a valid ObjectId, search by _id or user ID too
            const words = search.trim().split(/\s+/);
            words.forEach(word => {
                if (mongoose.Types.ObjectId.isValid(word)) {
                    query.$or.push({ _id: word });
                    query.$or.push({ user: word });
                }
            });
        }

        let sortQuery = { adType: -1, createdAt: -1 };
        if (sort === 'oldest') sortQuery = { adType: -1, createdAt: 1 };
        else if (sort === 'price-high') sortQuery = { adType: -1, price: -1 };
        else if (sort === 'price-low') sortQuery = { adType: -1, price: 1 };

        // Fetch active ads
        let adsQuery = Ad.find(query)
            .select('headline description features labels views price images location subLocation category subCategory createdAt deliveryCount user adType phone hidePhone additionalPhones promotedViews promotedDeliveryCount dailyViewsCount dailyDeliveryCount promoteStartDate promoteEndDate')
            .populate('user', 'name storeName photo photoStatus storeLogo storeBanner merchantType createdAt verifiedBy mVerified sellerPageUrl followers rating ratingCount')
            .sort(sortQuery);

        if (limit) {
            adsQuery = adsQuery.limit(parseInt(limit));
        }

        const ads = await adsQuery;

        // Map ads to only include the first image in the response to save bandwidth
        const optimizedAds = ads.map(ad => {
            const adObj = ad.toObject();
            if (adObj.images && adObj.images.length > 0) {
                adObj.images = [adObj.images[0]]; // Only send first image for list/suggestion view
            }
            return adObj;
        });

        // Increment views for these ads (Impression counting)
        if (ads.length > 0) {
            const adIds = ads.map(ad => ad._id);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Using find and bulk write or a more complex update might be needed for per-ad date checks
            // But for simplicity and performance in a list view, we can use a conditional update 
            // However, $cond in updateMany is tricky. Let's use a simpler approach:
            // Reset dailyDeliveryCount for ads whose lastDeliveryDate is before today.

            // 1. Reset ads that haven't been seen today
            await Ad.updateMany(
                { _id: { $in: adIds }, lastDeliveryDate: { $lt: today } },
                { $set: { dailyDeliveryCount: 0, lastDeliveryDate: new Date() } }
            );
            await Ad.updateMany(
                { _id: { $in: adIds }, lastViewsDate: { $lt: today } },
                { $set: { dailyViewsCount: 0, lastViewsDate: new Date() } }
            );

            // 2. Increment both total and daily counts
            await Ad.updateMany(
                { _id: { $in: adIds } },
                { $inc: { deliveryCount: 1, dailyDeliveryCount: 1 }, $set: { lastDeliveryDate: new Date() } }
            ).catch(err => console.error("Error updating delivery counts:", err));

            // 3. Increment promotedDeliveryCount for promoted ads
            await Ad.updateMany(
                { _id: { $in: adIds }, adType: 'Promoted' },
                { $inc: { promotedDeliveryCount: 1 } }
            ).catch(err => console.error("Error updating promoted delivery counts:", err));
        }

        res.json({
            success: true,
            count: optimizedAds.length,
            data: optimizedAds
        });
    } catch (err) {
        console.error("Error fetching public ads:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/public/count
// @desc    Get count of active ads based on filters
// @access  Public
exports.getAdsCount = async (req, res) => {
    try {
        const { promoteTag } = req.query;
        const category = getFilterQueryValue(req.query, 'category', 'c');
        const subCategory = getFilterQueryValue(req.query, 'subCategory', 'sc');
        const location = getFilterQueryValue(req.query, 'location', 'l');
        const subLocation = getFilterQueryValue(req.query, 'subLocation', 'sl');
        const now = new Date();

        let query = {
            status: 'active',
            $or: [
                { adType: 'Promoted', promoteEndDate: { $gte: now } },
                { adType: 'Processing' },
                { showTill: { $gte: now } }
            ]
        };

        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;
        if (location) query.location = location;
        if (subLocation) query.subLocation = subLocation;
        if (promoteTag && promoteTag !== 'All') {
            if (promoteTag === 'Verified') {
                const verifiedUsers = await User.find({ mVerified: true }).select('_id');
                const verifiedUserIds = verifiedUsers.map(u => u._id);
                query.user = { $in: verifiedUserIds };
            } else {
                query.promoteTag = promoteTag;
                query.adType = 'Promoted';
            }
        }

        const count = await Ad.countDocuments(query);

        res.json({
            success: true,
            count: count
        });
    } catch (err) {
        console.error("Error fetching ad count:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/public/:id
// @desc    Get single public ad
// @access  Public
exports.getSingleAdPublic = async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id)
            .populate('user', 'name storeName photo photoStatus storeLogo storeBanner merchantType verifiedBy mVerified rating ratingCount');

        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        // Increment view
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const slot = getCurrentTimeSlot();

        let update = {
            $inc: { views: 1 },
            $set: { lastViewsDate: new Date(), currentSlot: slot }
        };

        // Handle dailyViewsCount and slotViewsCount logic
        if (!ad.lastViewsDate || ad.lastViewsDate < today) {
            // New day: reset both daily and slot view counters
            update.$set.dailyViewsCount = 1;
            update.$set.slotViewsCount = 1;
        } else if (ad.currentSlot !== slot) {
            // Same day, new slot: reset slot views only
            update.$set.slotViewsCount = 1;
            update.$inc.dailyViewsCount = 1;
        } else {
            update.$inc.dailyViewsCount = 1;
            update.$inc.slotViewsCount = 1;
        }

        // Increment promotedViews if ad is promoted
        if (ad.adType && ad.adType.toLowerCase() === 'promoted') {
            update.$inc.promotedViews = 1;
        }

        const updatedAd = await Ad.findByIdAndUpdate(req.params.id, update, { new: true })
            .populate('user', 'name storeName photo photoStatus storeLogo storeBanner merchantType verifiedBy mVerified followers rating ratingCount');

        res.json({
            success: true,
            data: updatedAd
        });
    } catch (err) {
        console.error("Error fetching single ad:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// @route   GET api/ads/me
// @desc    Get all ads for logged-in user
// @access  Private
exports.getMyAds = async (req, res) => {
    try {
        const ads = await Ad.find({ user: req.user.id })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: ads.length,
            data: ads
        });
    } catch (err) {
        console.error("Error fetching user ads:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/ads/:id
// @desc    Update an ad by its owner
// @access  Private
exports.updateMyAd = async (req, res) => {
    try {
        const ad = await Ad.findOne({ _id: req.params.id, user: req.user.id });
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found or unauthorized' });
        }

        const {
            headline,
            description,
            category,
            subCategory,
            location,
            subLocation,
            phone,
            phoneTypes,
            hidePhone,
            additionalPhones,
            url,
            actionType,
            price,
            priceType,
            features
        } = req.body;

        let isDetailsModified = false;
        let isPhotosModified = false;

        const user = await User.findById(req.user.id);
        const isTrusted = user && user.merchantTrustStatus === 'Trusted';

        // Check for details modification
        if (headline && headline !== ad.headline) {
            ad.headline = headline;
            isDetailsModified = true;
        }

        if (description && description !== ad.description) {
            ad.pendingDescription = description;
            isDetailsModified = true;
        }
        if (category && category !== ad.category) { ad.category = category; isDetailsModified = true; }
        if (subCategory !== undefined && subCategory !== ad.subCategory) { ad.subCategory = subCategory; isDetailsModified = true; }
        if (location && location !== ad.location) { ad.location = location; isDetailsModified = true; }
        if (subLocation !== undefined && subLocation !== ad.subLocation) { ad.subLocation = subLocation; isDetailsModified = true; }
        if (phone && phone !== ad.phone) { ad.phone = phone; isDetailsModified = true; }
        if (phoneTypes) { ad.phoneTypes = typeof phoneTypes === 'string' ? JSON.parse(phoneTypes) : phoneTypes; isDetailsModified = true; }
        if (hidePhone !== undefined) { ad.hidePhone = hidePhone === 'true' || hidePhone === true; isDetailsModified = true; }
        if (additionalPhones) { ad.additionalPhones = typeof additionalPhones === 'string' ? JSON.parse(additionalPhones) : additionalPhones; isDetailsModified = true; }
        if (url !== undefined && url !== ad.url) { ad.url = url; isDetailsModified = true; }
        if (actionType && actionType !== ad.actionType) { ad.actionType = actionType; isDetailsModified = true; }
        if (price !== undefined && price !== ad.price) { ad.price = price; isDetailsModified = true; }
        if (priceType !== undefined && priceType !== ad.priceType) { ad.priceType = priceType; isDetailsModified = true; }
        if (features !== undefined) { ad.features = typeof features === 'string' ? JSON.parse(features) : features; isDetailsModified = true; }

        // Check free-post slot for the trusted review bypass
        let hasFreeSlot = false;
        if (isTrusted && ad.adType !== 'Promoted') {
            const subCatForCheck = subCategory || ad.subCategory;
            const subCatDoc = await SubCategory.findOne({ name: subCatForCheck });
            const freeLimit = subCatDoc ? Number(subCatDoc.freePost || 1) : 1;
            const occupiedCount = await Ad.countDocuments({
                user: req.user.id,
                subCategory: subCatForCheck,
                _id: { $ne: ad._id },
                status: { $in: ['active', 'pending', 'review'] },
                adType: { $ne: 'Promoted' }
            });
            hasFreeSlot = occupiedCount < freeLimit;
        }

        // Set status to review if any detail modified (except for Promoted ads)
        // Trusted users with a free slot bypass review
        if (isDetailsModified) {
            if (ad.adType !== 'Promoted') {
                if (!isTrusted || !hasFreeSlot) {
                    ad.status = 'review';
                }
            }
            ad.userUpdated = true;
        }

        // Process images
        let currentImages = [];
        if (req.body.remainingImages) {
            try {
                currentImages = typeof req.body.remainingImages === 'string'
                    ? JSON.parse(req.body.remainingImages)
                    : req.body.remainingImages;
            } catch (e) {
                console.error("Error parsing remainingImages", e);
                currentImages = ad.images;
            }
        } else {
            currentImages = ad.images;
        }

        const oldImages = ad.images;
        let newAdImages = [...currentImages];

        if (req.files && req.files.length > 0) {
            const newImagePaths = req.files.map(file => file.path.replace(/\\/g, "/"));
            newAdImages = [...currentImages, ...newImagePaths].slice(0, 5);
            isPhotosModified = true;
        } else if (req.body.remainingImages && currentImages.length !== oldImages.length) {
            // Only images removed
            newAdImages = currentImages.slice(0, 5);
        }

        // Apply Moderation: Any user photo edit goes to review (except for Promoted ads)
        // Trusted users with a free slot get images applied directly without pending review
        if (isPhotosModified || (req.body.remainingImages && currentImages.length !== oldImages.length)) {
            if (isTrusted && hasFreeSlot && ad.adType !== 'Promoted') {
                ad.images = newAdImages;
                ad.pendingImages = [];
                ad.userNewPhotos = false;
                ad.photoStatus = 'approved';
            } else {
                ad.pendingImages = newAdImages;
                ad.userNewPhotos = true;
                ad.photoStatus = 'pending';
                if (ad.adType !== 'Promoted') {
                    ad.status = 'review';
                }
                // Active images remain as oldImages until approved
            }
        }

        // Set flags for Admin if modified by User
        if (isDetailsModified) ad.userUpdated = true;

        // Delete removed images from filesystem (only those NOT in either current or pending)
        const deletedImages = oldImages.filter(img => !newAdImages.includes(img) && !ad.images.includes(img) && !(ad.pendingImages || []).includes(img));
        deletedImages.forEach(img => {
            if (img && !img.startsWith('data:') && !img.startsWith('http')) {
                const filePath = path.join(__dirname, '..', img);
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') console.error("Failed to delete image:", err);
                });
            }
        });

        // Check for limit if subCategory is changed for an active/pending ad
        if (subCategory !== undefined && subCategory !== ad.subCategory && ['active', 'pending'].includes(ad.status)) {
            const user = await User.findById(req.user.id);
            if (user && user.merchantTrustStatus !== 'Trusted') {
                const subCatDoc = await SubCategory.findOne({ name: subCategory });
                const freePostLimit = subCatDoc ? (subCatDoc.freePost || 1) : 1;

                const activeAdCountInSubCategory = await Ad.countDocuments({
                    user: req.user.id,
                    subCategory: subCategory,
                    _id: { $ne: ad._id }, // Exclude current ad
                    status: { $in: ['active', 'pending', 'pause', 'review'] }
                });

                if (activeAdCountInSubCategory >= freePostLimit) {
                    ad.status = 'pause';
                    res.message = `Ad updated but paused because the ${subCategory} category limit (${freePostLimit}) is reached.`;
                }
            }
        }

        // Ensure showTill exists
        if (!ad.showTill) {
            const settings = await Setting.findOne();
            const inactiveDays = settings ? (settings.productAutoInactiveTime || 90) : 90;
            const tillDate = new Date(ad.createdAt || new Date());
            tillDate.setDate(tillDate.getDate() + inactiveDays);
            ad.showTill = tillDate;
        }

        await ad.save();

        res.json({
            success: true,
            message: res.message || 'Ad updated successfully',
            data: ad
        });
    } catch (err) {
        console.error("Error updating user ad:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   DELETE api/ads/:id
// @desc    Soft delete an ad by its owner (set status to 'deleted')
// @access  Private
exports.deleteMyAd = async (req, res) => {
    try {
        const adId = req.params.id;
        const ad = await Ad.findOne({ _id: adId, user: req.user.id });
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found or unauthorized' });
        }

        // Instead of hard deleting, we set status to 'deleted'
        ad.status = 'deleted';
        await ad.save();

        res.json({
            success: true,
            message: 'Ad marked as deleted successfully'
        });
    } catch (err) {
        console.error("Error soft deleting user ad:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/ads/:id/promote
// @desc    Promote an ad
// @access  Private
exports.promoteAd = async (req, res) => {
    try {
        const {
            promoteType,
            trafficLink,
            trafficButtonType,
            targetLocations,
            promoteDuration,
            promoteEndDate,
            promoteBudget,
            estimatedReach
        } = req.body;

        const ad = await Ad.findOne({ _id: req.params.id, user: req.user.id });

        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found or unauthorized' });
        }

        // Snapshot previous promotion state (for archiving + "top-up" carry-over)
        const prevAdType = ad.adType;
        const prevPromoteType = ad.promoteType;
        const prevPromoteTag = ad.promoteTag;
        const prevPromoteBudget = ad.promoteBudget;
        const prevPromoteDuration = ad.promoteDuration;
        const prevPromoteStartDate = ad.promoteStartDate;
        const prevPromoteEndDate = ad.promoteEndDate;
        const prevTargetD = ad.targetD;
        const prevTargetValue = ad.targetValue;
        const prevPromotedViews = ad.promotedViews;
        const prevPromotedDeliveryCount = ad.promotedDeliveryCount;

        // Carry over remaining budget from an active promotion (so re-promote doesn't waste remaining value)
        let carriedOverBudget = 0;
        try {
            const prevTypeLower = String(prevAdType || '').trim().toLowerCase();
            const now = new Date();
            const prevStartMs = prevPromoteStartDate ? new Date(prevPromoteStartDate).getTime() : NaN;
            const prevDuration = Number(prevPromoteDuration) || 0;
            const prevBudget = Number(prevPromoteBudget) || 0;
            const isRunningPrev = (prevTypeLower === 'promoted' || prevTypeLower === 'processing') &&
                prevPromoteEndDate &&
                new Date(prevPromoteEndDate) > now;

            if (isRunningPrev && prevDuration > 0 && prevBudget > 0 && Number.isFinite(prevStartMs)) {
                const MS_PER_DAY = 24 * 60 * 60 * 1000;
                const daysElapsed = Math.min(prevDuration, Math.max(1, Math.floor((now.getTime() - prevStartMs) / MS_PER_DAY) + 1));
                const remainingDays = Math.max(0, prevDuration - daysElapsed);
                carriedOverBudget = Math.round((prevBudget / prevDuration) * remainingDays);
            }
        } catch (_) {
            carriedOverBudget = 0;
        }

        const newBudget = Number(promoteBudget) || 0;
        const mergedBudget = Math.max(0, Math.round(newBudget + carriedOverBudget));

        // Update ad fields
        // Update ad fields based on user trust status
        const user = await User.findById(req.user.id);
        const isReviewable = ['pause', 'review', 'pending'].includes(ad.status);

        if (isReviewable) {
            if (user && user.merchantTrustStatus === 'Trusted') {
                ad.status = 'active';
                ad.adType = 'Promoted';
            } else {
                ad.status = 'review';
                ad.adType = 'Processing';
            }
        } else if (ad.status === 'active') {
            ad.adType = 'Promoted';
        } else {
            // For other statuses like rejected or expired, if promoted, move to active (trusted) or review (untrusted)
            if (user && user.merchantTrustStatus === 'Trusted') {
                ad.status = 'active';
                ad.adType = 'Promoted';
            } else {
                ad.status = 'review';
                ad.adType = 'Processing';
            }
        }
        ad.promoteType = promoteType;
        if (promoteType === 'traffic') {
            ad.trafficLink = trafficLink;
            ad.trafficButtonType = trafficButtonType;
        } else {
            ad.trafficLink = undefined;
            ad.trafficButtonType = undefined;
        }
        ad.targetLocations = targetLocations;
        ad.promoteDuration = promoteDuration;
        ad.promoteEndDate = promoteEndDate;
        ad.promoteBudget = mergedBudget;
        ad.estimatedReach = estimatedReach;

        // Keep post lifetime independent from promotion lifetime.
        if (!ad.showTill) {
            const settings = await Setting.findOne();
            const inactiveDays = Number(settings?.productAutoInactiveTime) || 90;
            const tillDate = new Date(ad.createdAt || Date.now());
            tillDate.setDate(tillDate.getDate() + inactiveDays);
            ad.showTill = tillDate;
        }

        // Archive previous promotion if it exists
        if (['promoted', 'processing'].includes(String(prevAdType || '').trim().toLowerCase())) {
            ad.promotionHistory = ad.promotionHistory || [];
            ad.promotionHistory.push({
                startDate: prevPromoteStartDate || ad.createdAt,
                endDate: prevPromoteEndDate || new Date(),
                adType: prevAdType,
                promoteType: prevPromoteType,
                promoteTag: prevPromoteTag,
                budget: prevPromoteBudget,
                targetD: prevTargetD,
                targetValue: prevTargetValue,
                views: prevPromotedViews || 0,
                deliveryCount: prevPromotedDeliveryCount || 0,
                createdAt: new Date()
            });
        }

        // Set Start Date for the new promotion
        ad.promoteStartDate = new Date();

        // Target calculation (Target/D + total Target Value) in performance units (reach/traffic), not money.
        ad.targetD = '0';
        ad.targetValue = 0;
        if (ad.promoteDuration && ad.promoteDuration > 0 && ad.promoteBudget > 0) {
            const dailyBudget = ad.promoteBudget / ad.promoteDuration;

            let plan = null;
            try {
                plan = await PromotionPlan.findOne({ categories: ad.category }).sort({ createdAt: -1 });
                if (!plan) {
                    plan = await PromotionPlan.findOne().sort({ createdAt: -1 });
                }
            } catch (_) {
                plan = null;
            }

            if (plan) {
                const planBaseAmount = Number(plan.amount) || 0;
                const basePerformance = ad.promoteType === 'traffic'
                    ? (Number(plan.traffic) || 0)
                    : (Number(plan.reach) || 0);
                const ratio = planBaseAmount > 0 ? (dailyBudget / planBaseAmount) : 0;

                const dailyTarget = Math.max(0, Math.floor(basePerformance * ratio));
                const totalTarget = dailyTarget * ad.promoteDuration;

                ad.targetD = String(dailyTarget);
                ad.targetValue = totalTarget;

                // Update estimatedReach to match the actual calculated performance
                const gapPercent = parseFloat(String(plan.gapAmount || '0')) || 0;
                const maxTotal = Math.max(totalTarget, Math.floor(totalTarget * (1 + gapPercent / 100)));
                if (totalTarget > 0) {
                    ad.estimatedReach = `${totalTarget}-${maxTotal}`;
                }
            }
        }

        // Reset performance metrics for the new promotion
        ad.promotedViews = 0;
        ad.promotedDeliveryCount = 0;

        await ad.save();

        res.json({
            success: true,
            message: 'Ad promoted successfully',
            data: ad
        });
    } catch (err) {
        console.error("Error promoting ad:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// @route   POST api/ads/admin/create
// @desc    Create ad by admin
// @access  Private (Admin)
exports.createAdAdmin = async (req, res) => {
    try {
        const {
            userMobile, // Admin might provide user mobile to link post
            headline,
            description,
            category,
            subCategory,
            location,
            subLocation,
            phone,
            phoneTypes,
            hidePhone,
            url,
            actionType,
            adType,
            price,
            merchantID,
            priceType,
            showTill,
            note,
            features
        } = req.body;

        // Find user by merchantID or mobile
        let targetUser = null;
        if (merchantID && merchantID.match(/^[0-9a-fA-F]{24}$/)) {
            targetUser = await User.findById(merchantID);
        }
        if (!targetUser) {
            targetUser = await User.findOne({ mobile: userMobile || phone });
        }
        if (!targetUser) {
            // For now, let's require a valid user mobile or handle it as needed
            // return res.status(404).json({ success: false, message: 'Owner user not found' });
            // Let's assume the admin provides a valid phone number from a registered user
        }
        // Process images
        let imagePaths = req.files ? req.files.map(file => file.path.replace(/\\/g, "/")) : [];
        // Removed base64 image processing

        // Calculate showTill if not provided
        let finalShowTill = showTill;
        if (!finalShowTill) {
            const settings = await Setting.findOne();
            const inactiveDays = settings ? (settings.productAutoInactiveTime || 90) : 90;
            const tillDate = new Date();
            tillDate.setDate(tillDate.getDate() + inactiveDays);
            finalShowTill = tillDate;
        }

        let finalStatus = req.body.status || 'active';
        let finalAdType = adType || 'Free';

        if (finalAdType === 'Promoted') {
            const isTrusted = targetUser && targetUser.merchantTrustStatus === 'Trusted';
            if (!isTrusted) {
                finalStatus = 'review';
                finalAdType = 'Processing';
            }
        }

        const newAd = new Ad({
            user: targetUser ? targetUser._id : (req.admin ? req.admin.id : null),
            headline,
            description,
            category,
            subCategory,
            location,
            subLocation,
            phone,
            phoneTypes: phoneTypes ? (typeof phoneTypes === 'string' ? JSON.parse(phoneTypes) : phoneTypes) : ['call'],
            hidePhone: hidePhone === 'true' || hidePhone === true,
            url,
            actionType,
            images: imagePaths,
            adType: finalAdType,
            price,
            priceType: priceType || 'Negotiable',
            merchantID,
            showTill: finalShowTill,
            note,
            features: features ? (typeof features === 'string' ? JSON.parse(features) : features) : {},
            status: finalStatus,
            promoteStartDate: (finalAdType === 'Promoted' || finalAdType === 'Processing') ? new Date() : undefined
        });

        const ad = await newAd.save();

        // If admin creates a promoted ad, upgrade the user to Premium
        if (newAd.adType === 'Promoted' && targetUser) {
            await User.findByIdAndUpdate(targetUser._id, { merchantType: 'Premium' });
            console.log(`✅ User ${targetUser._id} upgraded to Premium after admin created a promoted ad`);
        }

        // Increment Category Post Count
        await Category.findOneAndUpdate(
            { name: category },
            { $inc: { postCount: 1 } }
        );

        // Increment Location Post Count
        await Location.findOneAndUpdate(
            { name: location },
            { $inc: { postCount: 1 } }
        );

        res.status(201).json({
            success: true,
            message: 'Ad created successfully by admin',
            data: ad
        });
    } catch (err) {
        console.error("Error creating ad by admin:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   DELETE api/ads/admin/:id
// @desc    Delete ad by admin
// @access  Private (Admin)
exports.deleteAdAdmin = async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        // Remove images from filesystem
        if (ad.images && ad.images.length > 0) {
            ad.images.forEach(img => {
                if (img && !img.startsWith('data:') && !img.startsWith('http')) {
                    const filePath = path.join(__dirname, '..', img);
                    fs.unlink(filePath, (err) => {
                        if (err && err.code !== 'ENOENT') console.error("Failed to delete image:", err);
                    });
                }
            });
        }
        await ad.deleteOne();

        res.json({
            success: true,
            message: 'Ad deleted successfully by admin'
        });
    } catch (err) {
        console.error("Error deleting ad by admin:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/ads/public/promotion-plans
// @desc    Get all promotion plans for public use
// @access  Public
exports.getAllPromotionPlansPublic = async (req, res) => {
    try {
        const plans = await PromotionPlan.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            data: plans
        });
    } catch (err) {
        console.error("Error fetching promotion plans:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/ads/admin/:id/see
// @desc    Mark ad as seen by admin
// @access  Private (Admin)
exports.markAdAsSeen = async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        const adminName = req.admin.staffName || req.admin.email?.split('@')[0] || 'Admin';

        // Only update if not already edited OR if we want to track who last viewed it
        // User said: yellow means only views the edit but not made any edit.
        // So if already edited (green), maybe we don't need to overwrite senBy for yellow?
        // But let's just set it if req.admin.staffName exists.
        if (!ad.edBy) {
            ad.senBy = adminName;
            await ad.save();
        }

        res.json({
            success: true,
            data: ad
        });
    } catch (err) {
        console.error("Error marking ad as seen:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/ads/:id/toggle-status
// @desc    Toggle user's own ad status between active and pause
// @access  Private
exports.toggleAdStatusMyAd = async (req, res) => {
    try {
        const ad = await Ad.findOne({ _id: req.params.id, user: req.user.id });
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found or unauthorized' });
        }

        // Only allow toggling if it's currently active or paused
        // We don't want to allow toggling from 'pending', 'rejected', 'deleted', etc.
        if (ad.status === 'active') {
            ad.status = 'pause';
        } else if (ad.status === 'pause' || ad.status === 'review') {
            // Check for limit if trying to activate or move from review (if they reached this point)
            const user = await User.findById(req.user.id);
            if (user) {
                const subCatDoc = await SubCategory.findOne({ name: ad.subCategory });
                const freePostLimit = subCatDoc ? (subCatDoc.freePost || 1) : 1;

                const activeAdCountInSubCategory = await Ad.countDocuments({
                    user: req.user.id,
                    subCategory: ad.subCategory,
                    status: { $in: ['active', 'pending', 'review'] },
                    adType: { $ne: 'Promoted' }
                });

                if (activeAdCountInSubCategory >= freePostLimit) {
                    return res.status(400).json({
                        success: false,
                        message: `Limit reached for ${ad.subCategory}. You can have maximum ${freePostLimit} active ads in this category. Promote this ad to bypass the limit.`
                    });
                }

                // If within limit, check trust status
                if (user.merchantTrustStatus === 'Trusted') {
                    ad.status = 'active';
                } else {
                    ad.status = 'review';
                }
            }
        } else {
            return res.status(400).json({
                success: false,
                message: `Cannot toggle status from ${ad.status}.`
            });
        }

        await ad.save();

        res.json({
            success: true,
            message: `Ad is now ${ad.status === 'active' ? 'Active' : 'Paused'}`,
            data: ad
        });
    } catch (err) {
        console.error("Error toggling ad status:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Automatically cleanup expired ads based on showTill date
 * Moves ads to 'inactive' status if showTill < now, excluding currently promoted ads.
 */
exports.cleanupExpiredAds = async () => {
    try {
        const now = new Date();
        // Auto-inactivate active ads and mark when it happened for later auto-reactivation.
        const activeResult = await Ad.updateMany(
            {
                status: 'active',
                adType: { $nin: ['Promoted', 'Processing'] },
                showTill: { $lt: now }
            },
            { $set: { status: 'inactive', autoInactiveAt: now } }
        );

        // Keep previous behavior for review/pause expiry but do not schedule auto-reactivation for those.
        const nonActiveResult = await Ad.updateMany(
            {
                status: { $in: ['review', 'pause'] },
                adType: { $nin: ['Promoted', 'Processing'] },
                showTill: { $lt: now }
            },
            { $set: { status: 'inactive' } }
        );

        const modifiedCount = (activeResult.modifiedCount || 0) + (nonActiveResult.modifiedCount || 0);

        if (modifiedCount > 0) {
            console.log(`[Ad Cleanup] Expired ${modifiedCount} ads to 'inactive' status.`);
        }
        return modifiedCount;
    } catch (err) {
        console.error("[Ad Cleanup] Error during ad expiration cleanup:", err);
        throw err;
    }
};

/**
 * Automatically cleanup expired promotions
 * Moves expired 'Promoted' ads back to 'Free' status and archives their performance.
 */
exports.cleanupExpiredPromotions = async () => {
    try {
        const now = new Date();
        const settings = await Setting.findOne();
        const inactiveDays = Number(settings?.productAutoInactiveTime) || 90;
        const expiredAds = await Ad.find({
            adType: 'Promoted',
            promoteEndDate: { $lt: now }
        });

        if (expiredAds.length > 0) {
            console.log(`[Ad Cleanup] Found ${expiredAds.length} expired promotions at ${now.toISOString()}`);

            for (const ad of expiredAds) {
                // 1. Archive current promotion metrics to history
                ad.promotionHistory = ad.promotionHistory || [];
                ad.promotionHistory.push({
                    startDate: ad.promoteStartDate || ad.createdAt,
                    endDate: ad.promoteEndDate,
                    adType: ad.adType,
                    promoteType: ad.promoteType,
                    promoteTag: ad.promoteTag,
                    budget: ad.promoteBudget,
                    targetD: ad.targetD,
                    targetValue: ad.targetValue,
                    views: ad.promotedViews || 0,
                    deliveryCount: ad.promotedDeliveryCount || 0,
                    createdAt: new Date()
                });

                // 2. Clear promotion metadata but keep the ad active as a Free post
                ad.adType = 'Free';
                ad.promoteType = undefined;
                ad.promoteTag = '';
                ad.trafficLink = undefined;
                ad.trafficButtonType = undefined;
                ad.targetLocations = [];
                ad.promoteBudget = undefined;
                ad.promoteDuration = undefined;
                ad.promoteStartDate = undefined;
                ad.promoteEndDate = undefined;
                ad.estimatedReach = undefined;
                ad.labels = [];

                // Ensure promotion never shortens the base post lifetime.
                const baseShowTill = new Date(ad.createdAt || Date.now());
                baseShowTill.setDate(baseShowTill.getDate() + inactiveDays);
                if (!ad.showTill || new Date(ad.showTill) < baseShowTill) {
                    ad.showTill = baseShowTill;
                }


                // Save the changes
                await ad.save();
                console.log(`[Ad Cleanup] Ad ${ad._id} reverted to Free post.`);
            }
            return expiredAds.length;
        }
        return 0;
    } catch (err) {
        console.error("[Ad Cleanup] Critical error during promotion cleanup:", err);
        throw err;
    }
};
