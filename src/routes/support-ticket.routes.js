const express = require('express');
const controller = require('../controllers/support-ticket.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const customer = express.Router();
customer.post('/support-tickets', authMiddleware, controller.create);
customer.get('/support-tickets', authMiddleware, controller.listMine);
customer.get('/support-tickets/:id', authMiddleware, controller.getMine);
customer.post('/support-tickets/:id/messages', authMiddleware, controller.addCustomerMessage);
const admin = express.Router();
admin.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
admin.get('/support-tickets', controller.list);
admin.get('/support-tickets/:id', controller.get);
admin.patch('/support-tickets/:id', controller.updateStatus);
admin.post('/support-tickets/:id/messages', controller.addAdminMessage);
module.exports = { customer, admin };
