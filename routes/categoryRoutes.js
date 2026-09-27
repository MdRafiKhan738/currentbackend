const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { verifyToken, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Categories
router.get('/', categoryController.getAllCategories);
router.post('/', verifyToken, checkPermission('Categorie Manager'), upload.single('icon'), categoryController.createCategory);
router.put('/:id', verifyToken, checkPermission('Categorie Manager'), upload.single('icon'), categoryController.updateCategory);
router.delete('/:id', verifyToken, checkPermission('Categorie Manager'), categoryController.deleteCategory);

// SubCategories
router.get('/sub', categoryController.getAllSubCategories);
router.post('/sub', verifyToken, checkPermission('Categorie Manager'), upload.single('image'), categoryController.createSubCategory);
router.put('/sub/:id', verifyToken, checkPermission('Categorie Manager'), upload.single('image'), categoryController.updateSubCategory);
router.delete('/sub/:id', verifyToken, checkPermission('Categorie Manager'), categoryController.deleteSubCategory);

// Features
router.get('/features', categoryController.getAllFeatures);
router.post('/features', verifyToken, checkPermission('Categorie Manager'), categoryController.createFeature);
router.put('/features/:id', verifyToken, checkPermission('Categorie Manager'), categoryController.updateFeature);
router.delete('/features/:id', verifyToken, checkPermission('Categorie Manager'), categoryController.deleteFeature);

module.exports = router;
