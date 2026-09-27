const Setting = require('../models/Setting');
const Ad = require('../models/Ad');

exports.getSettings = async (req, res) => {
    try {
        let setting = await Setting.findOne();
        if (!setting) {
            setting = new Setting();
            await setting.save();
        }
        res.status(200).json({ success: true, data: setting });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getDashboardSettings = async (req, res) => {
    try {
        const setting = await Setting.findOne({}, 'siteLogo favIcon watermarkLogo ogImage userRepeatAdViewTime adReShowAfterMinutes');
        res.status(200).json({ success: true, data: setting || {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getPostAdSettings = async (req, res) => {
    try {
        const setting = await Setting.findOne({}, 'productPhotoLimit blockCheckInHeadline blockCheckInDescription');
        res.status(200).json({ success: true, data: setting || {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateSettings = async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    try {
        let setting = await Setting.findOne();
        if (!setting) {
            setting = new Setting();
        }

        const {
            productAutoInactiveTime,
            userRepeatAdViewTime,
            adReShowAfterMinutes,
            productPhotoLimit,
            blockCheckInHeadline,
            blockCheckInDescription
        } = req.body;

        if (productAutoInactiveTime !== undefined) {
            const time = parseInt(productAutoInactiveTime, 10) || 90;
            setting.productAutoInactiveTime = time;

            // Calculate cutoff date (time in days)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - time);

            // 1. Inactivate ads that have exceeded the new limit
            await Ad.updateMany(
                {
                    status: 'active',
                    createdAt: { $lt: cutoffDate }
                },
                { $set: { status: 'inactive' } }
            );

            // 2. Re-activate ads that are now within the new limit
            // This brings back ads that were inactivated when the limit was shorter
            await Ad.updateMany(
                {
                    status: 'inactive',
                    createdAt: { $gte: cutoffDate }
                },
                { $set: { status: 'active' } }
            );
        }
        if (userRepeatAdViewTime !== undefined) setting.userRepeatAdViewTime = parseInt(userRepeatAdViewTime, 10);
        if (adReShowAfterMinutes !== undefined) setting.adReShowAfterMinutes = Math.max(0, parseInt(adReShowAfterMinutes, 10) || 0);

        if (productPhotoLimit !== undefined) setting.productPhotoLimit = parseInt(productPhotoLimit, 10);

        if (blockCheckInDescription !== undefined) {
            let values = [];
            if (Array.isArray(blockCheckInDescription)) {
                values = blockCheckInDescription;
            } else {
                try {
                    const parsed = JSON.parse(blockCheckInDescription);
                    values = Array.isArray(parsed) ? parsed : [blockCheckInDescription];
                } catch {
                    values = [blockCheckInDescription];
                }
            }
            setting.blockCheckInDescription = values.filter(v => v && v.toString().trim() !== "");
        }

        if (blockCheckInHeadline !== undefined) {
            let values = [];
            if (Array.isArray(blockCheckInHeadline)) {
                values = blockCheckInHeadline;
            } else {
                try {
                    const parsed = JSON.parse(blockCheckInHeadline);
                    values = Array.isArray(parsed) ? parsed : [blockCheckInHeadline];
                } catch {
                    values = [blockCheckInHeadline];
                }
            }
            setting.blockCheckInHeadline = values.filter(v => v && v.toString().trim() !== "");
        }

        if (req.customFiles) {
            if (req.customFiles.siteLogo) {
                if (setting.siteLogo) {
                    const oldPath = path.join(__dirname, '..', setting.siteLogo);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                setting.siteLogo = req.customFiles.siteLogo;
            }
            if (req.customFiles.favIcon) {
                if (setting.favIcon) {
                    const oldPath = path.join(__dirname, '..', setting.favIcon);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                setting.favIcon = req.customFiles.favIcon;
            }
            if (req.customFiles.watermarkLogo) {
                if (setting.watermarkLogo) {
                    const oldPath = path.join(__dirname, '..', setting.watermarkLogo);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                setting.watermarkLogo = req.customFiles.watermarkLogo;
            }
            if (req.customFiles.ogImage) {
                if (setting.ogImage) {
                    const oldPath = path.join(__dirname, '..', setting.ogImage);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                setting.ogImage = req.customFiles.ogImage;
            }
        }

        await setting.save();
        res.status(200).json({ success: true, data: setting, message: "Settings updated successfully" });

    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
