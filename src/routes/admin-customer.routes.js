const express = require('express');
const controller = require('../controllers/customer-admin.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
router.get('/customers', controller.listAdminCustomers);
router.get('/customers/:id', controller.getAdminCustomer);
router.post('/customers/:id/activate', controller.activateAdminCustomer);

module.exports = router;
