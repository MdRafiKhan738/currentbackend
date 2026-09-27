const User = require('../models/User');
const Notification = require('../models/Notification');
const Ad = require('../models/Ad');
const Transaction = require('../models/Transaction');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { fileToBase64, downloadAndSaveImage } = require('../utils/imageHelper');
const PremierOpportunity = require('../models/PremierOpportunity');

// @desc    Register a new user
// @route   POST /api/user/register
// @access  Public
const registerUser = async (req, res) => {
    const { name, email, password, dob, gender, mobile, storeName, actionType } = req.body;

    try {
        const normalizedName = (name || '').trim() || mobile || (email ? email.split('@')[0] : 'User');

        // Validate required fields
        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }

        if (!email && !mobile) {
            return res.status(400).json({ message: 'Email or Mobile number is required' });
        }

        // Check if user already exists
        if (email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'User with this email already exists' });
            }
        }

        if (mobile) {
            const existingMobile = await User.findOne({ mobile });
            if (existingMobile) {
                return res.status(400).json({ message: 'User with this mobile number already exists' });
            }
        }

        // Create new user (password will be hashed automatically by the pre-save hook)
        const newUser = new User({
            name: normalizedName,
            email: email || undefined,
            password,
            dob: dob || undefined,
            gender: gender || undefined,
            mobile: mobile || undefined,
            storeName: normalizedName,
            actionType: actionType || 'call'
        });

        await newUser.save();

        // Generate JWT token
        const token = jwt.sign(
            { id: newUser._id, email: newUser.email, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                storeName: newUser.storeName,
                actionType: newUser.actionType,
                verifiedBy: newUser.verifiedBy,
                photo: newUser.photo
            }
        });
    } catch (err) {
        console.error('Error registering user:', err);

        // Handle duplicate email error from MongoDB
        if (err.code === 11000) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        res.status(500).json({ message: 'Server error during registration', error: err.message });
    }
};

// @desc    Login user
// @route   POST /api/user/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validate input
        if ((!email && !req.body.mobile) || !password) {
            return res.status(400).json({ message: 'Email/Mobile and password are required' });
        }

        // Find user by email OR mobile
        let user;
        const mobile = req.body.mobile;

        if (email) {
            // Find by email or mobile (the old login field might contain either)
            user = await User.findOne({
                $or: [{ email }, { mobile: email }]
            });
        } else if (mobile) {
            // Find by mobile directly
            user = await User.findOne({ mobile });
        }

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (user.accountStatus === 'inactive') {
            return res.status(403).json({ message: 'User is deactivate, please contact support', status: 'inactive' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Update lastLogin date
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
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
        console.error('Error logging in user:', err);
        res.status(500).json({ message: 'Server error during login', error: err.message });
    }
};

// @desc    Get current user profile
// @route   GET /api/user/me
// @access  Private
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/user/update
// @access  Private
const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const fields = [
            'name', 'mobile', 'email', 'dob', 'gender', 'storeName',
            'actionType', 'pageName', 'category', 'location',
            'education', 'aboutYourself', 'profession', 'professionalExperience', 'sellerPageUrl', 'aboutBusiness',
            'additionalMobiles', 'contact', 'password'
        ];

        // 1. Handle Text Fields
        for (const field of fields) {
            if (req.body[field] !== undefined) {
                // If it's the password, hash it (Pre-save hook doesn't run on findByIdAndUpdate usually, 
                // but here we are using user.save() later, so it WILL run if we set it directly?)
                // Actually, User.js pre-save: if (this.isModified('password'))
                // So setting user.password = req.body.password is fine.
                
                // If 'email' or 'sellerPageUrl' are empty strings, set them to undefined
                if ((field === 'email' || field === 'sellerPageUrl') && req.body[field] === '') {
                    user[field] = undefined;
                } else if (field === 'email' && req.body.email !== user.email) {
                    const emailExists = await User.findOne({ email: req.body.email });
                    if (emailExists) {
                        return res.status(400).json({ message: 'Email already in use by another account' });
                    }
                    user[field] = req.body[field];
                } else if (field === 'mobile' && req.body.mobile !== user.mobile) {
                    const mobileExists = await User.findOne({ mobile: req.body.mobile });
                    if (mobileExists) {
                        return res.status(400).json({ message: 'Mobile number already in use by another account' });
                    }
                    user[field] = req.body[field];
                } else {
                    user[field] = req.body[field];
                }
            }
        }

        // 2. Handle File Uploads (mapped from req.files)
        if (req.files) {
            if (req.files.storeBanner?.[0]) {
                const filePath = req.files.storeBanner[0].path.replace(/\\/g, "/");
                if (filePath) {
                    if (!user.storeBanner) {
                        user.storeBannerStatus = 'approved';
                    } else {
                        user.storeBannerStatus = 'pending';
                    }
                    user.storeBanner = filePath;
                }
            }

            if (req.files.storeLogo?.[0]) {
                const filePath = req.files.storeLogo[0].path.replace(/\\/g, "/");
                if (filePath) {
                    if (!user.storeLogo) {
                        user.storeLogoStatus = 'approved';
                    } else {
                        user.storeLogoStatus = 'pending';
                    }
                    user.storeLogo = filePath;
                }
            }

            if (req.files.photo?.[0]) {
                const filePath = req.files.photo[0].path.replace(/\\/g, "/");
                if (filePath) {
                    if (!user.photo) {
                        user.photoStatus = 'approved';
                    } else {
                        user.photoStatus = 'pending';
                    }
                    user.photo = filePath;
                }
            }
        }

        // Handle Base64 strings ONLY if they are coming as text (fallback for older frontend code)
        // But preferable to rely on req.files now.
        // If frontend sends base64, it might come in body.storeBanner. 
        // We should check if it's NOT a base64 string to avoid overwriting file with string if logic mixed.
        // Actually, with upload.fields, body fields might be present.
        // Let's prioritize file uploads.

        // If email update is requested, check for uniqueness (optional, skipped for now to avoid complexity)
        // if (req.body.email && req.body.email !== user.email) { ... }

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                storeName: user.storeName,
                storeLogo: user.storeLogo,
                storeBanner: user.storeBanner,
                photo: user.photo,
                actionType: user.actionType
            }
        });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ message: 'Server error during update', error: err.message });
    }
};

