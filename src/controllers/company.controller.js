const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { Company, CompanyUser, Role, User } = require('../models');
const companyService = require('../services/company.service');
const walletService = require('../services/company-wallet.service');
const { normalizeCoveragePolygon } = require('../services/company-coverage.service');
const { assertPointWithinGlobalCoverage } = require('../services/platform-coverage.service');
const { Op } = require('sequelize');
const { paginate } = require('../utils/pagination');
const { AVAILABILITY_MODES, normalizeBusinessHours } = require('../services/company-availability.service');

const allowedTypes = new Set(['food', 'products', 'services']);
const companyFields = ['name', 'description', 'phone', 'email', 'logo', 'address', 'latitude', 'longitude', 'coverage_enabled', 'coverage_polygon', 'commission_percentage', 'status', 'rating', 'availability_mode', 'business_hours', 'timezone'];
const editableCreateFields = ['description', 'phone', 'email', 'address', 'latitude', 'longitude', 'coverage_enabled', 'coverage_polygon', 'commission_percentage', 'status', 'rating'];

async function validateLocationPayload(body, fallback = {}) {
  const hasLatitude = Object.prototype.hasOwnProperty.call(body, 'latitude');
  const hasLongitude = Object.prototype.hasOwnProperty.call(body, 'longitude');
  if (!hasLatitude && !hasLongitude) return;

  const latitude = hasLatitude ? body.latitude : fallback.latitude;
  const longitude = hasLongitude ? body.longitude : fallback.longitude;
  if (latitude == null && longitude == null) return;
  if (latitude == null || longitude == null) {
    throw new AppError('La ubicacion de la empresa requiere latitud y longitud.', 422);
  }

  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  if (!Number.isFinite(numericLatitude) || !Number.isFinite(numericLongitude) ||
      numericLatitude < -90 || numericLatitude > 90 || numericLongitude < -180 || numericLongitude > 180) {
    throw new AppError('La ubicacion de la empresa no tiene coordenadas validas.', 422);
  }

  await assertPointWithinGlobalCoverage({ latitude: numericLatitude, longitude: numericLongitude });
}

function mapCoveragePayload(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'coverage_enabled') && !Object.prototype.hasOwnProperty.call(body, 'coverage_polygon')) {
    return {};
  }

  const coverageEnabled = Boolean(body.coverage_enabled);

  return {
    coverage_enabled: coverageEnabled,
    coverage_polygon: coverageEnabled ? normalizeCoveragePolygon(body.coverage_polygon) : null
  };
}

