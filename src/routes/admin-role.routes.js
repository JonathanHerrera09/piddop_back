const express = require('express');
const controller = require('../controllers/role.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authMiddleware, platformRoleMiddleware('SUPER_ADMIN'));
router.get('/roles', controller.listRoles);
router.post('/roles', controller.createRole);
router.put('/roles/:id', controller.updateRole);
router.delete('/roles/:id', controller.removeRole);
router.get('/permissions', controller.listPermissions);
module.exports = router;
