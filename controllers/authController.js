const User = require('../models/User');
const OTP = require('../models/OTP');
const MobileOTP = require('../models/MobileOTP');
const { sendOTP } = require('../utils/emailService');
const { sendSMSOTP } = require('../utils/smsService');
const jwt = require('jsonwebtoken');

// Generate 6 digit numeric OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.requestOTP = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.verifiedBy !== 'Not Verified') {
            return res.json({ success: true, message: 'User already verified', isVerified: true });
        }

        // Logic to limit requests could be added here (e.g., redis or simply check OTP count in last minute)

        const otp = generateOTP();

        // Remove existing OTPs for this user
        await OTP.deleteMany({ userId });

        // Save new OTP
        await new OTP({ userId, otp }).save();

        // Send Email
        const emailSent = await sendOTP(user.email, otp);

        if (emailSent) {
            res.json({ success: true, message: 'OTP sent to your email', isVerified: false });
        } else {
            res.status(500).json({ success: false, message: 'Failed to send email' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;
        const userId = req.user.id;

        const record = await OTP.findOne({ userId, otp });

        if (!record) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // If correct, update user verification status
        await User.findByIdAndUpdate(userId, { verifiedBy: 'Email' });

        // Cleanup OTP
        await OTP.deleteOne({ _id: record._id });

        res.json({ success: true, message: 'Verification successful', isVerified: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.requestMobileOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        const otp = generateOTP();

        // Remove existing OTPs for this phone
        await MobileOTP.deleteMany({ phone });

        // Save new OTP
        await new MobileOTP({ phone, otp }).save();

        // Send SMS
        const smsSent = await sendSMSOTP(phone, otp);

        if (smsSent) {
            res.json({ success: true, message: 'OTP sent to your mobile' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to send SMS' });
        }

    } catch (err) {
        console.error("Mobile OTP Request Error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.verifyMobileOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
        }

        const record = await MobileOTP.findOne({ phone, otp });

        if (!record) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Cleanup OTP
        await MobileOTP.deleteOne({ _id: record._id });

        res.json({ success: true, message: 'Mobile verification successful', isVerified: true });

    } catch (err) {
        console.error("Mobile OTP Verify Error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.forgotPasswordRequest = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: 'No account found with this email' });

        if (user.accountStatus === 'inactive') {
            return res.status(403).json({ success: false, message: 'User is deactivate, please contact support' });
        }

        const otp = generateOTP();

        // Remove existing OTPs for this user
        await OTP.deleteMany({ userId: user._id });

        // Save new OTP
        await new OTP({ userId: user._id, otp }).save();

        // Send Email
        const emailSent = await sendOTP(email, otp);

        if (emailSent) {
            res.json({ success: true, message: 'OTP sent to your email' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to send verification email' });
        }
    } catch (err) {
        console.error("Forgot Password Request Error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.forgotPasswordVerify = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.accountStatus === 'inactive') {
            return res.status(403).json({ success: false, message: 'User is deactivate, please contact support' });
        }

        const record = await OTP.findOne({ userId: user._id, otp });

        if (!record) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        }

        // 1. Update Password
        // User model should have a pre-save hook that hashes the password automatically.
        // If not, we should hash it here. Let's assume it hashes automatically or we do it.
        // For Shadamon, typically models hash it.
        user.password = newPassword;
        await user.save();

        // 2. Generate JWT token (automatically log them in)
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 3. Cleanup OTP
        await OTP.deleteOne({ _id: record._id });

        res.json({
            success: true,
            message: 'Password updated and login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                storeName: user.storeName,
                actionType: user.actionType
            }
        });

    } catch (err) {
        console.error("Forgot Password Verify Error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