async function saveCompanyLogo(file, companyId) {
  if (!file) throw new AppError('A company logo image is required', 422);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype];
  const directory = path.join(__dirname, '..', '..', 'uploads', 'companies');
  await fs.mkdir(directory, { recursive: true });
  const filename = `${companyId}-${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return `/uploads/companies/${filename}`;
}

async function deleteCompanyLogo(logoUrl) {
  if (logoUrl?.startsWith('/uploads/companies/')) {
    await fs.unlink(path.join(__dirname, '..', '..', logoUrl)).catch(() => {});
  }
}

const listCompanies = asyncHandler(async (req, res) => { const where = {}; if (req.query.status) where.status = req.query.status; if (req.query.type) where.type = req.query.type; if (req.query.search) where[Op.or] = [{ name: { [Op.like]: `%${req.query.search}%` } }, { email: { [Op.like]: `%${req.query.search}%` } }]; const page = await paginate(Company, { where, allowedSort: { id: 'id', name: 'name', status: 'status', type: 'type', created_at: 'created_at' } }, req.query); return success(res, { message: 'Companies retrieved successfully', data: { companies: page.items, pagination: page.pagination } }); });
const getCompany = asyncHandler(async (req, res) => { const company = await Company.findByPk(req.params.id); if (!company) throw new AppError('Company not found', 404); return success(res, { message: 'Company retrieved successfully', data: { company } }); });
const createCompany = asyncHandler(async (req, res) => {
  if (!req.body.name || !allowedTypes.has(req.body.type)) throw new AppError('A name and valid company type are required', 422);
  await validateLocationPayload(req.body);
  const payload = Object.fromEntries(Object.entries(req.body).filter(([key]) => editableCreateFields.includes(key)));
  const company = await Company.create({
    name: req.body.name.trim(),
    type: req.body.type,
    description: req.body.description || null,
    phone: req.body.phone || null,
    email: req.body.email || null,
    address: req.body.address || null,
    commission_percentage: req.body.commission_percentage ?? 0,
    status: req.body.status || 'pending',
    rating: req.body.rating ?? null,
    ...payload,
    ...mapCoveragePayload(req.body)
  });
  await walletService.getOrCreateWallet(company.id);
  return success(res, { statusCode: 201, message: 'Company created successfully', data: { company } });
});
const updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.params.id); if (!company) throw new AppError('Company not found', 404);
  if (req.body.type && req.body.type !== company.type) throw new AppError('Company type cannot be changed after creation', 409);
  await validateLocationPayload(req.body, company);
  await company.update({
    ...Object.fromEntries(Object.entries(req.body).filter(([key]) => companyFields.includes(key))),
    ...mapCoveragePayload(req.body)
  });
  return success(res, { message: 'Company updated successfully', data: { company } });
});
const getOwnCompany = asyncHandler(async (req, res) => success(res, { message: 'Own company retrieved successfully', data: { company: req.companyAccess.company } }));
const updateOwnCompany = asyncHandler(async (req, res) => {
  const company = req.companyAccess.company;
  await validateLocationPayload(req.body, company);
  if (Object.hasOwn(req.body, 'availability_mode') && !AVAILABILITY_MODES.has(req.body.availability_mode)) {
    throw new AppError('availability_mode must be automatic, open, or closed', 422);
  }
  const availability = {};
  if (Object.hasOwn(req.body, 'availability_mode')) availability.availability_mode = req.body.availability_mode;
  if (Object.hasOwn(req.body, 'business_hours')) availability.business_hours = normalizeBusinessHours(req.body.business_hours);
  await company.update({
    ...Object.fromEntries(Object.entries(req.body).filter(([key]) => ['name', 'description', 'phone', 'email', 'logo', 'address', 'latitude', 'longitude'].includes(key))),
    ...availability
  });
  return success(res, { message: 'Own company updated successfully', data: { company } });
});
const replaceLogo = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) throw new AppError('Company not found', 404);
  const previousLogo = company.logo;
  const logo = await saveCompanyLogo(req.file, company.id);
  await company.update({ logo });
  await deleteCompanyLogo(previousLogo);
  return success(res, { message: 'Company logo updated successfully', data: { company } });
});
const replaceOwnLogo = asyncHandler(async (req, res) => {
  const company = req.companyAccess.company;
  const previousLogo = company.logo;
  const logo = await saveCompanyLogo(req.file, company.id);
  await company.update({ logo });
  await deleteCompanyLogo(previousLogo);
  return success(res, { message: 'Own company logo updated successfully', data: { company } });
});
const setCompanyStatus = (status) => asyncHandler(async (req, res) => { const company = await Company.findByPk(req.params.id); if (!company) throw new AppError('Company not found', 404); await company.update({ status }); return success(res, { message: `Company ${status} successfully`, data: { company } }); });
const updateCommission = asyncHandler(async (req, res) => { const percentage = Number(req.body.commission_percentage); if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new AppError('Commission percentage must be between 0 and 100', 422); const company = await Company.findByPk(req.params.id); if (!company) throw new AppError('Company not found', 404); await company.update({ commission_percentage: percentage }); return success(res, { message: 'Company commission updated successfully', data: { company } }); });
const deleteCompany = asyncHandler(async (req, res) => { const company = await Company.findByPk(req.params.id); if (!company) throw new AppError('Company not found', 404); try { await company.destroy(); } catch (error) { if (error.name === 'SequelizeForeignKeyConstraintError') throw new AppError('Company cannot be deleted because it has related records', 409); throw error; } return res.status(204).send(); });
const addTeamMember = asyncHandler(async (req, res) => { const company = await Company.findByPk(req.params.id); if (!company) throw new AppError('Company not found', 404); for (const field of ['name', 'last_name', 'email', 'phone', 'password']) if (!req.body[field]) throw new AppError('Validation failed', 422); const member = await companyService.createTeamMember(company.id, req.body); return success(res, { statusCode: 201, message: 'Company team member created successfully', data: member }); });
async function teamCompanyId(req) {
  if (req.companyAccess?.company?.id) return req.companyAccess.company.id;
  const company = await Company.findByPk(req.params.id);
  if (!company) throw new AppError('Company not found', 404);
  return company.id;
}
const listTeam = asyncHandler(async (req, res) => { const companyId = await teamCompanyId(req); const where = { company_id: companyId }; const include = [{ model: User, as: 'user', attributes: ['id', 'name', 'last_name', 'email', 'phone', 'status'], required: Boolean(req.query.search), where: req.query.search ? { [Op.or]: [{ name: { [Op.like]: `%${req.query.search}%` } }, { last_name: { [Op.like]: `%${req.query.search}%` } }, { email: { [Op.like]: `%${req.query.search}%` } }] } : undefined }, { model: Role, as: 'companyRoles', attributes: ['id', 'name', 'scope'], required: Boolean(req.query.role_id), where: req.query.role_id ? { id: req.query.role_id } : undefined }]; const page = await paginate(CompanyUser, { where, include, allowedSort: { id: 'id', created_at: 'created_at' } }, req.query); return success(res, { message: 'Company team retrieved successfully', data: { members: page.items, pagination: page.pagination } }); });
const listAssignableRoles = asyncHandler(async (req, res) => { const roles = await Role.findAll({ where: { scope: 'company' }, attributes: ['id', 'name', 'description', 'scope'], order: [['name', 'ASC']] }); return success(res, { message: 'Assignable company roles retrieved successfully', data: { roles } }); });
const updateTeamRoles = asyncHandler(async (req, res) => { const companyId = await teamCompanyId(req); const member = await CompanyUser.findOne({ where: { id: req.params.memberId, company_id: companyId } }); if (!member) throw new AppError('Company team member not found', 404); const roles = await companyService.replaceTeamMemberRoles(member, req.body.role_ids); return success(res, { message: 'Company team member roles updated successfully', data: { member_id: member.id, roles } }); });
const updateTeamMember = asyncHandler(async (req, res) => {
  const companyId = await teamCompanyId(req);
  const member = await CompanyUser.findOne({ where: { id: req.params.memberId, company_id: companyId }, include: [{ model: User, as: 'user' }] });
  if (!member) throw new AppError('Company team member not found', 404);
  const user = await companyService.updateTeamMember(member, req.body);
  return success(res, { message: 'Company team member updated successfully', data: { user } });
});
const removeTeamMember = asyncHandler(async (req, res) => { const companyId = await teamCompanyId(req); const member = await CompanyUser.findOne({ where: { id: req.params.memberId, company_id: companyId } }); if (!member) throw new AppError('Company team member not found', 404); if (member.role === 'owner') throw new AppError('The company owner cannot be removed', 409); await companyService.removeTeamMember(member); return res.status(204).send(); });
module.exports = { listCompanies, getCompany, getOwnCompany, createCompany, updateCompany, updateOwnCompany, replaceLogo, replaceOwnLogo, deleteCompany, activate: setCompanyStatus('active'), suspend: setCompanyStatus('suspended'), updateCommission, addTeamMember, listTeam, listAssignableRoles, updateTeamRoles, updateTeamMember, removeTeamMember };
