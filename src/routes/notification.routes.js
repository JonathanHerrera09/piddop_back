const express = require('express'); const controller = require('../controllers/notification.controller'); const { authMiddleware } = require('../middlewares/auth.middleware');
const router = express.Router(); router.use(authMiddleware); router.get('/', controller.list); router.post('/:id/read', controller.read); router.post('/read-all', controller.readAll); module.exports = router;
