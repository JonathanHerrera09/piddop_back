const multer = require('multer');
const AppError = require('../utils/app-error');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const imageExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function hasExpectedImageSignature(file) {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer)) return false;
  if (file.mimetype === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (file.mimetype === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function imageUpload(limits = {}) {
  return multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10, fieldSize: 16 * 1024, parts: 12, ...limits },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError('Only JPG, PNG, and WEBP images are allowed', 422));
    return callback(null, true);
  }
  });
}

const profileUpload = imageUpload();

const productUpload = imageUpload({ files: 5, parts: 16 });

const popupUpload = imageUpload();

const companyLogoUpload = imageUpload();

const categoryAssetUpload = imageUpload();

function uploadErrorMiddleware(error, req, res, next) {
  if (error instanceof multer.MulterError) return next(new AppError('Invalid image upload', 422));
  if (!error) {
    const files = req.files || (req.file ? [req.file] : []);
    if (files.some((file) => !hasExpectedImageSignature(file))) {
      return next(new AppError('Uploaded content does not match the declared image type', 422));
    }
  }
  return next(error);
}

module.exports = { profileUpload, productUpload, popupUpload, companyLogoUpload, categoryAssetUpload, uploadErrorMiddleware, hasExpectedImageSignature, imageExtensions };
