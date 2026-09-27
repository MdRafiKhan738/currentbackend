const Location = require('../models/Location');
const SubLocation = require('../models/SubLocation');
const { fileToBase64, processImageString } = require('../utils/imageHelper');

// --- Location Controllers ---
exports.createLocation = async (req, res) => {
    try {
        const { name, locationNameBn, status, order } = req.body;
        const slug = name.toLowerCase().replace(/ /g, '-');

        const location = new Location({
            name,
            locationNameBn: String(locationNameBn || '').trim(),
            slug,
            order,
            status: status === 'true' || status === true,
            createdBy: {
                adminId: req.admin.id,
                adminName: req.admin.name || 'Admin'
            },
            image: req.file ? req.file.path.replace(/\\/g, "/") : null
        });

        await location.save();
        res.status(201).json({ success: true, data: location });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateLocation = async (req, res) => {
    try {
        const { name, locationNameBn, status, order } = req.body;
        const updateData = {
            name,
            status: status === 'true' || status === true,
            order
        };
        if (name) updateData.slug = name.toLowerCase().replace(/ /g, '-');
        if (locationNameBn !== undefined) {
            updateData.locationNameBn = String(locationNameBn || '').trim();
        }
        if (req.file) {
            updateData.image = req.file.path.replace(/\\/g, "/");
        }

        const location = await Location.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: location });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getAllLocations = async (req, res) => {
    try {
        const locations = await Location.find().sort({ order: 1 });
        res.json({ success: true, data: locations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteLocation = async (req, res) => {
    try {
        // Optional: Delete associated sublocations first if strict consistency is needed
        await SubLocation.deleteMany({ location: req.params.id });
        await Location.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Location deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- SubLocation Controllers ---
exports.createSubLocation = async (req, res) => {
    try {
        const { name, subLocationNameBn, location, mapLink, order, status } = req.body;
        const names = Array.isArray(name) ? name : [name];
        const nameBns = Array.isArray(subLocationNameBn) ? subLocationNameBn : [subLocationNameBn];
        const subLocations = [];

        for (let index = 0; index < names.length; index++) {
            const subName = String(names[index] || '').trim();
            if (!subName) continue;

            const subNameBn = String(nameBns[index] || '').trim();

            const subLocation = new SubLocation({
                name: subName,
                subLocationNameBn: subNameBn,
                location,
                mapLink,
                order,
                status: status === 'true' || status === true,
                image: req.file ? req.file.path.replace(/\\/g, "/") : null,
                createdBy: {
                    adminId: req.admin.id,
                    adminName: req.admin.name || 'Admin'
                }
            });

            await subLocation.save();
            subLocations.push(subLocation);
        }

        res.status(201).json({ success: true, data: subLocations.length === 1 ? subLocations[0] : subLocations });
    } catch (err) {
        console.error('Error creating sublocation:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateSubLocation = async (req, res) => {
    try {
        const { name, subLocationNameBn, location, mapLink, order, status } = req.body;
        const updateData = {
            name,
            location,
            mapLink,
            order,
            status: status === 'true' || status === true
        };
        if (subLocationNameBn !== undefined) {
            updateData.subLocationNameBn = String(subLocationNameBn || '').trim();
        }
        if (req.file) {
            updateData.image = req.file.path.replace(/\\/g, "/");
        }

        const subLocation = await SubLocation.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: subLocation });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getAllSubLocations = async (req, res) => {
    try {
        const subLocations = await SubLocation.find()
            .populate('location', 'name locationNameBn')
            .sort({ order: 1 });
        res.json({ success: true, data: subLocations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteSubLocation = async (req, res) => {
    try {
        await SubLocation.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'SubLocation deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
