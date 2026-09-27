require('dotenv').config();
const express = require('express');
const connectDB = require('./config/database');
const cors = require('cors');

// Import routes //test push
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adRoutes = require('./routes/adRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const locationRoutes = require('./routes/locationRoutes');
const premierOpportunityRoutes = require('./routes/premierOpportunityRoutes');
const settingRoutes = require('./routes/settingRoutes');
const reportRoutes = require('./routes/reportRoutes');
const packageRoutes = require('./routes/packageRoutes');
const connectRoutes = require('./routes/connectRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const proposalRoutes = require('./routes/proposalRoutes');
const activityRoutes = require('./routes/activityRoutes');
const profileViewRoutes = require('./routes/profileViewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

console.log('✅ Routes imported successfully');
console.log('User routes:', typeof userRoutes);
console.log('Admin routes:', typeof adminRoutes);

// Error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Express app
const app = express();
app.use(cors());
const server = require('http').createServer(app);
const io = new (require('socket.io').Server)(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Make io accessible to our router/controllers
app.set('socketio', io);

const PORT = process.env.PORT || 5000;

// Socket.io logic
io.on('connection', (socket) => {
    socket.on('setup', (userData) => {
        if (userData && userData.id) {
            socket.join(userData.id);
            console.log(`Socket: User ${userData.id} set up personal room`);
            socket.emit('connected');
        }
    });

    socket.on('join chat', (room) => {
        socket.join(room);
    });

    socket.on('new message', (newMessageReceived) => {
        const receiverId = newMessageReceived.receiver;
        if (!receiverId) return;

        console.log(`Socket: New message from ${newMessageReceived.sender} to ${receiverId}`);

        // Emit to the receiver's personal room
        socket.to(receiverId).emit('message received', newMessageReceived);
    });

    socket.on('typing', (room) => {
        console.log(`Socket: User typing in room ${room}`);
        socket.to(room).emit('typing');
    });

    socket.on('stop typing', (room) => {
        socket.to(room).emit('stop typing');
    });

    socket.on('message seen', ({ adId, senderId, receiverId }) => {
        socket.to(senderId).emit('seen updated', { adId, receiverId });
    });
});

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// Request logging middleware (for debugging)
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// Import new routes
const messageRoutes = require('./routes/messageRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Health check route
app.get('/', (req, res) => {
    res.json({
        message: 'Shadamon API Server',
        status: 'Running',
        version: '1.0.0'
    });
});

// API Routes
app.use('/api/user', userRoutes);
app.use('/api/auth', adminRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/premier-opportunity', premierOpportunityRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/connects', connectRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/profile-views', profileViewRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        message: 'Route not found',
        path: req.originalUrl
    });
});

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Start Server
        server.listen(PORT, () => {
            console.log(`\n🚀 Server running on port ${PORT}`);
            console.log(`\n✨ Socket.io initialized`);
            console.log(`\n✨ Ready to accept requests!\n`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err);
        process.exit(1);
    }
};

// Automated Background Tasks
const adController = require('./controllers/adController');
const userController = require('./controllers/userController');

setInterval(() => {
    console.log('🕒 Running scheduled ad/promotion cleanup...');
    adController.cleanupExpiredPromotions().catch(err => console.error("Promotion Cleanup Failed", err));
    adController.cleanupExpiredAds().catch(err => console.error("Ad Expiration Cleanup Failed", err));
}, 1000 * 60 * 60); // Run every 1 hour

setInterval(() => {
    console.log('🕒 Running scheduled user verification cleanup...');
    userController.cleanupExpiredVerifications().catch(err => console.error("User Cleanup Failed", err));
}, 1000 * 60 * 60); // Run every 1 hour

startServer();
