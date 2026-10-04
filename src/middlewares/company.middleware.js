const AppError = require('../utils/app-error');
const { CompanyUser, Company, Role, Permission } = require('../models');

async function companyAccessMiddleware(req, res, next) {
  try {
    const companyId = Number(req.header('x-company-id'));
    if (!Number.isInteger(companyId) || companyId < 1) throw new AppError('X-Company-Id header is required', 422);
    const companyUser = await CompanyUser.findOne({
      where: { company_id: companyId, user_id: req.auth.user.id },
      include: [
        { model: Company, as: 'company' },
        { model: Role, as: 'companyRoles', include: [{ model: Permission, as: 'permissions' }] }
      ]
    });
    if (!companyUser || companyUser.company.status !== 'active') throw new AppError('You do not have access to this company', 403);
    req.companyAccess = { company: companyUser.company, companyUser };
    return next();
  } catch (error) { return next(error); }
}

function companyPermissionMiddleware(code, action) {
  return (req, res, next) => {
    const field = `${action}_permission`;
    const permitted = req.companyAccess.companyUser.companyRoles.some((role) => role.permissions.some((permission) => permission.code === code && permission.RolePermission[field]));
    if (!permitted) return next(new AppError('You do not have permission to perform this action', 403));
    return next();
  };
}

function companyRoleMiddleware(...allowedRoles) {
  const normalizedRoles = new Set(allowedRoles.map((role) => String(role).toLowerCase()));
  return (req, res, next) => {
    const primaryRole = req.companyAccess?.companyUser?.role;
    if (!primaryRole || !normalizedRoles.has(String(primaryRole).toLowerCase())) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    return next();
  };
}

module.exports = { companyAccessMiddleware, companyPermissionMiddleware, companyRoleMiddleware };
