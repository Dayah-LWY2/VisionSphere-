const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary with your credentials from .env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// A helper to check for allowed file types
const FILE_TYPES = /jpeg|jpg|png|gif|mp4|mov|webm|avi/;
function checkFileType(req, file, cb) { // Corrected function signature
    if (!file || !file.originalname) {
        return cb(new Error('File is missing original name!'));
    }
    const extname = FILE_TYPES.test(path.extname(file.originalname).toLowerCase());
    const mimetype = FILE_TYPES.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    cb(new Error('Only images, gifs, or videos are allowed!'));
}

// A helper function to create Cloudinary storage for a specific folder
const getCloudinaryStorage = (folderName) => new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        let resourceType = 'image';
        const fileExtension = file.originalname ? path.extname(file.originalname).toLowerCase() : '';
        
        if (['.mp4', '.mov', '.webm', '.avi'].includes(fileExtension)) {
            resourceType = 'video';
        }

        const publicId = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        
        return {
            folder: folderName,
            format: file.originalname.split('.').pop(),
            resource_type: resourceType,
            public_id: publicId
        };
    }
});

// Export a configured multer instance for each upload type
module.exports = {
    // For post creation which allows multiple files
    post: multer({
        storage: getCloudinaryStorage('uploads/posts'),
        limits: { fileSize: 30 * 1024 * 1024 },
        fileFilter: checkFileType
    }),
    // For comment media, community icons, and profile images (single files)
    comment: multer({
        storage: getCloudinaryStorage('uploads/comments'),
        limits: { fileSize: 30 * 1024 * 1024 },
        fileFilter: checkFileType
    }),
    communityIcon: multer({
        storage: getCloudinaryStorage('uploads/communities'),
        limits: { fileSize: 30 * 1024 * 1024 },
        fileFilter: checkFileType
    }),
    avatar: multer({
        storage: getCloudinaryStorage('uploads/profile/avatars'),
        limits: { fileSize: 30 * 1024 * 1024 },
        fileFilter: checkFileType
    }),
    banner: multer({
        storage: getCloudinaryStorage('uploads/profile/banners'),
        limits: { fileSize: 30 * 1024 * 1024 },
        fileFilter: checkFileType
    })
};