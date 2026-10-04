const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { sequelize, AuthRefreshToken, Company, CompanyUser, Permission, Role, User } = require('../models');
const { publicUser } = require('../services/auth.service');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

function normalizePhone(value) {
  const phone = typeof value === 'string' ? value.trim().replace(/[\s().-]/g, '') : '';
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
}

const getMe = asyncHandler(async (req, res) => success(res, { message: 'User retrieved successfully', data: publicUser(req.auth.user) }));

const deactivateMe = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    await req.auth.user.update({ status: 'inactive' }, { transaction });
    await AuthRefreshToken.update({ revoked_at: new Date() }, { where: { user_id: req.auth.user.id, revoked_at: null }, transaction });
  });
  return success(res, { message: 'Cuenta desactivada correctamente', data: {} });
});

const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'last_name', 'phone'];
  const changes = Object.fromEntries(Object.entries(req.body).filter(([key, value]) => allowed.includes(key) && typeof value === 'string' && value.trim()));
  if (!Object.keys(changes).length) throw new AppError('At least one valid profile field is required', 422);
  Object.keys(changes).forEach((key) => { changes[key] = changes[key].trim(); });
  const errors = [];
  if (changes.name && changes.name.length > 100) errors.push({ field: 'name', message: 'El nombre es demasiado largo.' });
  if (changes.last_name && changes.last_name.length > 100) errors.push({ field: 'last_name', message: 'El apellido es demasiado largo.' });
  if (changes.phone) {
    const phone = normalizePhone(changes.phone);
    if (!phone) errors.push({ field: 'phone', message: 'Ingresa un telefono valido (7 a 15 digitos).' });
    else changes.phone = phone;
  }
  if (errors.length) throw new AppError('Revisa los datos del perfil.', 422, errors);
  try {
    await User.update(changes, { where: { id: req.auth.user.id } });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === 'ER_DUP_ENTRY') {
      throw new AppError('Ese telefono ya esta registrado.', 409);
    }
    throw error;
  }
  const user = await User.findByPk(req.auth.user.id, { include: [{ association: 'platformRole' }] });
  return success(res, { message: 'User updated successfully', data: publicUser(user) });
});

const updatePassword = asyncHandler(async (req, res) => {
  if (req.auth.user.google_sub) throw new AppError('Esta cuenta usa acceso con Google. Gestiona la contraseña desde ese proveedor.', 422);
  const { current_password, password, password_confirmation } = req.body || {};
  if (!current_password || !password || password.length < 8 || password !== password_confirmation) throw new AppError('La nueva contraseña debe tener al menos 8 caracteres y coincidir.', 422);
  if (!await bcrypt.compare(current_password, req.auth.user.password)) throw new AppError('La contraseña actual no es correcta.', 422);
  await req.auth.user.update({ password: await bcrypt.hash(password, 12) });
  return success(res, { message: 'Contraseña actualizada correctamente', data: {} });
});

const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('An image file is required', 422);
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.file.mimetype];
  const directory = path.join(__dirname, '..', '..', 'uploads', 'profiles');
  await fs.mkdir(directory, { recursive: true });
  const filename = `${req.auth.user.id}-${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(directory, filename), req.file.buffer);
  const profileImage = `/uploads/profiles/${filename}`;
  await User.update({ profile_image: profileImage }, { where: { id: req.auth.user.id } });
  const user = await User.findByPk(req.auth.user.id, { include: [{ association: 'platformRole' }] });
  return success(res, { message: 'Profile photo uploaded successfully', data: publicUser(user) });
});

const deletePhoto = asyncHandler(async (req, res) => {
  const image = req.auth.user.profile_image;
  if (image && image.startsWith('/uploads/profiles/')) {
    const filename = path.basename(image);
    await fs.unlink(path.join(__dirname, '..', '..', 'uploads', 'profiles', filename)).catch(() => {});
  }
  await User.update({ profile_image: null }, { where: { id: req.auth.user.id } });
  return success(res, { message: 'Profile photo deleted successfully', data: {} });
});

const getMyCompanies = asyncHandler(async (req, res) => {
  if (req.auth.user.platformRole?.name !== 'COMPANY') {
    return success(res, { message: 'User companies retrieved successfully', data: { companies: [] } });
  }

  const memberships = await CompanyUser.findAll({
    where: { user_id: req.auth.user.id },
    include: [
      { model: Company, as: 'company', attributes: ['id', 'name', 'type', 'logo', 'status'] },
      {
        model: Role,
        as: 'companyRoles',
        attributes: ['id', 'name', 'scope'],
        include: [{
          model: Permission,
          as: 'permissions',
          attributes: ['id', 'code', 'name', 'module'],
          through: {
            attributes: [
              'create_permission',
              'update_permission',
              'delete_permission',
              'view_permission',
              'execute_permission'
            ]
          }
        }]
      }
    ],
    order: [['id', 'ASC']]
  });

  return success(res, {
    message: 'User companies retrieved successfully',
    data: {
      companies: memberships.map((membership) => ({
        company_user_id: membership.id,
        primary_role: membership.role,
        company: membership.company,
        roles: membership.companyRoles.map((role) => {
          const roleData = role.toJSON();
          return {
            ...roleData,
            permissions: (roleData.permissions || []).map((permission) => {
              const { RolePermission, ...permissionData } = permission;
              return { ...permissionData, ...(RolePermission || {}) };
            })
          };
        })
      }))
    }
  });
});

module.exports = { getMe, getMyCompanies, updateMe, updatePassword, deactivateMe, uploadPhoto, deletePhoto };
