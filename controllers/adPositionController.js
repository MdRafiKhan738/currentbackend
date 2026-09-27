const AdPosition = require('../models/AdPosition');
const path = require('path');
const fs = require('fs');

// @desc    Get all ad positions
// @route   GET /api/admins/ad-positions
// @access  Private (Admin)
const getAdPositions = async (req, res) => {
    try {
        let positions = await AdPosition.find().sort({ positionId: 1 });
        
        // If no positions exist, initialize them
        if (positions.length === 0) {
            const initialData = [
                { positionId: 1, placeName: "Place 1 (Website Top)", deskWidth: "1200", deskHeight: "80", link: "www.newsi247.com", status: 'Yes' },
                { positionId: 2, placeName: "Place 2 (Home top)", deskWidth: "1200", deskHeight: "260", link: "www.newsi247.com", status: 'Yes' },
                { positionId: 3, placeName: "Place 3 (Detail Bottom)", deskWidth: "520", deskHeight: "260", link: "www.newsi247.com", status: 'Yes' },
                { positionId: 4, placeName: "Place 4 (User Post Page top)", deskWidth: "515", deskHeight: "130", link: "www.newsi247.com", status: 'Yes' },
                { positionId: 5, placeName: "Place 5 (Total Site pop up)", deskWidth: "300", deskHeight: "250", link: "www.newsi247.com", status: 'Yes' }
            ];
            await AdPosition.insertMany(initialData);
            positions = await AdPosition.find().sort({ positionId: 1 });
        }
        
        res.json(positions);
    } catch (err) {
        console.error('Error fetching ad positions:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update an ad position
// @route   PUT /api/admins/ad-positions/:id
// @access  Private (Admin)
const updateAdPosition = async (req, res) => {
    try {
        const { 
            placeName, 
            deskWidth, 
            deskHeight, 
            mobWidth, 
            mobHeight, 
            link, 
            endDate, 
            status
        } = req.body;

        const position = await AdPosition.findById(req.params.id);

        if (!position) {
            return res.status(404).json({ message: 'Ad position not found' });
        }

        // Handle File Uploads (imageDesk / imageMob)
        if (req.files) {
            if (req.files.imageDesk && req.files.imageDesk[0]) {
                // If there's an old image, maybe delete it? 
                // For now just update to the new path provided by the upload middleware
                position.imageDesk = req.files.imageDesk[0].path;
            }
            if (req.files.imageMob && req.files.imageMob[0]) {
                position.imageMob = req.files.imageMob[0].path;
            }
        }

        position.placeName = placeName || position.placeName;
        position.deskWidth = deskWidth !== undefined ? deskWidth : position.deskWidth;
        position.deskHeight = deskHeight !== undefined ? deskHeight : position.deskHeight;
        position.mobWidth = mobWidth !== undefined ? mobWidth : position.mobWidth;
        position.mobHeight = mobHeight !== undefined ? mobHeight : position.mobHeight;
        position.link = link !== undefined ? link : position.link;
        position.endDate = endDate || position.endDate;
        position.status = status || position.status;

        await position.save();
        res.json(position);
    } catch (err) {
        console.error('Error updating ad position:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all ad positions (Public)
// @route   GET /api/ads/public/ad-positions
// @access  Public
const getAdPositionsPublic = async (req, res) => {
    try {
        const currentDate = new Date();
        const positions = await AdPosition.find({ 
            status: 'Yes',
            $or: [
                { endDate: { $exists: false } },
                { endDate: null },
                { endDate: { $gt: currentDate } }
            ]
        }).sort({ positionId: 1 });
        res.json(positions);
    } catch (err) {
        console.error('Error fetching public ad positions:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getAdPositions,
    updateAdPosition,
    getAdPositionsPublic
};
