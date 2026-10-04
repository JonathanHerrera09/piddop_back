const express = require('express');
const controller = require('../controllers/push-token.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authMiddleware);
router.post('/', controller.register);
router.delete('/', controller.revoke);

module.exports = router;
