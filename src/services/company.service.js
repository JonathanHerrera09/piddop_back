const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const { sequelize, Company, CompanyUser, CompanyUserRole, Role, User } = require('../models');

async function createTeamMember(companyId, input) {
  if (!Array.isArray(input.role_ids) || !input.role_ids.length) throw new AppError('At least one company role is required', 422);
  const roles = await Role.findAll({ where: { id: input.role_ids, scope: 'company' } });
  if (roles.length !== new Set(input.role_ids).size) throw new AppError('One or more company roles do not exist', 422);
  const companyRole = await Role.findOne({ where: { name: 'COMPANY', scope: 'platform' } });
  if (!companyRole) throw new AppError('Company platform role is not configured', 500);

  return sequelize.transaction(async (transaction) => {
    if (await User.findOne({ where: { [Op.or]: [{ email: input.email.toLowerCase() }, { phone: input.phone }] }, transaction })) throw new AppError('Email or phone is already registered', 409);
    const user = await User.create({
      role_id: companyRole.id, name: input.name.trim(), last_name: input.last_name.trim(), email: input.email.toLowerCase(),
      phone: input.phone.trim(), password: await bcrypt.hash(input.password, 12), status: 'active'
    }, { transaction });
    const primaryRole = roles.some((role) => role.name === 'OWNER') ? 'owner' : roles.some((role) => role.name === 'MANAGER') ? 'manager' : 'staff';
    const companyUser = await CompanyUser.create({ company_id: companyId, user_id: user.id, role: primaryRole }, { transaction });
    await CompanyUserRole.bulkCreate(roles.map((role) => ({ company_user_id: companyUser.id, role_id: role.id })), { transaction });
    return { company_user_id: companyUser.id, user: { id: user.id, name: user.name, last_name: user.last_name, email: user.email }, roles: roles.map((role) => ({ id: role.id, name: role.name })) };
  });
}

async function replaceTeamMemberRoles(companyUser, roleIds) {
  if (!Array.isArray(roleIds) || !roleIds.length) throw new AppError('At least one company role is required', 422);
  const roles = await Role.findAll({ where: { id: roleIds, scope: 'company' } });
  if (roles.length !== new Set(roleIds).size) throw new AppError('One or more company roles do not exist', 422);
  await sequelize.transaction(async (transaction) => {
    await CompanyUserRole.destroy({ where: { company_user_id: companyUser.id }, transaction });
    await CompanyUserRole.bulkCreate(roles.map((role) => ({ company_user_id: companyUser.id, role_id: role.id })), { transaction });
    await companyUser.update({ role: roles.some((role) => role.name === 'OWNER') ? 'owner' : roles.some((role) => role.name === 'MANAGER') ? 'manager' : 'staff' }, { transaction });
  });
  return roles;
}

async function updateTeamMember(companyUser, input) {
  const changes = {};
  let roles;
  if (Object.hasOwn(input, 'role_ids')) {
    if (!Array.isArray(input.role_ids) || !input.role_ids.length) throw new AppError('At least one company role is required', 422);
    roles = await Role.findAll({ where: { id: input.role_ids, scope: 'company' } });
    if (roles.length !== new Set(input.role_ids).size) throw new AppError('One or more company roles do not exist', 422);
  }
  for (const field of ['name', 'last_name', 'email', 'phone']) {
    if (!Object.hasOwn(input, field)) continue;
    if (typeof input[field] !== 'string' || !input[field].trim()) throw new AppError(`${field} is required`, 422);
    changes[field] = input[field].trim();
  }
  if (changes.name && changes.name.length > 100) throw new AppError('Name is too long', 422);
  if (changes.last_name && changes.last_name.length > 100) throw new AppError('Last name is too long', 422);
  if (changes.email) {
    changes.email = changes.email.toLowerCase();
    if (changes.email.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) throw new AppError('Enter a valid email', 422);
  }
  if (changes.phone) {
    changes.phone = changes.phone.replace(/[\s().-]/g, '');
    if (!/^\+?\d{7,15}$/.test(changes.phone)) throw new AppError('Enter a valid phone number', 422);
  }
  if (Object.hasOwn(input, 'status')) {
    if (!['active', 'inactive', 'suspended'].includes(input.status)) throw new AppError('Invalid user status', 422);
    changes.status = input.status;
  }
  if (Object.hasOwn(input, 'password') && input.password !== '') {
    if (typeof input.password !== 'string' || input.password.length < 8) throw new AppError('Password must have at least 8 characters', 422);
    changes.password = await bcrypt.hash(input.password, 12);
  }
  if (!Object.keys(changes).length && !roles) throw new AppError('At least one valid user field is required', 422);
  try {
    await sequelize.transaction(async (transaction) => {
      if (Object.keys(changes).length) await companyUser.user.update(changes, { transaction });
      if (roles) {
        await CompanyUserRole.destroy({ where: { company_user_id: companyUser.id }, transaction });
        await CompanyUserRole.bulkCreate(roles.map((role) => ({ company_user_id: companyUser.id, role_id: role.id })), { transaction });
        await companyUser.update({ role: roles.some((role) => role.name === 'OWNER') ? 'owner' : roles.some((role) => role.name === 'MANAGER') ? 'manager' : 'staff' }, { transaction });
      }
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === 'ER_DUP_ENTRY') throw new AppError('Email or phone is already registered', 409);
    throw error;
  }
  const { id, name, last_name, email, phone, status } = companyUser.user;
  return { id, name, last_name, email, phone, status };
}

async function removeTeamMember(companyUser) {
  return sequelize.transaction(async (transaction) => {
    await CompanyUserRole.destroy({ where: { company_user_id: companyUser.id }, transaction });
    await companyUser.destroy({ transaction });
  });
}

module.exports = { createTeamMember, replaceTeamMemberRoles, updateTeamMember, removeTeamMember };
