const express = require('express');
const controller = require('../controllers/email-template.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
router.get('/', controller.list);
router.put('/:key', controller.update);
router.post('/:key/test', controller.testSend);

module.exports = router;
