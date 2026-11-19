const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { success } = require('../utils/api-response');
const { Op, fn, col, where } = require('sequelize');
const { User, Role, Order, Appointment, Company, AuditLog } = require('../models');
const { notifyUsers } = require('../services/notification.service');

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 500;

function parseDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(`${field} debe tener formato AAAA-MM-DD.`, 422);
  }
  return value;
}

function normalizeFilters(input = {}) {
  const activity = ['all', 'orders', 'appointments'].includes(input.activity) ? input.activity : 'all';
  const companyType = ['all', 'food', 'products', 'services'].includes(input.company_type) ? input.company_type : 'all';
  const companyId = input.company_id === '' || input.company_id === undefined || input.company_id === null
    ? null
    : Number(input.company_id);
  const minimumOrderTotal = input.minimum_order_total === '' || input.minimum_order_total === undefined || input.minimum_order_total === null
    ? null
    : Number(input.minimum_order_total);
  const from = parseDate(input.from, 'La fecha inicial');
  const to = parseDate(input.to, 'La fecha final');

  if (companyId !== null && (!Number.isSafeInteger(companyId) || companyId < 1)) throw new AppError('El negocio seleccionado no es valido.', 422);
  if (minimumOrderTotal !== null && (!Number.isFinite(minimumOrderTotal) || minimumOrderTotal < 0)) throw new AppError('El valor minimo de compra no es valido.', 422);
  if (from && to && from > to) throw new AppError('La fecha inicial no puede ser posterior a la fecha final.', 422);

  return { activity, company_type: companyType, company_id: companyId, minimum_order_total: minimumOrderTotal, from, to };
}

async function resolveRecipients(filters) {
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' }, attributes: ['id'] });
  if (!customerRole) throw new AppError('Customer role is not configured', 500);

  const hasCompanyFilter = filters.company_id !== null || filters.company_type !== 'all';
  const companyWhere = {
    ...(filters.company_id !== null ? { id: filters.company_id } : {}),
    ...(filters.company_type !== 'all' ? { type: filters.company_type } : {})
  };
  const companyIds = hasCompanyFilter
    ? (await Company.findAll({ where: companyWhere, attributes: ['id'], raw: true })).map((company) => Number(company.id))
    : null;
  if (companyIds && !companyIds.length) return [];

  const findOrderCustomers = async () => (await Order.findAll({
    where: {
      ...(companyIds ? { company_id: { [Op.in]: companyIds } } : {}),
      ...(filters.from || filters.to ? { created_at: { ...(filters.from ? { [Op.gte]: new Date(`${filters.from}T00:00:00-05:00`) } : {}), ...(filters.to ? { [Op.lte]: new Date(`${filters.to}T23:59:59.999-05:00`) } : {}) } } : {})
    },
    attributes: ['customer_id'],
    group: ['customer_id'],
    ...(filters.minimum_order_total !== null ? { having: where(fn('SUM', col('total')), Op.gte, filters.minimum_order_total) } : {}),
    raw: true
  })).map((item) => Number(item.customer_id));

  const findAppointmentCustomers = async () => (await Appointment.findAll({
    where: {
      ...(companyIds ? { company_id: { [Op.in]: companyIds } } : {}),
      ...(filters.from || filters.to ? { scheduled_date: { ...(filters.from ? { [Op.gte]: filters.from } : {}), ...(filters.to ? { [Op.lte]: filters.to } : {}) } } : {})
    },
    attributes: ['customer_id'], group: ['customer_id'], raw: true
  })).map((item) => Number(item.customer_id));

  let activityIds;
  if (filters.activity === 'orders') activityIds = await findOrderCustomers();
  else if (filters.activity === 'appointments') activityIds = await findAppointmentCustomers();
  else if (hasCompanyFilter || filters.from || filters.to || filters.minimum_order_total !== null) {
    const [orders, appointments] = await Promise.all([
      findOrderCustomers(),
      filters.minimum_order_total === null ? findAppointmentCustomers() : Promise.resolve([])
    ]);
    activityIds = [...new Set([...orders, ...appointments])];
  }

  const recipients = await User.findAll({
    where: {
      role_id: customerRole.id,
      status: 'active',
      ...(activityIds ? { id: { [Op.in]: activityIds } } : {})
    },
    attributes: ['id'], raw: true
  });
  return recipients.map((recipient) => Number(recipient.id));
}

const previewCampaign = asyncHandler(async (req, res) => {
  const filters = normalizeFilters(req.body?.filters);
  const recipients = await resolveRecipients(filters);
  return success(res, { message: 'Destinatarios calculados.', data: { recipients: recipients.length } });
});

const sendCampaign = asyncHandler(async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!title || title.length > MAX_TITLE_LENGTH || !message || message.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(`El titulo debe tener hasta ${MAX_TITLE_LENGTH} caracteres y el mensaje hasta ${MAX_MESSAGE_LENGTH}.`, 422);
  }

  const filters = normalizeFilters(req.body?.filters);
  const recipientIds = await resolveRecipients(filters);
  if (!recipientIds.length) throw new AppError('No hay clientes activos para recibir la notificacion.', 409);

  const result = await notifyUsers(recipientIds, {
    type: 'PLATFORM_CAMPAIGN',
    title,
    message,
    data: { source: 'super_admin_campaign', filters },
    app_scope: 'customer'
  });

  await AuditLog.create({
    user_id: req.auth.user.id,
    action: 'notification.campaign_sent',
    entity_type: 'notification_campaign',
    entity_id: null,
    old_values: null,
    new_values: { title, message, filters, recipient_count: result.notification_count },
    ip_address: req.ip,
    user_agent: req.get('user-agent') || null
  });

  return success(res, {
    message: 'Notificacion enviada a los clientes activos.',
    data: { recipients: result.notification_count, push_tickets: result.push.tickets.length }
  });
});

module.exports = { previewCampaign, sendCampaign };
