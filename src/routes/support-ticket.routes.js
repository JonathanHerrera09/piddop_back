const express = require('express');
const controller = require('../controllers/support-ticket.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const customer = express.Router();
customer.post('/support-tickets', authMiddleware, controller.create);
const admin = express.Router();
admin.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
admin.get('/support-tickets', controller.list);
admin.patch('/support-tickets/:id', controller.updateStatus);
module.exports = { customer, admin };
