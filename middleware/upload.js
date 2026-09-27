const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Ensure base uploads directory exists
const uploadBaseDir = 'uploads';
if (!fs.existsSync(uploadBaseDir)) {
    fs.mkdirSync(uploadBaseDir);
}

// Memory Storage so we can process buffer with Sharp
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit (to allow for uncompressed uploads)
        files: 10 // Increased to match frontend limit
    }
});

/**
 * Middleware to process uploaded images:
 * - Efficiently resizes and converts to WebP in a single pass
 * - Writes directly to disk to minimize RAM usage
 */
const processImages = async (req, res, next) => {
    if (!req.file && !req.files) return next();

    const processFile = async (file) => {
        try {
            const now = new Date();
            const year = String(now.getFullYear());
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const datedUploadDir = path.join(uploadBaseDir, year, month, day);

            await fs.promises.mkdir(datedUploadDir, { recursive: true });

            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const filename = (file.fieldname || 'file') + '-' + uniqueSuffix + '.webp';
            const filepath = path.join(datedUploadDir, filename);

            // Single-pass processing: Resize if larger than 1200px and convert to WebP
            // We use .toFile() which is more memory-efficient than .toBuffer()
            await sharp(file.buffer)
                .resize({
                    width: 1200,
                    height: 1200,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({ quality: 80 })
                .toFile(filepath);

            // Get the final file stats to update the file object
            const stats = await fs.promises.stat(filepath);

            // Update file object properties for the controller
            file.filename = filename;
            file.path = `uploads/${year}/${month}/${day}/${filename}`;
            file.destination = datedUploadDir;
            file.mimetype = 'image/webp';
            file.size = stats.size;

            // Free the memory buffer immediately
            delete file.buffer;
        } catch (error) {
            console.error(`Error processing image ${file.originalname}:`, error);
            throw error;
        }
    };

    try {
        const promises = [];

        if (req.file) {
            promises.push(processFile(req.file));
        }

        if (req.files) {
            const filesArray = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
            filesArray.forEach(file => promises.push(processFile(file)));
        }

        await Promise.all(promises);
        next();
    } catch (err) {
        console.error('Image Processing Middleware Error:', err);
        next(err);
    }
};

const uploadWrapper = {
    single: (field) => [upload.single(field), processImages],
    array: (field, maxCount) => [upload.array(field, maxCount), processImages],
    fields: (fields) => [upload.fields(fields), processImages],
    any: () => [upload.any(), processImages]
};

module.exports = uploadWrapper;
