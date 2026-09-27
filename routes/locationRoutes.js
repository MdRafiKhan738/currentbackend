const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { verifyToken, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Locations
router.get('/', locationController.getAllLocations);
router.post('/', verifyToken, checkPermission('Location Manager'), upload.single('image'), locationController.createLocation);
router.put('/:id', verifyToken, checkPermission('Location Manager'), upload.single('image'), locationController.updateLocation);
router.delete('/:id', verifyToken, checkPermission('Location Manager'), locationController.deleteLocation);

// SubLocations
router.get('/sub', locationController.getAllSubLocations);
router.post('/sub', verifyToken, checkPermission('Location Manager'), upload.single('image'), locationController.createSubLocation);
router.put('/sub/:id', verifyToken, checkPermission('Location Manager'), upload.single('image'), locationController.updateSubLocation);
router.delete('/sub/:id', verifyToken, checkPermission('Location Manager'), locationController.deleteSubLocation);

module.exports = router;
