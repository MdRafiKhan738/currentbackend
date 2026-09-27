const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Ad = require('../models/Ad');
const fs = require('fs');
const path = require('path');

// @route   POST api/messages
// @desc    Send a message
// @access  Private
exports.sendMessage = async (req, res) => {
    try {
        const { receiverId, adId, text } = req.body;
        const senderId = req.user.id;

        if (!receiverId || !adId) {
            return res.status(400).json({ success: false, message: 'Receiver and Ad ID are required' });
        }

        // Check for blocks
        const senderUser = await User.findById(senderId);
        const receiverUser = await User.findById(receiverId);

        if (!senderUser || !receiverUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (senderUser.blockedUsers.includes(receiverId)) {
            return res.status(403).json({ success: false, message: 'You have blocked this user' });
        }

        if (receiverUser.blockedUsers.includes(senderId)) {
            return res.status(403).json({ success: false, message: 'This user has blocked you' });
        }

        // Process image if exists
        let imagePath = req.file ? req.file.path.replace(/\\/g, "/") : null;

        // Find or create conversation
        let conversation = await Conversation.findOne({
            ad: adId,
            participants: { $all: [senderId, receiverId] }
        });

        if (!conversation) {
            conversation = new Conversation({
                participants: [senderId, receiverId],
                ad: adId
            });
        }

        // Remove both users from deletedBy on new message so it reappears
        conversation.deletedBy = [];

        const newMessage = new Message({
            sender: senderId,
            receiver: receiverId,
            ad: adId,
            text: text || '',
            image: imagePath || '',
            messageType: req.body.messageType || 'text',
            status: 'delivered'
        });

        const savedMessage = await newMessage.save();

        // Update conversation last message and update time
        conversation.lastMessage = savedMessage._id;
        conversation.updatedAt = Date.now();
        await conversation.save();

        res.status(201).json({
            success: true,
            data: savedMessage
        });
    } catch (err) {
        console.error("Error sending message:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/messages/chat/:adId/:otherUserId
// @desc    Get messages for a specific ad and user pair
// @access  Private
exports.getMessages = async (req, res) => {
    try {
        const { adId, otherUserId } = req.params;
        const myId = req.user.id;

        const messages = await Message.find({
            ad: adId,
            $or: [
                { sender: myId, receiver: otherUserId },
                { sender: otherUserId, receiver: myId }
            ],
            deletedBy: { $ne: myId } // Don't show messages I've "deleted"
        }).sort({ createdAt: 1 });

        res.json({
            success: true,
            data: messages
        });
    } catch (err) {
        console.error("Error fetching messages:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   GET api/messages/conversations
// @desc    Get all conversations for the logged-in user
// @access  Private
exports.getConversations = async (req, res) => {
    try {
        const myId = req.user.id;
        const { search } = req.query;

        let query = {
            participants: { $in: [myId] },
            deletedBy: { $ne: myId } // Don't show conversations I've "deleted"
        };

        let conversations = await Conversation.find(query)
            .populate({
                path: 'ad',
                select: 'headline price images user location category',
                populate: {
                    path: 'user',
                    select: 'name storeName photo'
                }
            })
            .populate('participants', 'name storeName photo storeLogo')
            .populate('lastMessage')
            .sort({ updatedAt: -1 });

        // If search query exists, filter the conversations
        if (search) {
            const searchLower = search.toLowerCase();
            conversations = conversations.filter(conv => {
                const otherUser = conv.participants.find(p => p?._id?.toString() !== myId.toString());
                const ad = conv.ad;

                // Match user name or store name
                const userNameMatch = (otherUser?.name || '').toLowerCase().includes(searchLower) ||
                    (otherUser?.storeName || '').toLowerCase().includes(searchLower);

                // Match user ID
                const userIdMatch = otherUser?._id?.toString().toLowerCase().includes(searchLower);

                // Match ad name (headline)
                const adNameMatch = (ad?.headline || '').toLowerCase().includes(searchLower);

                // Match ad ID
                const adIdMatch = ad?._id?.toString().toLowerCase().includes(searchLower);

                // Match last message text
                const lastMessageMatch = conv.lastMessage?.text?.toLowerCase().includes(searchLower);

                return userNameMatch || userIdMatch || adNameMatch || adIdMatch || lastMessageMatch;
            });
        }

        // For each conversation, count unread messages where receiver is me
        const conversationsWithUnread = await Promise.all(conversations.map(async (conv) => {
            const otherUser = conv.participants.find(p => p?._id?.toString() !== myId.toString());
            const realUnreadCount = await Message.countDocuments({
                ad: conv.ad?._id,
                sender: otherUser?._id,
                receiver: myId,
                status: 'delivered',
                deletedBy: { $ne: myId }
            });

            return {
                ...conv.toObject(),
                unreadCount: realUnreadCount
            };
        }));

        res.json({
            success: true,
            data: conversationsWithUnread
        });
    } catch (err) {
        console.error("Error fetching conversations:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   DELETE api/messages/conversations
// @desc    Delete conversations
// @access  Private
exports.deleteConversations = async (req, res) => {
    try {
        const { conversationIds } = req.body;
        const myId = req.user.id;

        if (!conversationIds || !Array.isArray(conversationIds)) {
            return res.status(400).json({ success: false, message: 'Conversation IDs required as an array' });
        }

        for (const convId of conversationIds) {
            const conversation = await Conversation.findOne({ _id: convId, participants: { $in: [myId] } });
            if (conversation) {
                // Add me to deletedBy of conversation
                if (!conversation.deletedBy.includes(myId)) {
                    conversation.deletedBy.push(myId);
                    await conversation.save();
                }

                // Add me to deletedBy of all shared messages in this conversation
                const otherUserId = conversation.participants.find(p => p.toString() !== myId.toString());
                await Message.updateMany(
                    {
                        ad: conversation.ad,
                        $or: [
                            { sender: myId, receiver: otherUserId },
                            { sender: otherUserId, receiver: myId }
                        ],
                        deletedBy: { $ne: myId }
                    },
                    { $push: { deletedBy: myId } }
                );
            }
        }

        res.json({ success: true, message: 'Conversations hidden for you' });
    } catch (err) {
        console.error("Error deleting conversations:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/messages/seen/:adId/:otherUserId
// @desc    Mark messages as seen
// @access  Private
exports.markAsSeen = async (req, res) => {
    try {
        const { adId, otherUserId } = req.params;
        const myId = req.user.id;

        await Message.updateMany(
            { ad: adId, sender: otherUserId, receiver: myId, status: 'delivered' },
            { $set: { status: 'seen' } }
        );

        res.json({ success: true, message: 'Messages marked as seen' });
    } catch (err) {
        console.error("Error marking messages as seen:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @route   PUT api/messages/block/:userId
// @desc    Block or unblock a user
// @access  Private
exports.blockUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const myId = req.user.id;

        const user = await User.findById(myId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const index = user.blockedUsers.indexOf(userId);
        let message = '';
        if (index > -1) {
            user.blockedUsers.splice(index, 1);
            message = 'User unblocked';
        } else {
            user.blockedUsers.push(userId);
            message = 'User blocked';
        }

        await user.save();
        res.json({ success: true, message });
    } catch (err) {
        console.error("Error blocking user:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// @route   POST api/messages/call-me
// @desc    Request a call back (Auto-message)
// @access  Private
exports.requestCallMe = async (req, res) => {
    try {
        const { adId } = req.body;
        const senderId = req.user.id;

        const ad = await Ad.findById(adId).populate('user');
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        const receiverId = ad.user?._id;
        if (!receiverId) {
            return res.status(404).json({ success: false, message: 'Seller not found' });
        }

        if (senderId.toString() === receiverId.toString()) {
            return res.status(400).json({ success: false, message: 'You cannot request a call back from yourself' });
        }

        const senderUser = await User.findById(senderId);

        // Auto-message text in Bengali as requested
        const autoText = `${senderUser.name} এই বিজ্ঞাপনের ব্যাপারে আগ্রহী। কল ব্যাক -এর অনুরোধ করেছেন। তার মোবাইল নাম্বার : ${senderUser.mobile || 'N/A'}।`;

        // Find or create conversation
        let conversation = await Conversation.findOne({
            ad: adId,
            participants: { $all: [senderId, receiverId] }
        });

        if (!conversation) {
            conversation = new Conversation({
                participants: [senderId, receiverId],
                ad: adId
            });
        }

        conversation.deletedBy = [];

        const newMessage = new Message({
            sender: senderId,
            receiver: receiverId,
            ad: adId,
            text: autoText,
            messageType: 'callme',
            status: 'delivered'
        });

        const savedMessage = await newMessage.save();
        conversation.lastMessage = savedMessage._id;
        conversation.updatedAt = Date.now();
        await conversation.save();

        res.status(201).json({
            success: true,
            message: 'Call back request sent successfully',
            data: savedMessage
        });
    } catch (err) {
        console.error("Error requesting call me:", err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
