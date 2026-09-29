const ConnectLog = require('../models/ConnectLog');
const User = require('../models/User');
const PhoneReveal = require('../models/PhoneReveal');
const CreditTransaction = require('../models/CreditTransaction');

// A connection is available whenever the account has at least 1 connect/credit.
// An active package is not required when the account already has connectsBalance.
const activePackageFilter = (userId, types) => ({
    _id: userId,
    connectsBalance: { $gt: 0 }
});

const chargeOneConnect = async (userId) => {
    const user = await User.findOneAndUpdate(
        { _id: userId, connectsBalance: { $gt: 0 } },
        { $inc: { connectsBalance: -1, creditsUsed: 1 } },
        { new: true }
    );

    if (!user) return null;

    // Keep package counters synchronized when this balance belongs to an active package.
    if (Number(user.activePackage?.creditsRemaining || 0) > 0) {
        user.activePackage.creditsRemaining = Math.max(0, Number(user.activePackage.creditsRemaining) - 1);
        user.activePackage.usedCredits = Number(user.activePackage.usedCredits || 0) + 1;
        await user.save();
    }

    return user;
};

exports.deductConnect = async (req, res) => {
    try {
        const { actionType, amountSpent, targetUserId } = req.body;
        const userId = req.user.id;
        const validActionTypes = ['call', 'message', 'proposal', 'post_ad', 'view_phone'];
        const requiresTargetUser = ['call', 'message', 'proposal', 'view_phone'].includes(actionType);
        if (!validActionTypes.includes(actionType)) return res.status(400).json({ success:false, message:'Unsupported connect action type.' });
        if (requiresTargetUser && !targetUserId) return res.status(400).json({ success:false, message:'A valid target user is required for this action.' });
        if (actionType === 'post_ad' && targetUserId) return res.status(400).json({ success:false, message:'Post creation cannot include a target user.' });
        const amount = Number(amountSpent);
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success:false, message:'Amount spent must be positive.' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success:false, message:'User not found' });
        if (Number(user.connectsBalance || 0) < amount) return res.status(400).json({ success:false, message:'Insufficient connects balance' });
        const before = Number(user.connectsBalance || 0);
        user.connectsBalance = before - amount;
        await user.save();
        await ConnectLog.create({ userId, actionType, amountSpent:amount, targetUserId:requiresTargetUser ? targetUserId : undefined });
        res.json({ success:true, message:'Connect deducted successfully', balance:user.connectsBalance });
    } catch (err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.revealPhone = async (req, res) => {
    try {
        const { adId } = req.body;
        const Ad = require('../models/Ad');
        const ad = await Ad.findById(adId).select('phone user hidePhone');
        if (!ad) return res.status(404).json({ success:false, message:'Post not found' });
        if (!ad.phone) return res.status(404).json({ success:false, message:'This post has no phone number.' });
        const viewerId = String(req.user.id);
        const ownerId = String(ad.user);
        if (viewerId === ownerId) return res.json({ success:true, phone:ad.phone, balance:null, ownNumber:true });

        let reveal;
        try {
            reveal = await PhoneReveal.findOneAndUpdate(
                { viewerId, adId, status:{ $in:['PENDING','OPEN'] } },
                { $setOnInsert:{ viewerId, profileOwnerId:ad.user, adId, status:'PENDING' } },
                { new:true, upsert:true }
            );
        } catch (error) {
            if (error?.code !== 11000) throw error;
            reveal = await PhoneReveal.findOne({ viewerId, adId, status:{ $in:['PENDING','OPEN'] } });
        }
        if (reveal?.status === 'OPEN') return res.json({ success:true, phone:ad.phone, balance:null, revealId:reveal._id, alreadyRevealed:true });

        const claimedReveal = await PhoneReveal.findOneAndUpdate(
            { _id:reveal._id, status:'PENDING', chargingStartedAt:{ $exists:false } },
            { $set:{ chargingStartedAt:new Date() } },
            { new:true }
        );
        if (!claimedReveal) {
            const completed = await PhoneReveal.findById(reveal._id);
            if (completed?.status === 'OPEN') return res.json({ success:true, phone:ad.phone, balance:null, revealId:completed._id, alreadyRevealed:true });
            return res.status(409).json({ success:false, code:'REVEAL_IN_PROGRESS', message:'Your number reveal is already being processed. Please try again.' });
        }

        let chargedUser = await chargeOneConnect(viewerId);
        if (!chargedUser) {
            await PhoneReveal.deleteOne({ _id:reveal._id, status:'PENDING' });
            return res.status(403).json({ success:false, code:'PACKAGE_REQUIRED', message:'Purchase an active package to view this number.' });
        }

        const balanceBefore = Number(chargedUser.connectsBalance) + 1;
        claimedReveal.chargedUserId = chargedUser._id;
        claimedReveal.packageId = chargedUser.activePackage?.packageId;
        claimedReveal.status = 'OPEN';
        claimedReveal.openedAt = new Date();
        await claimedReveal.save();

        const socketio = req.app.get('socketio');
        if (socketio) {
            socketio.to(String(chargedUser._id)).emit('credit balance updated', {
                userId: String(chargedUser._id),
                balance: chargedUser.connectsBalance,
                creditsUsed: chargedUser.creditsUsed
            });
        }

        await Promise.all([
            ConnectLog.create({ userId:chargedUser._id, actionType:'view_phone', amountSpent:1, targetUserId:ad.user }),
            CreditTransaction.create({
                userId:chargedUser._id, type:'REVEAL', amount:-1,
                balanceBefore, balanceAfter:chargedUser.connectsBalance,
                source:'PHONE_REVEAL', targetUserId:ad.user, postId:ad._id,
                packageId:chargedUser.activePackage?.packageId, phoneRevealId:claimedReveal._id,
                reason:'Phone number revealed'
            }),
            User.updateOne({ _id:ad.user }, { $inc:{ numberShowupCount:1 } })
        ]);
        res.json({ success:true, phone:ad.phone, balance:chargedUser.connectsBalance, revealId:claimedReveal._id });
    } catch (err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.closePhoneReveal = async (req, res) => {
    try {
        const reveal = await PhoneReveal.findOne({ _id:req.params.id, viewerId:req.user.id, status:'OPEN' });
        if (!reveal) return res.json({ success:true, refunded:false });
        const chargedUser = await User.findById(reveal.chargedUserId).select('activePackage connectsBalance');
        const refundable = Boolean(chargedUser?.activePackage?.returnCreditOnClose);
        if (refundable && reveal.chargedUserId) {
            const updated = await User.findOneAndUpdate(
                { _id:reveal.chargedUserId, 'activePackage.packageId':reveal.packageId },
                { $inc:{ 'activePackage.creditsRemaining':1, 'activePackage.usedCredits':-1, connectsBalance:1, creditsUsed:-1, creditsRefunded:1 } },
                { new:true }
            );
            if (updated) {
                await CreditTransaction.create({
                    userId:updated._id, type:'REFUND', amount:1,
                    balanceBefore:Number(updated.activePackage.creditsRemaining)-1,
                    balanceAfter:updated.activePackage.creditsRemaining,
                    source:'PHONE_REVEAL_CLOSE', targetUserId:reveal.profileOwnerId,
                    postId:reveal.adId, packageId:reveal.packageId,
                    reason:'Refunded under package close-number policy'
                });
                await User.updateOne({ _id:reveal.profileOwnerId }, { $inc:{ numberShowupCount:-1 } });
            }
        }
        reveal.status = refundable ? 'REFUNDED' : 'CLOSED';
        if (refundable) reveal.refundedAt = new Date();
        await reveal.save();
        res.json({ success:true, refunded:refundable });
    } catch (err) { res.status(500).json({ success:false, message:err.message }); }
};

exports.getConnectLogs = async (req,res) => {
    try {
        const filter = req.query.userId ? { userId:req.query.userId } : { userId:req.user.id };
        const logs = await ConnectLog.find(filter).populate('userId','name email mobile').populate('targetUserId','name email mobile').sort({createdAt:-1});
        res.json({success:true,data:logs});
    } catch(err){res.status(500).json({success:false,message:err.message});}
};

exports.getCreditTransactions = async (req,res) => {
    try {
        const transactions = await CreditTransaction.find({userId:req.user.id}).populate('targetUserId','name mobile').populate('postId','headline').sort({createdAt:-1}).limit(100).lean();
        res.json({success:true,data:transactions});
    } catch(err){res.status(500).json({success:false,message:'Unable to load credit history.'});}
};

exports.unlockPost = async (req, res) => {
    try {
        const { adId, actionType = 'message' } = req.body;
        const userId = String(req.user.id);
        if (!adId) return res.status(400).json({ success:false, message:'Post ID is required.' });
        if (!['message','proposal'].includes(actionType)) {
            return res.status(400).json({ success:false, message:'Invalid connection action.' });
        }

        const Ad = require('../models/Ad');
        const ad = await Ad.findById(adId).select('user phone status');
        if (!ad) return res.status(404).json({ success:false, message:'Post not found.' });
        if (String(ad.user) === userId) return res.json({ success:true, unlocked:true, ownPost:true });

        const existing = await PhoneReveal.findOne({
            viewerId:userId,
            adId,
            status:{ $in:['PENDING','OPEN'] }
        });
        if (existing?.status === 'OPEN') {
            return res.json({ success:true, unlocked:true, alreadyUnlocked:true, revealId:existing._id });
        }

        const reveal = existing || await PhoneReveal.create({
            viewerId:userId,
            profileOwnerId:ad.user,
            adId,
            status:'PENDING'
        });

        const claimed = await PhoneReveal.findOneAndUpdate(
            { _id:reveal._id, status:'PENDING', chargingStartedAt:{ $exists:false } },
            { $set:{ chargingStartedAt:new Date(), connectMethod:actionType } },
            { new:true }
        );
        if (!claimed) {
            const completed = await PhoneReveal.findById(reveal._id);
            if (completed?.status === 'OPEN') {
                return res.json({ success:true, unlocked:true, alreadyUnlocked:true, revealId:completed._id });
            }
            return res.status(409).json({ success:false, message:'Connection is already being processed. Please try again.' });
        }

        const chargedUser = await chargeOneConnect(userId);

        if (!chargedUser) {
            await PhoneReveal.deleteOne({ _id:reveal._id, status:'PENDING' });
            return res.status(403).json({
                success:false,
                code:'PACKAGE_REQUIRED',
                message:'Purchase an active package to connect with this post.'
            });
        }

        const balanceBefore = Number(chargedUser.connectsBalance) + 1;
        claimed.chargedUserId = chargedUser._id;
        claimed.packageId = chargedUser.activePackage?.packageId;
        claimed.connectMethod = actionType;
        claimed.status = 'OPEN';
        claimed.openedAt = new Date();
        await claimed.save();

        const socketio = req.app.get('socketio');
        if (socketio) {
            socketio.to(String(chargedUser._id)).emit('credit balance updated', {
                userId: String(chargedUser._id),
                balance: chargedUser.connectsBalance,
                creditsUsed: chargedUser.creditsUsed
            });
        }

        await Promise.all([
            ConnectLog.create({ userId:chargedUser._id, actionType, amountSpent:1, targetUserId:ad.user }),
            CreditTransaction.create({
                userId:chargedUser._id,
                type:'REVEAL',
                amount:-1,
                balanceBefore,
                balanceAfter:chargedUser.connectsBalance,
                source:'POST_CONNECTION',
                targetUserId:ad.user,
                postId:ad._id,
                packageId:chargedUser.activePackage?.packageId,
                phoneRevealId:claimed._id,
                reason:'First connection unlocked for post'
            })
        ]);

        res.json({ success:true, unlocked:true, balance:chargedUser.connectsBalance, revealId:claimed._id });
    } catch (err) {
        console.error('unlockPost error:', err);
        res.status(500).json({ success:false, message:err.message });
    }
};
