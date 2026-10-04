const express = require('express'); const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware'); const { validateCouponCode } = require('../controllers/cart.controller');
const router = express.Router(); router.use(authMiddleware, platformRoleMiddleware('CUSTOMER')); router.post('/validate', validateCouponCode); module.exports = router;
