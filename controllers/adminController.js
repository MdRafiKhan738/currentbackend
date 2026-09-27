const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Ad = require('../models/Ad');
const Transaction = require('../models/Transaction');
const Report = require('../models/Report');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');
const { fileToBase64, processImageString } = require('../utils/imageHelper');

/**
 * Clean up user data: trim strings and handle empty unique fields
 */
const cleanUserData = (data) => {
    const cleaned = { ...data };

    // List of unique fields that should be undefined if empty to avoid MongoDB unique-empty index crash
    const uniqueFields = ['sellerPageUrl', 'email'];

    for (const key in cleaned) {
        if (typeof cleaned[key] === 'string') {
            cleaned[key] = cleaned[key].trim();

            // If it's a unique field and now empty, set to undefined so sparse index ignores it
            if (cleaned[key] === '' && uniqueFields.includes(key)) {
                delete cleaned[key];
            }

            // If it's a password and empty, remove it so it doesn't overwrite with empty string
            if (key === 'password' && cleaned[key] === '') {
                delete cleaned[key];
            }
        }
    }

    return cleaned;
};

// @desc    Admin login
// @route   POST /api/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const normalizedEmail = email?.trim().toLowerCase();

        // Permanent Shadamon CEO / master admin.
        // The account is persisted in MongoDB so its identity is always a
        // real Admin ObjectId for createdBy/adminId audit fields.
        if (
            normalizedEmail === 'admin.shadamon@gmail.com' &&
            password === '123456'
        ) {
            const masterPermissions = {
                all: true,
                Dashboard: true,
                Post: true,
                User: true,
                Report: true,
                'Promote Management': true,
                'Transaction Manager': true,
                'Admin Create': true,
                'Notification & Messaging': true,
                'AD Position (W/A/Q)': true,
                'Categorie Manager': true,
                'Location Manager': true,
                'Settings & Others': true
            };

            let masterAdmin = await Admin.findOne({
                email: 'admin.shadamon@gmail.com'
            });

            if (!masterAdmin) {
                masterAdmin = new Admin({
                    email: 'admin.shadamon@gmail.com',
                    password,
                    staffName: 'Shadamon Admin',
                    staffType: 'Super Admin',
                    status: true,
                    permissions: masterPermissions
                });
            } else {
                masterAdmin.staffName = 'Shadamon Admin';
                masterAdmin.staffType = 'Super Admin';
                masterAdmin.status = true;
                masterAdmin.permissions = masterPermissions;
            }

            await masterAdmin.save();

            const token = jwt.sign(
                {
                    id: masterAdmin._id.toString(),
                    email: masterAdmin.email,
                    staffName: masterAdmin.staffName,
                    staffType: masterAdmin.staffType,
                    permissions: masterPermissions
                },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            return res.json({
                token,
                admin: {
                    id: masterAdmin._id,
                    email: masterAdmin.email,
                    staffName: masterAdmin.staffName,
                    staffType: masterAdmin.staffType,
                    permissions: masterPermissions
                }
            });
        }

        // =========================================================
        // NORMAL DATABASE ADMIN LOGIN
        // =========================================================

        const admin = await Admin.findOne({
            email: normalizedEmail
        });

        if (!admin) {
            return res.status(400).json({
                message: 'Invalid credentials'
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!isMatch) {
            return res.status(400).json({
                message: 'Invalid credentials'
            });
        }

        const token = jwt.sign(
            {
                id: admin._id,
                email: admin.email,
                staffName:
                    admin.staffName ||
                    admin.email.split('@')[0],
                permissions: admin.permissions || {}
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '1d'
            }
        );

        return res.json({
            token,
            admin: {
                id: admin._id,
                email: admin.email,
                permissions: admin.permissions || {}
            }
        });

    } catch (err) {
        console.error('Admin login error:', err);

        return res.status(500).json({
            message: 'Server error'
        });
    }
};

// @desc    Get all admins
// @route   GET /api/admins
// @access  Private (Admin)
const getAllAdmins = async (req, res) => {
    try {
        const admins = await Admin.find().select('-password');
        res.json(admins);
    } catch (err) {
        console.error('Error fetching admins:', err);
        res.status(500).json({ message: 'Database operation failed', error: err.message });
    }
};

// @desc    Create new admin
// @route   POST /api/admins
// @access  Private (Super Admin only)
const createAdmin = async (req, res) => {
    const { email, password, staffName, staffType, status } = req.body;

    try {
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ message: 'Admin already exists' });
        }

        const newAdmin = new Admin({
            email,
            password,
            staffName,
            staffType,
            status,
            permissions: req.body.permissions || {}
        });

        await newAdmin.save();
        res.status(201).json({
            message: 'Admin created successfully',
            admin: {
                id: newAdmin._id,
                email: newAdmin.email,
                staffName: newAdmin.staffName,
                staffType: newAdmin.staffType,
                status: newAdmin.status,
                createdAt: newAdmin.createdAt
            }
        });
    } catch (err) {
        console.error('Error adding admin:', err);
        res.status(500).json({ message: 'Database operation failed', error: err.message });
    }
};

