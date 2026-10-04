const express = require('express');
const controller = require('../controllers/platform-setting.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/customer-links', controller.getCustomerLinks);
router.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
router.get('/coverage', controller.getCoverage);
router.put('/coverage', controller.updateCoverage);
router.put('/customer-links', controller.updateCustomerLinks);

module.exports = router;
