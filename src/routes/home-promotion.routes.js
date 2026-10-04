const express = require('express');
const controller = require('../controllers/home-promotion.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');
const { popupUpload, uploadErrorMiddleware } = require('../middlewares/upload.middleware');

const publicRouter = express.Router();
publicRouter.get('/', controller.publicList);

const adminRouter = express.Router();
adminRouter.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
adminRouter.get('/', controller.list);
adminRouter.post('/', popupUpload.single('image'), uploadErrorMiddleware, controller.create);
adminRouter.put('/:id', controller.update);
adminRouter.post('/:id/image', popupUpload.single('image'), uploadErrorMiddleware, controller.replaceImage);
adminRouter.delete('/:id', controller.remove);

module.exports = { publicRouter, adminRouter };