// @desc    Login with Facebook
// @route   POST /api/user/facebook-login
// @access  Public
const facebookLogin = async (req, res) => {
    const { accessToken } = req.body;
    const axios = require('axios');
    const crypto = require('crypto');

    try {
        const appSecret = process.env.FACEBOOK_APP_SECRET;

        let url = `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`;

        if (appSecret) {
            const appSecretProof = crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
            url += `&appsecret_proof=${appSecretProof}`;
        } else {
            console.warn("Warning: FACEBOOK_APP_SECRET is not set.");
        }

        // 1. Verify token with Facebook
        const fbResponse = await axios.get(url);

        const { email, name, picture, id: fbId } = fbResponse.data;
        const pictureUrl = picture?.data?.url;

        if (!email) {
            // Some users sign up with phone number on FB and might not have email or didn't grant permission
            // If we want to support this, we need to handle non-email users (maybe use fbId as fake email or separate field)
            // For now, sticking to error but maybe relaxed if user wants phone login support via FB (complex)
            return res.status(400).json({ message: 'Facebook account does not have a verified email.' });
        }

        // 2. Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            if (user.accountStatus === 'inactive') {
                return res.status(403).json({ message: 'User is deactivate, please contact support', status: 'inactive' });
            }

            // Update photo if missing (and download it)
            if (!user.photo && pictureUrl) {
                const localPath = await downloadAndSaveImage(pictureUrl);
                if (localPath) {
                    user.photo = localPath;
                    if (!user.photoStatus) user.photoStatus = 'approved';
                    await user.save();
                }
            }

            // Update lastLogin date
            user.lastLogin = new Date();
            await user.save();

            // User exists - Log them in
            const token = jwt.sign(
                { id: user._id, email: user.email, role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile,
                    storeName: user.storeName,
                    actionType: user.actionType,
                    photo: user.photo
                }
            });
        } else {
            // User does not exist - Create new user
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
            const localPath = await downloadAndSaveImage(pictureUrl);

            user = new User({
                name,
                email,
                password: randomPassword,
                verifiedBy: 'Facebook',
                accountStatus: 'review',
                merchantType: 'Free',
                storeName: name,
                photo: localPath || undefined,
                photoStatus: localPath ? 'approved' : undefined
            });

            user.lastLogin = new Date();
            await user.save();

            const token = jwt.sign(
                { id: user._id, email: user.email, role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(201).json({
                message: 'User registered via Facebook',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    storeName: user.storeName,
                    actionType: user.actionType
                }
            });
        }

    } catch (err) {
        console.error('Facebook login error:', err.response?.data || err.message);
        res.status(400).json({ message: 'Invalid Facebook Token or failed to connect to Facebook' });
    }
};

