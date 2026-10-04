const { Op, fn, col } = require('sequelize');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { paginate } = require('../utils/pagination');
const { sequelize, CompanyReview, Company, Order, User } = require('../models');

const include = [
  { model: Company, as: 'company', attributes: ['id', 'name', 'logo', 'rating'] },
  { model: Order, as: 'order', attributes: ['id', 'order_number', 'created_at'] },
  { model: User, as: 'customer', attributes: ['id', 'name', 'last_name'] }
];
function whereFrom(query, fixedCompanyId) {
  const where = fixedCompanyId ? { company_id: fixedCompanyId } : {};
  if (query.rating) { const rating = Number(query.rating); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError('rating must be between 1 and 5', 422); where.rating = rating; }
  if (query.date_from || query.date_to) { where.created_at = {}; if (query.date_from) where.created_at[Op.gte] = new Date(`${query.date_from}T00:00:00`); if (query.date_to) where.created_at[Op.lte] = new Date(`${query.date_to}T23:59:59.999`); }
  if (query.company_id && !fixedCompanyId) { const id = Number(query.company_id); if (!Number.isSafeInteger(id) || id < 1) throw new AppError('company_id must be valid', 422); where.company_id = id; }
  if (query.has_comment === 'true') where.comment = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] };
  return where;
}
async function summary(companyId, where = {}) {
  const totals = await CompanyReview.findOne({ where: { ...where, company_id: companyId }, attributes: [[fn('COUNT', col('id')), 'count'], [fn('AVG', col('rating')), 'average']] });
  const rows = await CompanyReview.findAll({ where: { ...where, company_id: companyId }, attributes: ['rating', [fn('COUNT', col('id')), 'count']], group: ['rating'], raw: true });
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((rating) => [rating, 0])); rows.forEach((row) => { distribution[row.rating] = Number(row.count); });
  return { count: Number(totals?.get('count') || 0), average: Number(Number(totals?.get('average') || 0).toFixed(2)), distribution };
}
const create = asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating); const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError('rating must be an integer between 1 and 5', 422);
  if (comment && comment.length > 1000) throw new AppError('comment must not exceed 1000 characters', 422);
  const review = await sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: req.params.orderId, customer_id: req.auth.user.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw new AppError('Order not found', 404);
    if (order.order_status !== 'delivered') throw new AppError('Only delivered orders can be reviewed', 409);
    const existing = await CompanyReview.findOne({ where: { order_id: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) throw new AppError('This order already has a review', 409);
    const created = await CompanyReview.create({ order_id: order.id, company_id: order.company_id, customer_id: req.auth.user.id, rating, comment: comment || null }, { transaction });
    const result = await CompanyReview.findOne({ where: { company_id: order.company_id }, attributes: [[fn('AVG', col('rating')), 'average']], transaction });
    await Company.update({ rating: Number(Number(result.get('average')).toFixed(2)) }, { where: { id: order.company_id }, transaction });
    return created;
  });
  return success(res, { statusCode: 201, message: 'Review created successfully', data: { review: await CompanyReview.findByPk(review.id, { include }) } });
});
const mySummary = asyncHandler(async (req, res) => {
  const reviews = await CompanyReview.findAll({ where: { customer_id: req.auth.user.id }, attributes: ['rating'] });
  const count = reviews.length; const average = count ? reviews.reduce((sum, item) => sum + item.rating, 0) / count : 0;
  return success(res, { message: 'Customer review summary retrieved successfully', data: { count, average: Number(average.toFixed(2)) } });
});
async function list(req, res, companyId) { const where = whereFrom(req.query, companyId); const page = await paginate(CompanyReview, { where, include, allowedSort: { created_at: 'created_at', rating: 'rating' }, order: [['created_at', 'DESC']] }, req.query); const currentCompanyId = companyId || Number(req.query.company_id); return success(res, { message: 'Reviews retrieved successfully', data: { reviews: page.items, pagination: page.pagination, summary: currentCompanyId ? await summary(currentCompanyId, where) : null } }); }
const listCompany = asyncHandler((req, res) => list(req, res, req.companyAccess.company.id));
const listAdmin = asyncHandler((req, res) => list(req, res, null));
module.exports = { create, mySummary, listCompany, listAdmin };
