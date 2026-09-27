const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');
const Feature = require('../models/Feature');
const { fileToBase64, processImageString } = require('../utils/imageHelper');

// --- Category Controllers ---
exports.createCategory = async (req, res) => {
    try {
        const { name, categoryNameBn, status, inputType, order } = req.body;
        const slug = name.toLowerCase().replace(/ /g, '-');

        const category = new Category({
            name,
            categoryNameBn: String(categoryNameBn || '').trim(),
            slug,
            inputType,
            order,
            status: status === 'true' || status === true,
            createdBy: {
                adminId: req.admin.id,
                adminName: req.admin.name || 'Admin'
            },
            icon: req.file ? req.file.path.replace(/\\/g, "/") : null
        });

        await category.save();
        res.status(201).json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const { name, categoryNameBn, status, inputType, order } = req.body;
        const updateData = {
            name,
            status: status === 'true' || status === true,
            inputType,
            order
        };
        if (name) updateData.slug = name.toLowerCase().replace(/ /g, '-');
        if (categoryNameBn !== undefined) {
            updateData.categoryNameBn = String(categoryNameBn || '').trim();
        }
        if (req.file) {
            updateData.icon = req.file.path.replace(/\\/g, "/");
        }

        const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ order: 1 });
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- SubCategory Controllers ---
exports.createSubCategory = async (req, res) => {
    try {
        const { name, subCategoryNameBn, category, features, buttonType, freePost, order, status, tags, priceBoxShow, priceBoxName } = req.body;

        const names = Array.isArray(name) ? name : [name];
        const nameBns = Array.isArray(subCategoryNameBn) ? subCategoryNameBn : [subCategoryNameBn];
        let featuresArray = [];
        if (features) {
            try {
                featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            } catch (e) {
                featuresArray = [features];
            }
        }

        const subCategories = [];

        for (let index = 0; index < names.length; index++) {
            const subName = String(names[index] || '').trim();
            if (!subName) continue;

            const subNameBn = String(nameBns[index] || '').trim();

            const subCategory = new SubCategory({
                name: subName,
                subCategoryNameBn: subNameBn,
                category,
                features: featuresArray,
                buttonType,
                freePost,
                order,
                status: status === 'true' || status === true,
                priceBoxShow: priceBoxShow === 'true' || priceBoxShow === true,
                priceBoxName: priceBoxName,
                tags: tags || [],
                image: req.file ? req.file.path.replace(/\\/g, "/") : null,
                createdBy: {
                    adminId: req.admin.id,
                    adminName: req.admin.name || 'Admin'
                }
            });
            await subCategory.save();
            subCategories.push(subCategory);
        }

        res.status(201).json({ success: true, data: subCategories.length === 1 ? subCategories[0] : subCategories });
    } catch (err) {
        console.error('Error creating subcategory:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateSubCategory = async (req, res) => {
    try {
        const { name, subCategoryNameBn, category, features, buttonType, freePost, order, status, tags, priceBoxShow, priceBoxName } = req.body;

        let featuresArray = [];
        if (features) {
            try {
                featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            } catch (e) {
                featuresArray = [features];
            }
        }

        const updateData = {
            name,
            category,
            features: featuresArray,
            buttonType,
            freePost,
            order,
            status: status === 'true' || status === true,
            priceBoxShow: priceBoxShow === 'true' || priceBoxShow === true,
            priceBoxName: priceBoxName,
            tags: tags || []
        };
        if (subCategoryNameBn !== undefined) {
            updateData.subCategoryNameBn = String(subCategoryNameBn || '').trim();
        }
        if (req.file) {
            updateData.image = req.file.path.replace(/\\/g, "/");
        }

        const subCategory = await SubCategory.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: subCategory });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getAllSubCategories = async (req, res) => {
    try {
        const subCategories = await SubCategory.find()
            .populate('category', 'name categoryNameBn')
            .populate({ path: 'features', options: { sort: { 'order': 1 } } })
            .sort({ order: 1 });
        res.json({ success: true, data: subCategories });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteSubCategory = async (req, res) => {
    try {
        await SubCategory.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'SubCategory deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Feature Controllers ---
exports.createFeature = async (req, res) => {
    try {
        const { name, subcategory, inputType, order, status, buttonType, selectionType, boxFadeName, buttonItemNames } = req.body;

        const feature = new Feature({
            name,
            subcategory,
            inputType,
            order,
            status: status === 'true' || status === true,
            buttonType,
            selectionType,
            boxFadeName,
            buttonItemNames: buttonItemNames || []
        });

        await feature.save();
        res.status(201).json({ success: true, data: feature });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateFeature = async (req, res) => {
    try {
        const { name, subcategory, inputType, order, status, buttonType, selectionType, boxFadeName, buttonItemNames } = req.body;
        const updateData = {
            name,
            subcategory,
            inputType,
            order,
            status: status === 'true' || status === true,
            buttonType,
            selectionType,
            boxFadeName,
            buttonItemNames: buttonItemNames || []
        };

        const feature = await Feature.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: feature });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getAllFeatures = async (req, res) => {
    try {
        const features = await Feature.find().populate('subcategory', 'name').sort({ order: 1 });
        res.json({ success: true, data: features });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteFeature = async (req, res) => {
    try {
        await Feature.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Feature deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
