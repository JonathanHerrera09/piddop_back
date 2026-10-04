const { sequelize, Role, Permission, RolePermission, CompanyUserRole } = require('../models');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { Op } = require('sequelize');
const { paginate } = require('../utils/pagination');

const listRoles = asyncHandler(async (req, res) => {
  const page = await paginate(Role, { where: req.query.search ? { [Op.or]: [{ name: { [Op.like]: `%${req.query.search}%` } }, { scope: { [Op.like]: `%${req.query.search}%` } }] } : {}, include: [{ model: Permission, as: 'permissions', through: { attributes: ['create_permission', 'update_permission', 'delete_permission', 'view_permission', 'execute_permission'] } }], allowedSort: { id: 'id', name: 'name', scope: 'scope' }, order: [['scope', 'ASC'], ['name', 'ASC']] }, req.query);
  return success(res, { message: 'Roles retrieved successfully', data: { roles: page.items, pagination: page.pagination } });
});

const listPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.findAll({ where: { status: 'active' }, order: [['module', 'ASC'], ['code', 'ASC']] });
  return success(res, { message: 'Permissions retrieved successfully', data: { permissions } });
});

const createRole = asyncHandler(async (req, res) => {
  const { name, description = null, scope, permissions = [] } = req.body;
  if (!name || !['platform', 'company'].includes(scope) || !Array.isArray(permissions)) throw new AppError('Validation failed', 422);
  const normalizedName = String(name).trim().toUpperCase();
  if (await Role.findOne({ where: { name: normalizedName, scope } })) throw new AppError('Role name is already in use', 409);

  const role = await sequelize.transaction(async (transaction) => {
    const created = await Role.create({ name: normalizedName, description, scope }, { transaction });
    for (const permission of permissions) {
      const permissionId = Number(permission.permission_id);
      if (!Number.isInteger(permissionId) || !(await Permission.findByPk(permissionId, { transaction }))) throw new AppError('One or more permissions do not exist', 422);
      await RolePermission.create({
        role_id: created.id, permission_id: permissionId,
        create_permission: Boolean(permission.create_permission), update_permission: Boolean(permission.update_permission),
        delete_permission: Boolean(permission.delete_permission), view_permission: permission.view_permission !== false,
        execute_permission: Boolean(permission.execute_permission)
      }, { transaction });
    }
    return created;
  });

  return success(res, { statusCode: 201, message: 'Role created successfully', data: { role } });
});

const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) throw new AppError('Role not found', 404);
  if (['SUPER_ADMIN', 'CUSTOMER', 'DELIVERY', 'COMPANY', 'OWNER', 'MANAGER', 'COOK', 'PROFESSIONAL', 'CATALOG_MANAGER', 'SUPPORT'].includes(role.name)) throw new AppError('System roles cannot be edited', 409);
  if (req.body.name) role.name = String(req.body.name).trim().toUpperCase();
  if (req.body.description !== undefined) role.description = req.body.description;
  if (req.body.scope && !['platform', 'company'].includes(req.body.scope)) throw new AppError('Invalid role scope', 422);
  await sequelize.transaction(async (transaction) => {
    await role.save({ transaction });
    if (Array.isArray(req.body.permissions)) {
      await RolePermission.destroy({ where: { role_id: role.id }, transaction });
      for (const permission of req.body.permissions) {
        const permissionId = Number(permission.permission_id);
        if (!Number.isInteger(permissionId) || !(await Permission.findByPk(permissionId, { transaction }))) throw new AppError('One or more permissions do not exist', 422);
        await RolePermission.create({ role_id: role.id, permission_id: permissionId, create_permission: Boolean(permission.create_permission), update_permission: Boolean(permission.update_permission), delete_permission: Boolean(permission.delete_permission), view_permission: permission.view_permission !== false, execute_permission: Boolean(permission.execute_permission) }, { transaction });
      }
    }
  });
  return success(res, { message: 'Role updated successfully', data: { role } });
});

const removeRole = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) throw new AppError('Role not found', 404);
  if (['SUPER_ADMIN', 'CUSTOMER', 'DELIVERY', 'COMPANY', 'OWNER', 'MANAGER', 'COOK', 'PROFESSIONAL', 'CATALOG_MANAGER', 'SUPPORT'].includes(role.name)) throw new AppError('System roles cannot be deleted', 409);
  if (await Role.count({ where: { id: role.id }, include: [{ association: 'users', required: true }] }) || await CompanyUserRole.count({ where: { role_id: role.id } })) throw new AppError('Role is in use and cannot be deleted', 409);
  await role.destroy();
  return res.status(204).send();
});

module.exports = { listRoles, listPermissions, createRole, updateRole, removeRole };
