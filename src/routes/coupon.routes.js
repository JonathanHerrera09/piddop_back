const express = require('express'); const controller = require('../controllers/coupon.controller'); const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');
const adminRouter = express.Router(); adminRouter.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN')); adminRouter.get('/', controller.list); adminRouter.post('/', controller.create); adminRouter.get('/:id', controller.get); adminRouter.put('/:id', controller.update); adminRouter.delete('/:id', controller.remove);
module.exports = adminRouter;
