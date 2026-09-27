const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true
    },
    password: {
        type: String,
        required: true
    },
    dob: {
        type: Date
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other', 'Male', 'Female', 'Other', ''],
    },
    additionalMobiles: {
        type: [String],
        default: []
    },
    mobile: {
        type: String
    },
    storeName: {
        type: String
    },
    actionType: {
        type: [String],
        enum: ['call', 'chat', 'sendcv'],
        default: ['call']
    },
    accountStatus: {
        type: String,
        enum: ['active', 'inactive', 'review', 'active_message', 'inactive_message', 'r_delete'],
        default: 'review'
    },
    verifiedBy: {
        type: String,
        default: 'Not Verified'
    },
    verifiedNumber: {
        type: String
    },
    verifiedAt: {
        type: Date
    },
    mVerified: {
        type: Boolean,
        default: false
    },
    mobileVerified: {
        type: Boolean,
        default: false
    },
    location: {
        type: String
    },
    category: {
        type: String
    },
    pageName: {
        type: String
    },
    merchantType: {
        type: String,
        enum: ['Free', 'Premium', 'Free Saller'],
        default: 'Free'
    },
    merchantTrustStatus: {
        type: String,
        enum: ['Trusted', 'Untrusted'],
        default: 'Untrusted'
    },

    // Extended Profile Fields
    education: { type: String },
    currentJob: { type: String },
    jobExperience: { type: String },
    note: { type: String },
    aboutYourself: { type: String },
    profession: { type: String },
    professionalExperience: { type: String },
    sellerPageUrl: { type: String, unique: true, sparse: true }, // Slug for shop URL
    aboutBusiness: { type: String },
    contact: { type: String },
    storeLogo: {
        type: String // Base64 or URL
    },
    storeLogoStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    storeBanner: {
        type: String // Base64 or URL
    },
    storeBannerStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    photo: {
        type: String // Base64 or URL
    },
    photoStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    favorites: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ad',
        default: []
    }],
    notifyCategories: {
        type: [String],
        default: []
    },
    ratings: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        stars: { type: Number, required: true, min: 1, max: 5 }
    }],
    rating: {
        type: Number,
        default: 0
    },
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    notifyPreferences: [{
        subCategory: String,
        location: String,
        ad: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
        createdAt: { type: Date, default: Date.now }
    }],
    profileViews: {
        type: Number,
        default: 0
    },
    lastLogin: {
        type: Date
    },
    lastPostCategory: { type: String },
    lastPostSubCategory: { type: String },
    lastPostLocation: { type: String },
    lastPostSubLocation: { type: String }
});

// Hash password before saving
UserSchema.pre('save', async function () {
    // Automatically set storeName to name if it's missing
    if (!this.storeName && this.name) {
        this.storeName = this.name;
    }

    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', UserSchema);
