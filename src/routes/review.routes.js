const express = require('express');
const controller = require('../controllers/review.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');
const { companyAccessMiddleware } = require('../middlewares/company.middleware');
// Do not use router.use(auth...) here: these routers are mounted alongside
// other routes and a broad middleware would intercept unrelated modules.
const customer = express.Router(); customer.get('/reviews/summary', authMiddleware, platformRoleMiddleware('CUSTOMER'), controller.mySummary); customer.post('/orders/:orderId/review', authMiddleware, platformRoleMiddleware('CUSTOMER'), controller.create);
const company = express.Router(); company.get('/reviews', authMiddleware, companyAccessMiddleware, controller.listCompany);
const admin = express.Router(); admin.get('/reviews', authMiddleware, platformRoleMiddleware('SUPER_ADMIN'), controller.listAdmin);
module.exports = { customer, company, admin };
