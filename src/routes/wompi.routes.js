const express = require('express');
const controller = require('../controllers/wompi.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const publicRouter = express.Router();
publicRouter.post('/events', controller.events);
publicRouter.get('/redirect', controller.redirect);

const adminRouter = express.Router();
adminRouter.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
adminRouter.get('/', controller.getSettings);
adminRouter.put('/', controller.updateSettings);

module.exports = { adminRouter, publicRouter };
