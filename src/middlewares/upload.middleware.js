const multer = require('multer');
const AppError = require('../utils/app-error');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError('Only JPG, PNG, and WEBP images are allowed', 422));
    return callback(null, true);
  }
});

const productUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError('Only JPG, PNG, and WEBP images are allowed', 422));
    return callback(null, true);
  }
});

const popupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError('Only JPG, PNG, and WEBP images are allowed', 422));
    return callback(null, true);
  }
});

const companyLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError('Only JPG, PNG, and WEBP images are allowed', 422));
    return callback(null, true);
  }
});

const categoryAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError('Only JPG, PNG, and WEBP files are allowed', 422));
    return callback(null, true);
  }
});

function uploadErrorMiddleware(error, req, res, next) {
  if (error instanceof multer.MulterError) return next(new AppError('Invalid image upload', 422));
  return next(error);
}

module.exports = { profileUpload, productUpload, popupUpload, companyLogoUpload, categoryAssetUpload, uploadErrorMiddleware };
