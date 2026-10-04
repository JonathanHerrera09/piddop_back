const express = require('express');
const controller = require('../controllers/delivery.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authMiddleware, platformRoleMiddleware('DELIVERY'));
router.put('/availability', controller.setAvailability);
router.get('/orders/available', controller.availableOrders);
router.post('/orders/:id/accept', controller.accept);
router.get('/current-order', controller.current);
router.post('/orders/:id/on-the-way', controller.onTheWay);
router.post('/orders/:id/complete', controller.complete);
router.post('/location', controller.location);
router.get('/reports', controller.reports);
module.exports = router;
