const express = require('express');
const controller = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { authRateLimiter } = require('../middlewares/rate-limit.middleware');

const router = express.Router();
router.post('/register', authRateLimiter, controller.register);
router.post('/register/verify', authRateLimiter, controller.verifyRegistration);
router.post('/login', authRateLimiter, controller.login);
router.post('/google/mobile', authRateLimiter, controller.googleMobileLogin);
router.post('/logout', controller.logout);
router.post('/refresh', authRateLimiter, controller.refresh);
router.post('/forgot-password', authRateLimiter, controller.forgotPassword);
router.post('/reset-password', authRateLimiter, controller.resetPassword);
router.get('/me', authMiddleware, controller.me);
module.exports = router;
