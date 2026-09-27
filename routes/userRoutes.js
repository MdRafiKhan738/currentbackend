const express = require('express');
const router = express.Router();
const {
    registerUser, loginUser, getMe, updateProfile,
    getUserActivity, updateNotifySettings,
    addNotifyPreference, removeNotifyPreference,
    getNotifications, markNotificationAsRead,
    checkEmail, checkMobile, facebookLogin, googleLogin,
    toggleNotifyPreference, toggleFavoriteAd, getPublicProfile,
    getPremiumUsers, followUser, checkSellerUrl,
    incrementProfileViews, rateUser, changePassword, requestDelete
} = require('../controllers/userController');
const {
    requestOTP, verifyOTP, requestMobileOTP, verifyMobileOTP,
    forgotPasswordRequest, forgotPasswordVerify
} = require('../controllers/authController');
const { authenticateUser: protect } = require('../middleware/auth');

// @route   POST /api/user/register
// @desc    Register a new user
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/user/login
// @desc    Login user
// @access  Public
router.post('/login', loginUser);
router.post('/check-mobile', checkMobile);
router.post('/check-email', checkEmail);

// @route   POST /api/user/facebook-login
// @desc    Login with Facebook
// @access  Public
router.post('/facebook-login', facebookLogin);

// @route   POST /api/user/google-login
// @desc    Login with Google
// @access  Public
router.post('/google-login', googleLogin);

// @route   GET /api/user/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, getMe);

// @route   PUT /api/user/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', protect, changePassword);

// @route   POST /api/user/delete-request
// @desc    Request account deletion
// @access  Private
router.post('/delete-request', protect, requestDelete);

// @route   GET /api/user/activity
// @desc    Get user activity
// @access  Private
router.get('/activity', protect, getUserActivity);

const upload = require('../middleware/upload');

// @route   PUT /api/user/update
// @desc    Update user profile
// @access  Private
router.put(
    '/update',
    protect,
    upload.fields([
        { name: 'storeBanner', maxCount: 1 },
        { name: 'storeLogo', maxCount: 1 },
        { name: 'photo', maxCount: 1 }
    ]),
    updateProfile
);

// @route   POST /api/user/notify-preference
// @desc    Add notify preference
// @access  Private
router.post('/notify-preference', protect, addNotifyPreference);

// @route   POST /api/user/notify-preference/toggle
// @desc    Toggle notify preference
// @access  Private
router.post('/notify-preference/toggle', protect, toggleNotifyPreference);

// @route   POST /api/user/favorite/:id
// @desc    Toggle favorite ad
// @access  Private
router.post('/favorite/:id', protect, toggleFavoriteAd);

// @route   DELETE /api/user/notify-preference/:id
// @desc    Remove notify preference
// @access  Private
router.delete('/notify-preference/:id', protect, removeNotifyPreference);

// @route   PUT /api/user/notify-settings
// @desc    Update notification settings
// @access  Private
router.put('/notify-settings', protect, updateNotifySettings);

// @route   POST /api/user/otp/request
// @desc    Request OTP for verification
// @access  Private
router.post('/otp/request', protect, requestOTP);

// @route   POST /api/user/otp/verify
// @desc    Verify OTP
// @access  Private
router.post('/otp/verify', protect, verifyOTP);

// @route   POST /api/user/otp/mobile/request
// @desc    Request Mobile OTP for verification
// @access  Public
router.post('/otp/mobile/request', requestMobileOTP);

// @route   POST /api/user/otp/mobile/verify
// @desc    Verify Mobile OTP
// @access  Public
router.post('/otp/mobile/verify', verifyMobileOTP);

// @route   POST /api/user/forgot-password/request
// @desc    Request OTP for forgot password
// @access  Public
router.post('/forgot-password/request', forgotPasswordRequest);

// @route   POST /api/user/forgot-password/verify
// @desc    Verify OTP and update password
// @access  Public
router.post('/forgot-password/verify', forgotPasswordVerify);

// @route   GET /api/user/profile/:id
// @desc    Get public profile
// @access  Public
router.get('/profile/:id', getPublicProfile);

// @route   GET /api/user/premium
// @desc    Get all premium users
// @access  Public
router.get('/premium', getPremiumUsers);

// @route   POST /api/user/follow/:id
// @desc    Follow or Unfollow a user
// @access  Private
router.post('/follow/:id', protect, followUser);

router.post('/check-url', protect, checkSellerUrl);

// @route   POST /api/user/profile/:id/view
router.post('/profile/:id/view', incrementProfileViews);

// @route   POST /api/user/rate/:id
router.post('/rate/:id', protect, rateUser);

// @route   GET /api/user/notifications
router.get('/notifications', protect, getNotifications);

// @route   PUT /api/user/notifications/:id/read
router.put('/notifications/:id/read', protect, markNotificationAsRead);

module.exports = router;
