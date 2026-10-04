const express = require('express');
const controller = require('../controllers/user.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');
const { profileUpload, uploadErrorMiddleware } = require('../middlewares/upload.middleware');

const router = express.Router();
router.use(authMiddleware);
router.get('/me', controller.getMe);
router.get('/me/companies', controller.getMyCompanies);
router.put('/me', controller.updateMe);
router.put('/me/password', controller.updatePassword);
router.delete('/me', platformRoleMiddleware('CUSTOMER'), controller.deactivateMe);
router.post('/me/photo', profileUpload.single('image'), uploadErrorMiddleware, controller.uploadPhoto);
router.delete('/me/photo', controller.deletePhoto);
module.exports = router;
