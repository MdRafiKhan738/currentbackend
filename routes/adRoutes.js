const express = require('express');
const router = express.Router();
const adController = require('../controllers/adController');
const { authenticateUser, verifyToken, optionalAuthenticateUser, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getAdPositionsPublic, getAdPositions, updateAdPosition } = require('../controllers/adPositionController');

// @route   POST api/ads
// @desc    Create a new ad
// @access  Public (Optional Auth)
router.post(
    '/',
    optionalAuthenticateUser,
    upload.array('images', 5), // 'images' is the field name, max 5 files
    adController.createAd
);

// @route   GET api/ads/me
// @desc    Get all ads for logged-in user
// @access  Private
router.get('/me', authenticateUser, adController.getMyAds);

// @route   PUT api/ads/:id
// @desc    Update user's own ad
// @access  Private
router.put('/:id', authenticateUser, upload.array('images', 5), adController.updateMyAd);

// @route   PUT api/ads/:id/toggle-status
// @desc    Toggle user's own ad status
// @access  Private
router.put('/:id/toggle-status', authenticateUser, adController.toggleAdStatusMyAd);

// @route   DELETE api/ads/:id
// @desc    Delete user's own ad
// @access  Private
// @route   DELETE api/ads/:id
// @desc    Delete user's own ad
// @access  Private
router.delete('/:id', authenticateUser, adController.deleteMyAd);

// @route   PUT api/ads/:id/promote
// @desc    Promote an ad
// @access  Private
router.put('/:id/promote', authenticateUser, adController.promoteAd);

// @route   GET api/ads/public/feed
// @desc    Get paginated active ads for public feed (separated by adType)
// @access  Public
router.get('/public/feed', adController.getFeedAdsPublic);

// @route   GET api/ads/public/all
// @desc    Get all active ads for public feed
// @access  Public
router.get('/public/all', adController.getAllAdsPublic);

// @route   GET api/ads/public/count
// @desc    Get count of active ads
// @access  Public
router.get('/public/count', adController.getAdsCount);

// @route   GET api/ads/public/promotion-plans
// @desc    Get all promotion plans
// @access  Public
router.get('/public/promotion-plans', adController.getAllPromotionPlansPublic);

// @route   GET api/ads/public/ad-positions
// @desc    Get all active ad positions
// @access  Public
router.get('/public/ad-positions', getAdPositionsPublic);

// @route   GET api/ads/public/:id
// @desc    Get single public ad
// @access  Public
router.get('/public/:id', adController.getSingleAdPublic);

// @route   GET api/ads/admin/all
// @desc    Get all ads for admin
// @access  Private (Admin)
router.get('/admin/all', verifyToken, checkPermission('Post'), adController.getAllAdsAdmin);

// @route   GET api/ads/admin/promoted
// @desc    Get all promoted ads for admin
// @access  Private (Admin)
router.get('/admin/promoted', verifyToken, checkPermission('Post'), adController.getAllPromotedAdsAdmin);

// @route   PUT api/ads/admin/:id/status
// @desc    Update ad status
// @access  Private (Admin)
router.put('/admin/:id/status', verifyToken, checkPermission('Post'), adController.updateAdStatus);

// @route   PUT api/ads/admin/:id/update
// @desc    Update ad details by admin
// @access  Private (Admin)
router.put('/admin/:id/update', verifyToken, checkPermission('Post'), upload.array('images', 5), adController.updateAdDetails);

// @route   PUT api/ads/admin/:id/see
// @desc    Mark ad as seen by admin
// @access  Private (Admin)
router.put('/admin/:id/see', verifyToken, checkPermission('Post'), adController.markAdAsSeen);

// @route   DELETE api/ads/admin/:id/image
// @desc    Remove specific image from ad
// @access  Private (Admin)
router.delete('/admin/:id/image', verifyToken, checkPermission('Post'), adController.deleteAdImage);

// @route   POST api/ads/admin/create
// @desc    Create ad by admin
// @access  Private (Admin)
router.post('/admin/create', verifyToken, checkPermission('Post'), upload.array('images', 5), adController.createAdAdmin);

// @route   DELETE api/ads/admin/:id
// @desc    Delete ad by admin
// @access  Private (Admin)
router.delete('/admin/:id', verifyToken, checkPermission('Post'), adController.deleteAdAdmin);

// Ad Position Management
// @route   GET api/ads/admin/ad-positions
// @desc    Get all ad positions
// @access  Private (Admin)
router.get('/admin/ad-positions', verifyToken, checkPermission('Post'), getAdPositions);

// @route   PUT api/ads/admin/ad-positions/:id
// @desc    Update ad position
// @access  Private (Admin)
router.put(
    '/admin/ad-positions/:id', 
    verifyToken, 
    checkPermission('Post'), 
    upload.fields([{ name: 'imageDesk', maxCount: 1 }, { name: 'imageMob', maxCount: 1 }]),
    updateAdPosition
);

module.exports = router;
