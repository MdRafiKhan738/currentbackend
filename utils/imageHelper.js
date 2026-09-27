const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

/**
 * Converts a file buffer to a base64 Data URI string.
 * @param {Object} file - The file object from multer (must have buffer and mimetype).
 * @returns {string|null} - The base64 Data URI.
 */
const fileToBase64 = (file) => {
    if (!file || !file.buffer || !file.mimetype) return null;
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
};

/**
 * Ensures a string is a valid Data URI or returns it if it's a URL/path.
 * @param {string} str - The string to check.
 * @returns {string|null}
 */
const processImageString = (str) => {
    if (!str || typeof str !== 'string') return null;
    if (str.startsWith('data:') || str.startsWith('/') || str.startsWith('http')) return str;
    // Assume raw base64, default to jpeg
    return `data:image/jpeg;base64,${str}`;
};

/**
 * Downloads an image from a URL and saves it to the uploads folder as WebP.
 * @param {string} url - The external image URL.
 * @returns {Promise<string|null>} - The local path to the saved image.
 */
const downloadAndSaveImage = async (url) => {
    if (!url) return null;
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(response.data);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileName = `profile-${uniqueSuffix}.webp`;
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const uploadDir = path.join(__dirname, '..', 'uploads', year, month, day);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);

        // Convert buffer to WebP and ensure it's under 100KB
        let quality = 80;
        let outputBuffer = await sharp(buffer)
            .webp({ quality })
            .toBuffer();

        // Loop to reduce quality if size is > 100KB
        while (outputBuffer.length > 100 * 1024 && quality > 10) {
            quality -= 5;
            outputBuffer = await sharp(buffer)
                .webp({ quality })
                .toBuffer();
        }

        // If still > 100KB, resize the image
        if (outputBuffer.length > 100 * 1024) {
            outputBuffer = await sharp(buffer)
                .resize({ width: 1200, withoutEnlargement: true })
                .webp({ quality: 60 })
                .toBuffer();
        }

        // Final check - if still too large, more aggressive reduction
        if (outputBuffer.length > 100 * 1024) {
            outputBuffer = await sharp(buffer)
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 40 })
                .toBuffer();
        }

        await fs.promises.writeFile(filePath, outputBuffer);

        return `uploads/${year}/${month}/${day}/${fileName}`;
    } catch (err) {
        console.error('Error downloading/saving image:', err.message);
        return null;
    }
};

/**
 * Saves a base64 image to the uploads folder as WebP.
 * @param {string} base64String - The base64 data.
 * @param {string} prefix - Prefix for the filename.
 * @returns {Promise<string|null>} - The path to the saved image.
 */
const saveAdPositionImage = async (base64String, prefix = 'ad-pos') => {
    if (!base64String || typeof base64String !== 'string' || !base64String.startsWith('data:')) {
        return base64String; // Return as is if already a path or empty
    }

    try {
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileName = `${prefix}-${uniqueSuffix}.webp`;
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const uploadDir = path.join(__dirname, '..', 'uploads', year, month, day);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);

        await sharp(buffer)
            .webp({ quality: 80 })
            .toFile(filePath);

        return `uploads/${year}/${month}/${day}/${fileName}`;
    } catch (err) {
        console.error('Error saving ad position image:', err.message);
        return null;
    }
};

module.exports = { fileToBase64, processImageString, downloadAndSaveImage, saveAdPositionImage };