// @desc    Login with Google
// @route   POST /api/user/google-login
// @access  Public
const googleLogin = async (req, res) => {
    const { token } = req.body;
    const axios = require('axios');

    try {
        const googleResponse = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`);
        const { email, name, picture } = googleResponse.data;

        if (!email) {
            return res.status(400).json({ message: 'Google account does not have a verified email.' });
        }

        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            if (user.accountStatus === 'inactive') {
                return res.status(403).json({ message: 'User is deactivate, please contact support', status: 'inactive' });
            }

            // Update photo if missing (and download it)
            if (!user.photo && picture) {
                const localPath = await downloadAndSaveImage(picture);
                if (localPath) {
                    user.photo = localPath;
                    if (!user.photoStatus) user.photoStatus = 'approved';
                    await user.save();
                }
            }

            // If user verifiedBy is 'Not Verified' (e.g. email/mobile not verified yet), update it?
            if (user.verifiedBy === 'Not Verified') {
                // User might have registered by email but not verified. 
                // If they login with Google, trust google?
                // Usually yes, but let's stick to safe 'Google' if new. 
                // If existing, maybe keep as is or update? 
                // User asked "verified by Google".
                // I will update verifiedBy if it is 'Not Verified'.
                user.verifiedBy = 'Google';
                await user.save();
            }

            // Update lastLogin date
            user.lastLogin = new Date();
            await user.save();

            // User exists - Log them in
            const jwtToken = jwt.sign(
                { id: user._id, email: user.email, role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                message: 'Login successful',
                token: jwtToken,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile,
                    storeName: user.storeName,
                    actionType: user.actionType,
                    photo: user.photo
                }
            });
        } else {
            // User does not exist - Create new user
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
            const localPath = await downloadAndSaveImage(picture);

            user = new User({
                name,
                email,
                password: randomPassword,
                verifiedBy: 'Google',
                accountStatus: 'review',
                merchantType: 'Free',
                storeName: name,
                photo: localPath || undefined,
                photoStatus: localPath ? 'approved' : undefined
            });

            user.lastLogin = new Date();
            await user.save();

            const jwtToken = jwt.sign(
                { id: user._id, email: user.email, role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(201).json({
                message: 'User registered via Google',
                token: jwtToken,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    storeName: user.storeName,
                    actionType: user.actionType,
                    photo: user.photo
                }
            });
        }

    } catch (err) {
        console.error('Google login error:', err.response?.data || err.message);
        res.status(400).json({ message: 'Invalid Google Token' });
    }
};

// @desc    Get all premium users
// @route   GET /api/user/premium
// @access  Public
const getPremiumUsers = async (req, res) => {
    try {
        let premiumUsers = await User.find({ merchantType: 'Premium' })
            .select('name storeName photo photoStatus merchantType verifiedBy profileViews mVerified followers')
            .lean();

        if (premiumUsers.length < 10) {
            const premiumIds = premiumUsers.map(u => u._id);
            const verifiedUsers = await User.find({
                mVerified: true,
                _id: { $nin: premiumIds }
            })
                .select('name storeName photo photoStatus merchantType verifiedBy profileViews mVerified followers')
                .limit(10 - premiumUsers.length)
                .lean();

            premiumUsers = [...premiumUsers, ...verifiedUsers];
        }

        const shuffled = premiumUsers.sort(() => Math.random() - 0.5);





        res.json({
            success: true,
            count: shuffled.length,
            data: shuffled
        });
    } catch (err) {
        console.error('Error fetching premium users:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const Payment = require('../models/Payment');

// ... existing code ...

// @desc    Get user activity details
// @route   GET /api/user/activity
// @access  Private
const getUserActivity = async (req, res) => {
    try {
        const followingPage = parseInt(req.query.followingPage, 10) || 1;
        const followingLimit = req.query.followingLimit !== undefined ? parseInt(req.query.followingLimit, 10) : undefined;
        const favoritesPage = parseInt(req.query.favoritesPage, 10) || 1;
        const favoritesLimit = req.query.favoritesLimit !== undefined ? parseInt(req.query.favoritesLimit, 10) : undefined;
        const paymentsPage = parseInt(req.query.paymentsPage, 10) || 1;
        const paymentsLimit = req.query.paymentsLimit !== undefined ? parseInt(req.query.paymentsLimit, 10) : undefined;

        const shouldPaginate = followingLimit !== undefined || favoritesLimit !== undefined || paymentsLimit !== undefined;

        const user = await User.findById(req.user.id)
            .populate({
                path: 'notifyPreferences.ad',
                select: 'headline price images user'
            });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const followingTotal = Array.isArray(user.following) ? user.following.length : 0;
        const favoritesTotal = Array.isArray(user.favorites) ? user.favorites.length : 0;
        const paymentsTotal = await Transaction.countDocuments({ sellerId: req.user.id });

        // Backward compatibility: if no pagination params provided, return full lists like before.
        if (!shouldPaginate) {
            await user.populate('following', 'name storeName photo');
            await user.populate({
                path: 'favorites',
                select: 'headline price images user',
                populate: { path: 'user', select: 'name storeName' }
            });

            const payments = await Payment.find({ user: req.user.id }).sort({ createdAt: -1 });
            const transactions = await Transaction.find({ sellerId: req.user.id }).sort({ payTime: -1, createdAt: -1 });

            return res.json({
                following: user.following,
                followingTotal,
                favorites: user.favorites,
                favoritesTotal,
                paymentsTotal,
                notifyCategories: user.notifyCategories,
                notifyPreferences: user.notifyPreferences,
                payments,
                transactions
            });
        }

        const safeFollowingLimit = Number.isFinite(followingLimit) ? followingLimit : 5;
        const safeFavoritesLimit = Number.isFinite(favoritesLimit) ? favoritesLimit : 5;
        const safePaymentsLimit = paymentsLimit !== undefined && Number.isFinite(paymentsLimit) ? paymentsLimit : 5;

        const followingSkip = safeFollowingLimit > 0 ? (Math.max(1, followingPage) - 1) * safeFollowingLimit : 0;
        const favoritesSkip = safeFavoritesLimit > 0 ? (Math.max(1, favoritesPage) - 1) * safeFavoritesLimit : 0;
        const paymentsSkip = safePaymentsLimit > 0 ? (Math.max(1, paymentsPage) - 1) * safePaymentsLimit : 0;

        // Preserve original order by slicing the stored ObjectId arrays first, then fetching documents.
        const followingIds = safeFollowingLimit > 0
            ? (user.following || []).slice(followingSkip, followingSkip + safeFollowingLimit)
            : [];
        const favoriteIds = safeFavoritesLimit > 0
            ? (user.favorites || []).slice(favoritesSkip, favoritesSkip + safeFavoritesLimit)
            : [];

        const [followingDocs, favoriteDocs, payments, transactions] = await Promise.all([
            followingIds.length > 0
                ? User.find({ _id: { $in: followingIds } }).select('name storeName photo sellerPageUrl mVerified').lean()
                : Promise.resolve([]),
            favoriteIds.length > 0
                ? Ad.find({ _id: { $in: favoriteIds } })
                    .select('headline price images user')
                    .populate('user', 'name storeName')
                    .lean()
                : Promise.resolve([]),
            Payment.find({ user: req.user.id }).sort({ createdAt: -1 }),
            safePaymentsLimit > 0
                ? Transaction.find({ sellerId: req.user.id })
                    .sort({ payTime: -1, createdAt: -1 })
                    .skip(paymentsSkip)
                    .limit(safePaymentsLimit)
                    .select('tnxId mode sellerId productId mobileNumber amount payType payeeName item status payTime createdAt')
                    // Include promoteEndDate and promotionHistory so the client can display when promotions ended,
                    // even after cleanup clears the active promotion fields.
                    .populate('productId', 'promoteDuration promoteStartDate promoteEndDate promotionHistory')
                    .lean()
                : Promise.resolve([])
        ]);

        const followingMap = new Map(followingDocs.map(u => [String(u._id), u]));
        const favoritesMap = new Map(favoriteDocs.map(a => [String(a._id), a]));

        const orderedFollowing = followingIds.map(id => followingMap.get(String(id))).filter(Boolean);
        const orderedFavorites = favoriteIds.map(id => favoritesMap.get(String(id))).filter(Boolean);

        const followingHasMore = safeFollowingLimit > 0 ? (followingSkip + safeFollowingLimit < followingTotal) : false;
        const favoritesHasMore = safeFavoritesLimit > 0 ? (favoritesSkip + safeFavoritesLimit < favoritesTotal) : false;
        const paymentsHasMore = safePaymentsLimit > 0 ? (paymentsSkip + safePaymentsLimit < paymentsTotal) : false;

        res.json({
            following: orderedFollowing,
            followingTotal,
            followingHasMore,
            favorites: orderedFavorites,
            favoritesTotal,
            favoritesHasMore,
            paymentsTotal,
            paymentsHasMore,
            notifyCategories: user.notifyCategories,
            notifyPreferences: user.notifyPreferences,
            payments,
            transactions
        });
    } catch (err) {
        console.error('Error fetching activity:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update notification settings
// @route   PUT /api/user/notify-settings
// @access  Private
const updateNotifySettings = async (req, res) => {
    try {
        const { categories } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.notifyCategories = categories;
        await user.save();
        res.json({ message: 'Notification settings updated', categories: user.notifyCategories });
    } catch (err) {
        console.error('Error updating notify settings:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Add notify preference (subCategory + location)
// @route   POST /api/user/notify-preference
// @access  Private
const addNotifyPreference = async (req, res) => {
    try {
        const { subCategory, location, adId } = req.body;
        if (!subCategory || !location) {
            return res.status(400).json({ message: 'Subcategory and location are required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Check if already exists to avoid duplicates
        const exists = user.notifyPreferences.some(p => p.subCategory === subCategory && p.location === location);
        if (exists) {
            return res.json({ message: 'Preference already exists', preferences: user.notifyPreferences });
        }

        user.notifyPreferences.push({ subCategory, location, ad: adId });
        await user.save();
        res.status(201).json({ message: 'Notify preference added', preferences: user.notifyPreferences });
    } catch (err) {
        console.error('Error adding notify preference:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Remove notify preference
// @route   DELETE /api/user/notify-preference/:id
// @access  Private
const removeNotifyPreference = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.notifyPreferences = user.notifyPreferences.filter(p => p._id.toString() !== req.params.id);
        await user.save();
        res.json({ message: 'Notify preference removed', preferences: user.notifyPreferences });
    } catch (err) {
        console.error('Error removing notify preference:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const checkMobile = async (req, res) => {
    const { mobile, email } = req.body;
    try {
        const userByMobile = await User.findOne({ mobile });
        const userByEmail = email ? await User.findOne({ email }) : null;

        let exists = !!userByMobile;
        let matchesEmail = true;
        let emailExists = !!userByEmail;

        if (userByMobile) {
            // If mobile exists, check if it matches the provided email (if provided)
            matchesEmail = email ? userByMobile.email === email : !userByMobile.email;
        } else if (userByEmail) {
            // Mobile is new, but Email already exists
            // If the user by email ALREADY has a mobile number, then this new mobile is NOT allowed to be added to this account via this flow (needs to be confirmed/processed as a change)
            if (userByEmail.mobile && userByEmail.mobile !== mobile) {
                matchesEmail = false;
                exists = true; // Treating as existing account that is not matched
            }
        }

        res.json({
            exists: exists,
            verifiedBy: userByMobile ? userByMobile.verifiedBy : (userByEmail ? userByEmail.verifiedBy : null),
            matchesEmail: matchesEmail,
            emailExists: emailExists,
            emailUserHasMobile: !!(userByEmail && userByEmail.mobile)
        });
    } catch (err) {
        console.error('Error checking mobile:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const checkEmail = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        res.json({ exists: !!user });
    } catch (err) {
        console.error('Error checking email:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const followUser = async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: "You cannot follow yourself" });
        }

        const targetUser = await User.findById(req.params.id);
        const currentUser = await User.findById(req.user.id);

        if (!targetUser || !currentUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if already following
        if (!currentUser.following.includes(req.params.id)) {
            // Follow
            await currentUser.updateOne({ $push: { following: req.params.id } });
            const updatedTarget = await User.findByIdAndUpdate(
                req.params.id,
                { $push: { followers: req.user.id } },
                { new: true }
            ).select('followers');
            res.status(200).json({ message: "User followed", isFollowing: true, followers: updatedTarget.followers });
        } else {
            // Unfollow
            await currentUser.updateOne({ $pull: { following: req.params.id } });
            const updatedTarget = await User.findByIdAndUpdate(
                req.params.id,
                { $pull: { followers: req.user.id } },
                { new: true }
            ).select('followers');
            res.status(200).json({ message: "User unfollowed", isFollowing: false, followers: updatedTarget.followers });
        }
    } catch (err) {
        console.error('Error following user:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Toggle favorite ad
// @route   POST /api/user/favorite/:id
// @access  Private
const toggleFavoriteAd = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const adId = req.params.id;
        const isFavorited = user.favorites.includes(adId);

        if (isFavorited) {
            // Unfavorite
            user.favorites = user.favorites.filter(id => id.toString() !== adId);
            await user.save();
            res.json({ success: true, message: 'Removed from favorites', isFavorited: false });
        } else {
            // Favorite
            user.favorites.push(adId);
            await user.save();
            res.json({ success: true, message: 'Added to favorites', isFavorited: true });
        }
    } catch (err) {
        console.error('Error toggling favorite:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Toggle notify preference (subCategory + location)
// @route   POST /api/user/notify-preference/toggle
// @access  Private
const toggleNotifyPreference = async (req, res) => {
    try {
        const { subCategory, location, adId } = req.body;
        if (!subCategory || !location) {
            return res.status(400).json({ message: 'Subcategory and location are required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Find if exists
        const index = user.notifyPreferences.findIndex(p => p.subCategory === subCategory && p.location === location);

        if (index !== -1) {
            // Remove
            user.notifyPreferences.splice(index, 1);
            await user.save();
            res.json({ success: true, message: 'Notify preference removed', isNotifying: false });
        } else {
            // Add
            user.notifyPreferences.push({ subCategory, location, ad: adId });
            await user.save();
            res.status(201).json({ success: true, message: 'Notify preference added', isNotifying: true });
        }
    } catch (err) {
        console.error('Error toggling notify preference:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get public user profile by ID
// @route   GET /api/user/profile/:id
// @access  Public
const getPublicProfile = async (req, res) => {
    try {
        const idOrUsername = req.params.id;
        let query = {};

        // Check if it's a valid MongoDB ObjectId
        if (idOrUsername.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: idOrUsername };
        } else {
            query = { sellerPageUrl: idOrUsername };
        }

        const user = await User.findOne(query).select('-password -accountStatus');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error fetching public profile:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const rateUser = async (req, res) => {
    try {
        if (!req.params.id) {
            return res.status(400).json({ message: "User ID is required" });
        }
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: "You cannot rate yourself" });
        }

        const { stars } = req.body;
        if (!stars || stars < 1 || stars > 5) {
            return res.status(400).json({ message: "Invalid rating. Must be between 1 and 5 stars" });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if user already rated
        const existingRatingIndex = user.ratings.findIndex(r => r.user.toString() === req.user.id);

        if (existingRatingIndex !== -1) {
            // Update existing rating
            user.ratings[existingRatingIndex].stars = stars;
        } else {
            // Add new rating
            user.ratings.push({ user: req.user.id, stars });
        }

        // Calculate average rating
        const totalStars = user.ratings.reduce((acc, curr) => acc + curr.stars, 0);
        user.rating = Math.round(totalStars / user.ratings.length);

        await user.save();

        res.json({
            message: "Rating submitted successfully",
            rating: user.rating,
            count: user.ratings.length
        });
    } catch (err) {
        console.error('Rate user error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get user notifications
// @route   GET /api/user/notifications
// @access  Private
const getNotifications = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Find individual notifications for this user OR any broadcast
        const notifications = await Notification.find({
            $or: [
                { userId: req.user.id },
                { isBroadcast: true }
            ]
        }).sort({ createdAt: -1 });

        // Filter broadcasts to match user's profile
        const filtered = notifications.filter(notif => {
            if (!notif.isBroadcast) return true;

            // If it's a targeted broadcast (has specific users list), check membership
            if (notif.targetUsers && notif.targetUsers.length > 0) {
                return notif.targetUsers.some(id => id.toString() === req.user.id);
            }

            // Otherwise, apply dynamic group/filter checks
            // Group check
            const isSeller = user.merchantType === 'Premium' || user.merchantType === 'Free Saller';
            if (notif.targetGroup === 'Seller' && !isSeller) return false;
            if (notif.targetGroup === 'Customer' && isSeller) return false;

            // Simple Filter check
            if (notif.filters) {
                const f = notif.filters;
                if (f.categories?.length > 0 && !f.categories.includes(user.category)) return false;
                if (f.locations?.length > 0 && !f.locations.includes(user.location)) return false;
                if (f.gender && user.gender) {
                    if (f.gender.toLowerCase() !== user.gender.toLowerCase()) return false;
                }
                if (f.trustedSeller) {
                    const isTrusted = user.merchantTrustStatus === 'Trusted';
                    if (f.trustedSeller === 'Yes' && !isTrusted) return false;
                    if (f.trustedSeller === 'UnTrusted' && isTrusted) return false;
                }
            }

            return true;
        });

        // Map to include read status for broadcasts
        const result = filtered.map(notif => {
            const n = notif.toObject();
            if (n.isBroadcast) {
                n.isRead = n.readBy?.some(id => id.toString() === req.user.id) || false;
            }
            return n;
        });

        res.json(result);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/user/notifications/:id/read
// @access  Private
const markNotificationAsRead = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        if (notification.isBroadcast) {
            // Use $addToSet to ensure user ID is only added once in the database
            await Notification.updateOne(
                { _id: req.params.id },
                { $addToSet: { readBy: req.user.id } }
            );
        } else {
            // For individual, check ownership
            if (notification.userId.toString() !== req.user.id) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
            notification.isRead = true;
            await notification.save();
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error marking notification read:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const checkSellerUrl = async (req, res) => {
    const { url } = req.body;
    try {
        if (!url) return res.status(400).json({ message: 'URL is required' });

        // Find if any other user has this URL
        const existingUser = await User.findOne({
            sellerPageUrl: url,
            _id: { $ne: req.user.id } // Exclude current user
        });

        res.json({ available: !existingUser });
    } catch (err) {
        console.error('Error checking seller URL:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

const incrementProfileViews = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $inc: { profileViews: 1 } },
            { new: true }
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ success: true, profileViews: user.profileViews });
    } catch (err) {
        console.error('Error incrementing profile views:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Change user password
// @route   PUT /api/user/change-password
// @access  Private
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new passwords are required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Request account deletion
// @route   POST /api/user/delete-request
// @access  Private
const requestDelete = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.accountStatus = 'r_delete';
        await user.save();

        res.json({ success: true, message: 'Account deletion requested successfully' });
    } catch (err) {
        console.error('Error requesting delete:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Automatically cleanup expired user verifications
 */
const cleanupExpiredVerifications = async () => {
    try {
        const settings = await PremierOpportunity.findOne();
        const durationInDays = settings ? (settings.verifyBadgeDuration || 365) : 365;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - durationInDays);

        // Find users whose verifiedAt is older than (Duration) days
        const result = await User.updateMany(
            {
                mVerified: true,
                verifiedAt: { $lt: cutoffDate }
            },
            {
                $set: {
                    mVerified: false,
                    merchantTrustStatus: 'Untrusted'
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[User Cleanup] Expired verification for ${result.modifiedCount} users.`);
        }
    } catch (err) {
        console.error("[User Cleanup] Error during verification cleanup:", err);
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    updateProfile,
    facebookLogin,
    googleLogin,
    rateUser,
    getPublicProfile,
    getPremiumUsers,
    getUserActivity,
    updateNotifySettings,
    addNotifyPreference,
    removeNotifyPreference,
    checkMobile,
    checkEmail,
    followUser,
    getNotifications,
    markNotificationAsRead,
    incrementProfileViews,
    checkSellerUrl,
    toggleFavoriteAd,
    toggleNotifyPreference,
    changePassword,
    requestDelete,
    cleanupExpiredVerifications
};
