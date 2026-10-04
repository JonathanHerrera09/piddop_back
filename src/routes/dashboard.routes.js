const express = require('express'); const controller = require('../controllers/dashboard.controller'); const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware'); const { companyAccessMiddleware, companyPermissionMiddleware } = require('../middlewares/company.middleware');
const companyRouter = express.Router(); companyRouter.use(authMiddleware, companyAccessMiddleware); companyRouter.get('/dashboard', companyPermissionMiddleware('dashboard', 'view'), controller.companyDashboard);
const adminRouter = express.Router(); adminRouter.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN')); adminRouter.get('/dashboard', controller.adminDashboard);
module.exports = { companyRouter, adminRouter };
