const jwt = require('jsonwebtoken');

// Verify JWT token for admin routes
const verifyToken = async (req, res, next) => {
    let token = req.header('x-auth-token');

    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token || token === 'undefined' || token === 'null') {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Migrate legacy CEO tokens that used the virtual development-admin id.
        if (
            decoded.email === 'admin.shadamon@gmail.com' &&
            decoded.id === 'development-admin'
        ) {
            const Admin = require('../models/Admin');
            const masterAdmin = await Admin.findOne({
                email: 'admin.shadamon@gmail.com'
            });

            if (!masterAdmin) {
                return res.status(401).json({
                    message: 'Master admin account not initialized. Please sign in again.'
                });
            }

            decoded.id = masterAdmin._id.toString();
            decoded.staffName = masterAdmin.staffName || 'Shadamon Admin';
            decoded.staffType = masterAdmin.staffType || 'Super Admin';
            decoded.permissions = {
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
        }

        req.admin = decoded;
        next();
    } catch (e) {
        console.error('Admin token verification error:', e);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// Check specific permission
const checkPermission = (permission) => {
    return async (req, res, next) => {
        try {
            const jwtPermissions = req.admin?.permissions || {};

            // Development/super-admin tokens may explicitly grant everything.
            // Keep this check before the database fallback because the development
            // admin intentionally does not have a MongoDB ObjectId.
            if (
                jwtPermissions.all === true ||
                jwtPermissions[permission] === true
            ) {
                return next();
            }

            // Fallback to the database for normal admin accounts. This keeps
            // permission changes effective without requiring a new login.
            const Admin = require('../models/Admin');
            const admin = await Admin.findById(req.admin.id);

            const hasPermission =
                admin?.permissions instanceof Map
                    ? admin.permissions.get(permission) === true
                    : admin?.permissions?.[permission] === true;

            if (!admin || !hasPermission) {
                return res.status(403).json({
                    message: `Access denied. Requires '${permission}' permission.`
                });
            }

            req.admin.permissions = admin.permissions;
            next();
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({ message: 'Internal server error during permission check' });
        }
    };
};


// Authenticate regular users
const authenticateUser = (req, res, next) => {
    let token = req.cookies?.token;

    // Also check Authorization header
    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Optional Authentication
const optionalAuthenticateUser = (req, res, next) => {
    let token = req.cookies?.token;

    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        } catch (err) {
            // Invalid token, just proceed as guest
        }
    }
    next();
};

module.exports = {
    verifyToken,
    checkPermission,
    authenticateUser,
    optionalAuthenticateUser
};
