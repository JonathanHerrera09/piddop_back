const express = require('express');
const controller = require('../controllers/admin-push-notification.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
router.post('/notifications/push/preview', controller.previewCampaign);
router.post('/notifications/push', controller.sendCampaign);

module.exports = router;
