const express = require('express');
const controller = require('../controllers/delivery.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
router.get('/delivery-drivers', controller.listAdminDrivers);
router.post('/delivery-drivers', controller.createDriver);
router.get('/deliveries', controller.listAdminDeliveries);
router.get('/deliveries/:id', controller.getAdminDelivery);
router.put('/deliveries/:id/driver-payment', controller.updateDriverPayment);
module.exports = router;
