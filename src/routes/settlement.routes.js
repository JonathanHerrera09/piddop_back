const express = require('express');
const controller = require('../controllers/settlement.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const admin = express.Router();
admin.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
admin.get('/settlements', controller.listAdmin);
admin.get('/settlements/overview', controller.overviewAdmin);
admin.get('/settlements/eligible-orders', controller.eligibleOrders);
admin.post('/settlements/invoices', controller.createSelected);
admin.post('/settlements/preview', controller.preview);
admin.post('/settlements', controller.create);
admin.get('/settlements/:id', controller.getAdmin);
admin.get('/settlements/:id/pdf', controller.pdfAdmin);
admin.post('/settlements/:id/send', controller.sendToCompany);
admin.post('/settlements/:id/paid', controller.markPaid);

// Liquidations contain platform payment references and are intentionally
// available only to SUPER_ADMIN. No company-side routes are exposed.
module.exports = { admin, company: express.Router() };