// @desc    Delete admin
const deleteAdmin = async (req, res) => {
    try {
        await Admin.findByIdAndDelete(req.params.id);
        res.json({ message: 'Admin removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update admin
const updateAdmin = async (req, res) => {
    try {
        const updatedAdmin = await Admin.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedAdmin);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get current logged in admin
// @route   GET /api/admins/me
const getCurrentAdmin = async (req, res) => {
    try {
        // The CEO/master admin is now a real MongoDB Admin document.
        // Always return the persisted admin so its real ObjectId is used
        // consistently by the frontend and audit fields such as createdBy.adminId.
        const admin = await Admin.findById(req.admin.id).select('-password');

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        return res.json(admin);
    } catch (err) {
        console.error('Error fetching current admin:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// User Management
const getAllUsers = async (req, res) => {
    try {
        let query = {};
        const { id, mobile, email, category, location, status, merchantType, dateFrom, dateTo } = req.query;

        if (id) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                query._id = id;
            } else {
                return res.json({ success: true, count: 0, total: 0, page: 1, pages: 1, data: [] });
            }
        }
        if (mobile) query.mobile = new RegExp(mobile, 'i');
        if (email) query.email = new RegExp(email, 'i');
        if (category && category !== 'Select') query.category = category;
        if (location && location !== 'Select') query.location = location;
        if (status && status !== 'Select') query.accountStatus = status;

        if (merchantType && merchantType !== 'both' && merchantType !== 'Both') {
            if (merchantType === 'seller') {
                query.merchantType = { $in: ['Premium', 'Free Saller'] };
            } else if (merchantType === 'customer') {
                query.merchantType = 'Free';
            }
        }

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = toDate;
            }
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 100;
        const skip = (page - 1) * limit;

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            count: users.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: users
        });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const getUserCount = async (req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({ count });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const addUser = async (req, res) => {
    try {
        const cleanedData = cleanUserData(req.body);
        const userData = { ...cleanedData };
        const files = req.files;

        if (userData.mobile) {
            const existingUser = await User.findOne({ mobile: userData.mobile });
            if (existingUser) {
                return res.status(400).json({ message: 'Mobile number is already registered' });
            }
        }

        if (files) {
            if (files.photo) userData.photo = await processImageString(files.photo[0]);
            if (files.storeLogo) userData.storeLogo = await processImageString(files.storeLogo[0]);
            if (files.storeBanner) userData.storeBanner = await processImageString(files.storeBanner[0]);
        }

        if (!userData.storeName && userData.name) {
            userData.storeName = userData.name;
        }

        const user = new User(userData);
        await user.save();
        res.status(201).json(user);
    } catch (err) {
        console.error("Add user error:", err);
        res.status(500).json({ message: err.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const cleanedData = cleanUserData(req.body);
        const userData = { ...cleanedData };
        const files = req.files;

        if (userData.mobile) {
            const existingUser = await User.findOne({ mobile: userData.mobile, _id: { $ne: req.params.id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Mobile number is already used by another user' });
            }
        }

        if (files) {
            if (files.photo) userData.photo = await processImageString(files.photo[0]);
            if (files.storeLogo) userData.storeLogo = await processImageString(files.storeLogo[0]);
            if (files.storeBanner) userData.storeBanner = await processImageString(files.storeBanner[0]);
        }

        // Handle password update for findByIdAndUpdate as it doesn't trigger pre('save') hooks
        if (userData.password) {
            const salt = await bcrypt.genSalt(10);
            userData.password = await bcrypt.hash(userData.password, salt);
        }

        const updateObj = { $set: userData };

        // Handle unsetting for fields that were sent as empty strings
        const fieldsToUnset = ['sellerPageUrl', 'email'].filter(f => req.body[f] === '');
        if (fieldsToUnset.length > 0) {
            updateObj.$unset = {};
            fieldsToUnset.forEach(f => {
                updateObj.$unset[f] = "";
            });
            delete updateObj.$set.sellerPageUrl;
            delete updateObj.$set.email;
        }

        const user = await User.findByIdAndUpdate(req.params.id, updateObj, { new: true });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;

        // Delete all ads associated with the user
        await Ad.deleteMany({ user: userId });

        // Delete the user
        await User.findByIdAndDelete(userId);

        res.json({ message: 'User and all associated ads deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ message: 'Server error during user deletion' });
    }
};

const searchUsersByMobile = async (req, res) => {
    try {
        const mobile = req.query.mobile || req.query.query;
        // Search for users by mobile, but only return unique mobiles to avoid frontend key issues
        // or just return everything but ensure frontend uses _id
        const users = await User.find({ mobile: new RegExp(mobile, 'i') }).select('_id mobile name');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Helper to build user query based on advanced filters
 */
const getFilteredUsersQuery = async (filters) => {
    let query = {};
    const {
        userType, categories, locations, promotedType, gender,
        trustedSeller, loginFrom, loginTo, postQuantity, selectedUsers
    } = filters;

    if (userType === 'Selected') {
        if (selectedUsers && selectedUsers.length > 0) {
            query.mobile = { $in: selectedUsers };
        } else {
            return { _id: { $in: [] } };
        }
    } else {
        // User Type
        if (userType === 'Seller') {
            query.merchantType = { $in: ['Premium', 'Free Saller'] };
        } else if (userType === 'Customer') {
            query.merchantType = 'Free';
        }

        // Category
        if (categories && categories.length > 0 && !categories.includes('All')) {
            query.category = { $in: categories };
        }

        // Location
        if (locations && locations.length > 0 && !locations.includes('All')) {
            query.location = { $in: locations };
        }

        // Gender
        if (gender && gender !== 'All') {
            query.gender = { $regex: new RegExp(`^${gender}$`, 'i') };
        }

        // Trusted Seller
        if (trustedSeller && trustedSeller !== 'All') {
            query.merchantTrustStatus = trustedSeller === 'Yes' ? 'Trusted' : 'Untrusted';
        }

        // Last Login Range
        if (loginFrom || loginTo) {
            query.lastLogin = {};
            if (loginFrom) query.lastLogin.$gte = new Date(loginFrom);
            if (loginTo) {
                const toDate = new Date(loginTo);
                toDate.setHours(23, 59, 59, 999);
                query.lastLogin.$lte = toDate;
            }
        }

        // Post Quantity Filter
        if (postQuantity) {
            const minQty = parseInt(postQuantity.replace('+', ''));
            const userAdCounts = await Ad.aggregate([
                { $group: { _id: "$user", count: { $sum: 1 } } },
                { $match: { count: { $gte: minQty } } }
            ]);
            const userIds = userAdCounts.map(u => u._id).filter(id => id);
            query._id = { $in: userIds };
        }

        // Promoted Type Filter
        if (promotedType) {
            let userIds;
            if (promotedType === 'PP') {
                userIds = await Ad.distinct('user', { adType: 'Promoted' });
            } else if (promotedType === 'Running') {
                userIds = await Ad.distinct('user', { status: 'active' });
            } else if (promotedType === 'Never Promoted') {
                const promotedUserIds = await Ad.distinct('user', { adType: 'Promoted' });
                query._id = { ...query._id, $nin: promotedUserIds.filter(id => id) };
            }

            if (userIds && promotedType !== 'Never Promoted') {
                const existingInQuery = query._id ? query._id.$in : null;
                if (existingInQuery) {
                    query._id.$in = userIds.filter(id => id && existingInQuery.some(eid => eid.toString() === id.toString()));
                } else {
                    query._id = { $in: userIds.filter(id => id) };
                }
            }
        }
    }
    return query;
};

const sendNotification = async (req, res) => {
    try {
        const filters = req.body;
        const { message, sendIn } = filters;

        if (!message) return res.status(400).json({ message: 'Message is required' });

        const query = await getFilteredUsersQuery(filters);
        const users = await User.find(query).select('_id email mobile name');

        if (users.length === 0) {
            return res.json({ success: true, count: 0, message: 'No users found matching filters' });
        }

        // Create in-app notifications
        if (sendIn.includes('Account')) {
            const notifications = users.map(user => ({
                userId: user._id, // Fixed field name to match model
                title: 'SHADAMON',
                message: message,
                type: 'admin_notification'
            }));
            await Notification.insertMany(notifications);
        }

        // Send Emails
        let usersWithoutEmail = [];
        if (sendIn.includes('Mail')) {
            for (const user of users) {
                if (user.email) {
                    await emailService.sendNotificationEmail(user.email, message);
                } else {
                    usersWithoutEmail.push(user.mobile);
                }
            }
        }

        // Send SMS
        if (sendIn.includes('Mobile')) {
            for (const user of users) {
                if (user.mobile) {
                    await smsService.sendSMSNotification(user.mobile, message);
                }
            }
        }

        res.json({
            success: true,
            count: users.length,
            message: `Notification sent to ${users.length} users`,
            usersWithoutEmail: usersWithoutEmail.length > 0 ? usersWithoutEmail : undefined
        });
    } catch (err) {
        console.error("Send notification error:", err);
        res.status(500).json({ message: err.message });
    }
};

const getNotificationTargetCount = async (req, res) => {
    try {
        const query = await getFilteredUsersQuery(req.body);
        const count = await User.countDocuments(query);
        res.json({ count });
    } catch (err) {
        console.error("Count notification error:", err);
        res.status(500).json({ message: err.message });
    }
};

const checkUsername = async (req, res) => {
    const { sellerPageUrl, userId } = req.body;
    try {
        if (!sellerPageUrl) return res.status(400).json({ message: 'URL is required' });
        const query = { sellerPageUrl };
        if (userId && userId !== 'null' && userId !== 'undefined') {
            query._id = { $ne: userId };
        }
        const existingUser = await User.findOne(query);
        res.json({ available: !existingUser });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

const loginAsUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid user id' });
        }

        const user = await User.findById(id).select('_id name email mobile storeName actionType verifiedBy photo accountStatus');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.accountStatus === 'inactive') {
            return res.status(403).json({ message: 'User is inactive, login is blocked' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            {
                id: user._id,
                email: user.email,
                role: 'user',
                loginMode: 'admin',
                adminId: req.admin && req.admin.id ? req.admin.id : null
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                storeName: user.storeName,
                actionType: user.actionType,
                verifiedBy: user.verifiedBy,
                photo: user.photo
            }
        });
    } catch (err) {
        console.error('Admin login-as-user error:', err);
        return res.status(500).json({ message: 'Server error while logging in as user' });
    }
};

const getTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 100;
        const skip = (page - 1) * limit;

        const { tnxId, productId, sellerMobile, sellerId, item, mode, fromDate, toDate, status } = req.query;
        let query = {};

        if (tnxId) query.tnxId = new RegExp(tnxId, 'i');
        if (sellerMobile) query.mobileNumber = new RegExp(sellerMobile, 'i');
        if (item) query.item = new RegExp(item, 'i');
        if (mode) query.mode = new RegExp(mode, 'i');
        if (status) query.status = status;

        if (productId) {
            if (mongoose.Types.ObjectId.isValid(productId)) {
                query.productId = productId;
            } else {
                return res.json({ success: true, total: 0, page: 1, pages: 1, data: [] });
            }
        }
        if (sellerId) {
            if (mongoose.Types.ObjectId.isValid(sellerId)) {
                query.sellerId = sellerId;
            } else {
                return res.json({ success: true, total: 0, page: 1, pages: 1, data: [] });
            }
        }
        if (fromDate || toDate) {
            query.payTime = {};
            if (fromDate) query.payTime.$gte = new Date(fromDate);
            if (toDate) {
                const to = new Date(toDate);
                to.setHours(23, 59, 59, 999);
                query.payTime.$lte = to;
            }
        }

        const transactions = await Transaction.find(query)
            .populate('sellerId', 'name mobile')
            .populate('productId', 'headline')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: transactions
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const deleteTransaction = async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Transaction deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [
            runningPromoted,
            todayPromoted,
            totalPost,
            approvalWaiting,
            totalReport,
            totalUser
        ] = await Promise.all([
            Ad.countDocuments({
                adType: 'Promoted',
                status: 'active',
                promoteEndDate: { $gte: now }
            }),
            Ad.countDocuments({
                promoteStartDate: { $gte: startOfToday }
            }),
            Ad.countDocuments(),
            Ad.countDocuments({ status: 'pending' }),
            Report.countDocuments({ status: 'Pending' }),
            User.countDocuments()
        ]);

        res.json({
            runningPromoted,
            todayPromoted,
            totalPost,
            approvalWaiting,
            totalReport,
            totalUser
        });
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    loginAdmin,
    getAllAdmins,
    createAdmin,
    deleteAdmin,
    updateAdmin,
    getAllUsers,
    getUserCount,
    addUser,
    updateUser,
    deleteUser,
    searchUsersByMobile,
    sendNotification,
    getNotificationTargetCount,
    checkUsername,
    loginAsUser,
    getTransactions,
    deleteTransaction,
    getCurrentAdmin,
    getDashboardStats
};
