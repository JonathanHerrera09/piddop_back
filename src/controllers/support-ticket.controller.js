const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const AppError = require('../utils/app-error');
const { Op } = require('sequelize');
const { SupportTicket, User, Role, Notification } = require('../models');
const { paginate } = require('../utils/pagination');

function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

const create = asyncHandler(async (req, res) => {
  if (req.auth.user.platformRole?.name !== 'CUSTOMER') throw new AppError('Solo los clientes pueden crear solicitudes de soporte.', 403);
  const subject = clean(req.body?.subject, 180);
  const contactPhone = clean(req.body?.contact_phone, 30);
  const message = clean(req.body?.message, 4000);
  const orderNumber = clean(req.body?.order_number, 40) || null;
  if (!subject || !contactPhone || !message) throw new AppError('Asunto, número de contacto y mensaje son obligatorios.', 422);
  const ticket = await SupportTicket.create({ customer_id: req.auth.user.id, subject, contact_phone: contactPhone, message, order_number: orderNumber });
  const admins = await User.findAll({ include: [{ model: Role, as: 'platformRole', where: { name: 'SUPER_ADMIN' } }], attributes: ['id'] });
  if (admins.length) await Notification.bulkCreate(admins.map((admin) => ({ user_id: admin.id, type: 'SUPPORT_TICKET_CREATED', title: 'Nueva solicitud de soporte', message: `${req.auth.user.name} envió: ${subject}`, data: { support_ticket_id: ticket.id } })));
  return success(res, { message: 'Tu solicitud fue enviada al equipo de soporte.', data: { ticket } }, 201);
});

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (['open', 'in_progress', 'closed'].includes(req.query.status)) where.status = req.query.status;
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const search = `%${req.query.search.trim().slice(0, 100)}%`;
    where[Op.or] = [{ subject: { [Op.like]: search } }, { order_number: { [Op.like]: search } }, { contact_phone: { [Op.like]: search } }, { '$customer.name$': { [Op.like]: search } }, { '$customer.email$': { [Op.like]: search } }];
  }
  const page = await paginate(SupportTicket, { where, include: [{ model: User, as: 'customer', attributes: ['id', 'name', 'last_name', 'email', 'phone'] }], allowedSort: { created_at: 'created_at', status: 'status' } }, req.query);
  return success(res, { message: 'Support tickets retrieved successfully', data: { tickets: page.items, pagination: page.pagination } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findByPk(req.params.id);
  if (!ticket) throw new AppError('Solicitud de soporte no encontrada.', 404);
  const status = clean(req.body?.status, 30);
  if (!['open', 'in_progress', 'closed'].includes(status)) throw new AppError('Estado de soporte inválido.', 422);
  await ticket.update({ status });
  return success(res, { message: 'Estado actualizado.', data: { ticket } });
});

module.exports = { create, list, updateStatus };
