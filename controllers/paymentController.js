const SSLCommerzPayment = require('sslcommerz-lts');
const Payment = require('../models/Payment');
const Ad = require('../models/Ad');
const User = require('../models/User');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Setting = require('../models/Setting');
const PromotionPlan = require('../models/PromotionPlan');

// SSL Commerz Configuration
const getSslConfig = () => ({
    store_id: process.env.SSL_STORE_ID,
    store_passwd: process.env.SSL_STORE_PASS,
    is_live: process.env.SSL_IS_LIVE === 'true'
});

const initPayment = async (req, res) => {
    try {
        const { adId, totalAmount, userName, userMobile, description, promotionDetails, paymentType } = req.body;
        const userId = req.user.id;

        if (!totalAmount) {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }

        if (paymentType !== 'verification' && !adId) {
            return res.status(400).json({ success: false, message: "Ad ID and amount are required" });
        }

        const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const data = {
            total_amount: totalAmount,
            currency: 'BDT',
            tran_id: transactionId,
            success_url: `${process.env.BACKEND_URL}/api/payment/success/${transactionId}`,
            fail_url: `${process.env.BACKEND_URL}/api/payment/fail/${transactionId}`,
            cancel_url: `${process.env.BACKEND_URL}/api/payment/cancel/${transactionId}`,
            ipn_url: `${process.env.BACKEND_URL}/api/payment/ipn`,
            shipping_method: 'Courier',
            product_name: 'Ad Promotion',
            product_category: 'Service',
            product_profile: 'general',
            cus_name: userName || 'Customer',
            cus_email: req.user.email || 'customer@example.com',
            cus_add1: 'Dhaka',
            cus_add2: 'Dhaka',
            cus_city: 'Dhaka',
            cus_state: 'Dhaka',
            cus_postcode: '1000',
            cus_country: 'Bangladesh',
            cus_phone: userMobile || '01700000000',
            cus_fax: '01700000000',
            ship_name: userName || 'Customer',
            ship_add1: 'Dhaka',
            ship_add2: 'Dhaka',
            ship_city: 'Dhaka',
            ship_state: 'Dhaka',
            ship_postcode: 1000,
            ship_country: 'Bangladesh',
        };

        const { store_id, store_passwd, is_live } = getSslConfig();
        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

        const apiResponse = await sslcz.init(data);
        let GatewayPageURL = apiResponse.GatewayPageURL;

        if (GatewayPageURL) {
            // Save Pending Payment to DB
            const newPayment = new Payment({
                user: userId,
                ...(adId && { ad: adId }),
                userName,
                userMobile,
                amount: totalAmount,
                transactionId,
                description,
                promotionDetails: { ...promotionDetails, paymentType },
                status: 'PENDING'
            });
            await newPayment.save();

            // Record in Transaction collection (PENDING)
            const newTransaction = new Transaction({
                tnxId: transactionId,
                mode: 'Online',
                sellerId: userId,
                productId: adId,
                mobileNumber: userMobile,
                amount: totalAmount,
                payType: 'Online',
                payeeName: userName,
                item: promotionDetails?.paymentType === 'verification' || promotionDetails?.isVerifyBadge ? 'Verify Badge' : 'Ad Promotion',
                status: 'PENDING'
            });
            await newTransaction.save();

            res.status(200).json({ success: true, url: GatewayPageURL });
        } else {
            console.error("SSL Commerz Init Failed. Response:", apiResponse);
            res.status(400).json({
                success: false,
                message: apiResponse?.failedreason || "Failed to initialize payment gateway",
                error: apiResponse
            });
        }

    } catch (error) {
        console.error("Payment Init Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const successPayment = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const paymentData = req.body;

        // Verify Payment with SSL Commerz
        const { store_id, store_passwd, is_live } = getSslConfig();
        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        const validation = await sslcz.validate(paymentData);

        if (validation.status === 'VALID' || validation.status === 'AUTHENTICATED') {
            const payment = await Payment.findOneAndUpdate(
                { transactionId },
                {
                    status: 'VALID',
                    method: paymentData.card_type || paymentData.method,
                    paymentDetails: paymentData
                },
                { new: true }
            );

            // Update Transaction to VALID
            await Transaction.findOneAndUpdate(
                { tnxId: transactionId },
                {
                    status: 'VALID',
                    payType: paymentData.card_type || paymentData.method || 'Online',
                    payTime: new Date()
                }
            );

            // Update Ad Promotion Status (if ad exists)
            if (payment && payment.ad && payment.promotionDetails) {
                const {
                    promoteType,
                    trafficLink,
                    trafficButtonType,
                    targetLocations,
                    promoteDuration,
                    promoteEndDate,
                    promoteBudget,
                    estimatedReach,
                    isHighlight,
                    highlightType,
                    isPostLevel,
                    selectedLabels
                } = payment.promotionDetails;

                // Map highlightType to promoteTag if highlighted
                let promoteTag = 'All';
                if (isHighlight) {
                    if (highlightType === 'Hot Sale') promoteTag = 'Highlights';
                    else if (highlightType === 'Discount') promoteTag = 'Discount';
                    else if (highlightType === 'Urgent') promoteTag = 'Urgent';
                    else promoteTag = 'Highlights';
                }

                const ad = await Ad.findById(payment.ad);
                if (ad) {
                    const originalStatus = ad.status;
                    const userDoc = payment.user ? await User.findById(payment.user) : (ad.user ? await User.findById(ad.user) : null);
                    const isTrusted = userDoc && String(userDoc.merchantTrustStatus || '').trim().toLowerCase() === 'trusted';
                    const isReviewable = ['pause', 'review', 'pending'].includes(originalStatus);

                    // If the post is already running a promotion, carry over the remaining (unspent) budget
                    // so a re-promotion behaves like a "top-up" instead of discarding the remaining value.
                    let carriedOverBudget = 0;
                    try {
                        const prevTypeLower = String(ad.adType || '').trim().toLowerCase();
                        const now = new Date();
                        const prevStartMs = ad.promoteStartDate ? new Date(ad.promoteStartDate).getTime() : NaN;
                        const prevDuration = Number(ad.promoteDuration) || 0;
                        const prevBudget = Number(ad.promoteBudget) || 0;
                        const isRunningPrev = (prevTypeLower === 'promoted' || prevTypeLower === 'processing') &&
                            ad.promoteEndDate &&
                            new Date(ad.promoteEndDate) > now;

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

                    // Archive previous promotion if it exists
                    if (['promoted', 'processing'].includes(String(ad.adType || '').trim().toLowerCase())) {
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
                    }

                    // Update with new promotion details
                    if (isReviewable) {
                        if (isTrusted) {
                            ad.status = 'active';
                            ad.adType = 'Promoted';
                        } else {
                            ad.status = 'review';
                            ad.adType = 'Processing';
                        }
                    } else if (originalStatus === 'active') {
                        ad.adType = 'Promoted';
                    } else {
                        if (isTrusted) {
                            ad.status = 'active';
                            ad.adType = 'Promoted';
                        } else {
                            ad.status = 'review';
                            ad.adType = 'Processing';
                        }
                    }
                    ad.promoteType = promoteType;
                    ad.trafficLink = trafficLink;
                    ad.trafficButtonType = trafficButtonType;
                    ad.targetLocations = targetLocations;
                    ad.promoteDuration = promoteDuration;
                    ad.promoteStartDate = new Date(); // Start tracking performance from NOW
                    ad.promoteEndDate = new Date(promoteEndDate);
                    ad.promoteBudget = mergedBudget;
                    ad.estimatedReach = estimatedReach;
                    ad.promoteTag = promoteTag;

                    // Keep post lifetime independent from promotion lifetime.
                    if (!ad.showTill) {
                        const settings = await Setting.findOne();
                        const inactiveDays = Number(settings?.productAutoInactiveTime) || 90;
                        const tillDate = new Date(ad.createdAt || Date.now());
                        tillDate.setDate(tillDate.getDate() + inactiveDays);
                        ad.showTill = tillDate;
                    }

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
                            const basePerformance = promoteType === 'traffic'
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

                    // Support labels (persist for both user/admin flows)
                    const incomingLabels = Array.isArray(selectedLabels)
                        ? selectedLabels
                        : (selectedLabels ? [selectedLabels] : []);
                    const cleanedLabels = (incomingLabels || [])
                        .map(l => (typeof l === 'string' ? l.trim() : String(l || '').trim()))
                        .filter(Boolean);

                    // If user explicitly chose Post Level, allow clearing by sending an empty list.
                    if (isPostLevel === true) {
                        ad.labels = Array.from(new Set(cleanedLabels));
                    } else if (cleanedLabels.length > 0) {
                        // Backward/forward compatibility: some clients may send labels without isPostLevel.
                        ad.labels = Array.from(new Set(cleanedLabels));
                    } else if (promoteTag && promoteTag !== 'All') {
                        // If this promotion is a highlight tag (Urgent/Discount/etc), store it as a label too.
                        ad.labels = [promoteTag];
                    }

                    // Reset performance metrics for the new period
                    ad.promotedViews = 0;
                    ad.promotedDeliveryCount = 0;

                    await ad.save();
                }

                // Automatically upgrade user to Premium only when ad is actually Promoted
                if (payment.user && ad && (ad.adType || '').toLowerCase() === 'promoted') {
                    await User.findByIdAndUpdate(payment.user, {
                        merchantType: 'Premium'
                    });
                    console.log(`✅ User ${payment.user} upgraded to Premium after promoting ad ${payment.ad}`);
                }

                console.log(`✅ Ad ${payment.ad} promoted and items updated after payment ${transactionId}`);
            }

            // Handle User Verification Badge (whether connected to an Ad or standalone)
            if (payment && payment.promotionDetails && payment.promotionDetails.isVerifyBadge && payment.user) {
                await User.findByIdAndUpdate(payment.user, {
                    verifiedAt: new Date(),
                    merchantType: 'Premium',
                    merchantTrustStatus: 'Trusted',
                    mVerified: true
                });
                console.log(`✅ User ${payment.user} verified via payment ${transactionId}`);
            }

            // Redirect back to frontend success page
            res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=success&txnId=${transactionId}`);
        } else {
            res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=failed&txnId=${transactionId}`);
        }
    } catch (error) {
        console.error("Payment Success Callback Error:", error);
        res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=error`);
    }
};

const failPayment = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const paymentData = req.body;

        await Payment.findOneAndUpdate(
            { transactionId },
            {
                status: 'FAILED',
                paymentDetails: paymentData
            }
        );

        // Update Transaction to FAILED
        await Transaction.findOneAndUpdate(
            { tnxId: transactionId },
            { status: 'FAILED' }
        );

        res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=failed&txnId=${transactionId}`);
    } catch (error) {
        console.error("Payment Fail Callback Error:", error);
        res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=error`);
    }
};

const cancelPayment = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const paymentData = req.body;

        await Payment.findOneAndUpdate(
            { transactionId },
            {
                status: 'CANCELLED',
                paymentDetails: paymentData
            }
        );

        // Update Transaction to CANCELLED
        await Transaction.findOneAndUpdate(
            { tnxId: transactionId },
            { status: 'CANCELLED' }
        );

        res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=cancelled&txnId=${transactionId}`);
    } catch (error) {
        console.error("Payment Cancel Callback Error:", error);
        res.redirect(`${process.env.FRONTEND_URL}/payment/status?status=error`);
    }
};

const ipnPayment = async (req, res) => {
    // SSL Commerz will call this in the background
    console.log("IPN received:", req.body);
    res.status(200).send("OK");
};

module.exports = {
    initPayment,
    successPayment,
    failPayment,
    cancelPayment,
    ipnPayment
};
