const express = require('express');
const router = express.Router();
const { authenticateUser: protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
    sendMessage,
    getMessages,
    getConversations,
    markAsSeen,
    deleteConversations,
    blockUser,
    requestCallMe
} = require('../controllers/messageController');

// @route   POST /api/messages/call-me
// @desc    Request a call back from seller
// @access  Private
router.post('/call-me', protect, requestCallMe);

// @route   PUT /api/messages/block/:userId
// @desc    Block or unblock a user
// @access  Private
router.put('/block/:userId', protect, blockUser);

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/', protect, upload.single('image'), sendMessage);

// @route   DELETE /api/messages/conversations
// @desc    Delete conversations
// @access  Private
router.delete('/conversations', protect, deleteConversations);

// @route   GET /api/messages/conversations
// @desc    Get all conversations
// @access  Private
router.get('/conversations', protect, getConversations);

// @route   GET /api/messages/chat/:adId/:otherUserId
// @desc    Get messages for a specific ad and user
// @access  Private
router.get('/chat/:adId/:otherUserId', protect, getMessages);

// @route   PUT /api/messages/seen/:adId/:otherUserId
// @desc    Mark messages as seen
// @access  Private
router.put('/seen/:adId/:otherUserId', protect, markAsSeen);

module.exports = router;
