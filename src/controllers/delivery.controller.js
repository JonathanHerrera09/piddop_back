const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error'); const asyncHandler = require('../utils/async-handler'); const { success } = require('../utils/api-response');
const { sequelize, Role, User, Order, OrderStatusHistory, DeliveryDriver, Delivery, Company, CustomerAddress, Payment } = require('../models');
const { notifyUser } = require('../services/notification.service');
const walletService = require('../services/company-wallet.service');
const { emitToUser } = require('../websocket');
const { paginate } = require('../utils/pagination');
const activeStatuses = ['accepted', 'picked_up', 'on_the_way'];
const deliveryInclude = [{
  model: Order,
  as: 'order',
  include: [
    { model: Company, as: 'company', attributes: ['id', 'name', 'address', 'latitude', 'longitude'] },
    { model: CustomerAddress, as: 'address' }
  ]
}];
async function driverFor(userId) { const driver = await DeliveryDriver.findOne({ where: { user_id: userId } }); if (!driver) throw new AppError('Delivery driver profile not found', 404); return driver; }
async function history(orderId, status, userId, notes, transaction) { await OrderStatusHistory.create({ order_id: orderId, status, changed_by_user_id: userId, notes }, { transaction }); }
const createDriver = asyncHandler(async (req, res) => {
  for (const field of ['name', 'last_name', 'email', 'phone', 'password']) if (!req.body[field]) throw new AppError('Validation failed', 422);
  if (!['bicycle', 'motorcycle', 'car', 'other'].includes(req.body.vehicle_type || 'motorcycle')) throw new AppError('Invalid vehicle type', 422);
  const deliveryRole = await Role.findOne({ where: { name: 'DELIVERY', scope: 'platform' } }); if (!deliveryRole) throw new AppError('Delivery role is not configured', 500);
  const result = await sequelize.transaction(async (transaction) => {
    if (await User.findOne({ where: { [Op.or]: [{ email: req.body.email.toLowerCase() }, { phone: req.body.phone }] }, transaction })) throw new AppError('Email or phone is already registered', 409);
    const user = await User.create({ role_id: deliveryRole.id, name: req.body.name.trim(), last_name: req.body.last_name.trim(), email: req.body.email.toLowerCase(), phone: req.body.phone.trim(), password: await bcrypt.hash(req.body.password, 12), status: 'active' }, { transaction });
    const driver = await DeliveryDriver.create({ user_id: user.id, vehicle_type: req.body.vehicle_type || 'motorcycle', vehicle_plate: req.body.vehicle_plate || null, availability_status: 'offline' }, { transaction });
    return { driver, user: { id: user.id, name: user.name, last_name: user.last_name, email: user.email } };
  });
  return success(res, { statusCode: 201, message: 'Delivery driver created successfully', data: result });
});
const listAdminDrivers = asyncHandler(async (req, res) => {
  const include = [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'last_name', 'email', 'phone', 'status'],
        required: Boolean(req.query.search),
        where: req.query.search ? { [Op.or]: [{ name: { [Op.like]: `%${req.query.search}%` } }, { last_name: { [Op.like]: `%${req.query.search}%` } }, { email: { [Op.like]: `%${req.query.search}%` } }] } : undefined
      }];
  const page = await paginate(DeliveryDriver, {
    where: req.query.availability_status ? { availability_status: req.query.availability_status } : {}, include,
    allowedSort: { id: 'id', availability_status: 'availability_status', vehicle_type: 'vehicle_type' }
  }, req.query);

  return success(res, {
    message: 'Delivery drivers retrieved successfully',
    data: { drivers: page.items, pagination: page.pagination }
  });
});
const listAdminDeliveries = asyncHandler(async (req, res) => success(res, { message: 'Deliveries retrieved successfully', data: { deliveries: await Delivery.findAll({ include: deliveryInclude, order: [['id', 'DESC']] }) } }));
const getAdminDelivery = asyncHandler(async (req, res) => { const delivery = await Delivery.findByPk(req.params.id, { include: deliveryInclude }); if (!delivery) throw new AppError('Delivery not found', 404); return success(res, { message: 'Delivery retrieved successfully', data: { delivery } }); });
const setAvailability = asyncHandler(async (req, res) => { const status = req.body.availability_status; if (!['offline', 'available'].includes(status)) throw new AppError('availability_status must be offline or available', 422); const driver = await driverFor(req.auth.user.id); const active = await Delivery.count({ where: { driver_id: driver.id, status: { [Op.in]: activeStatuses } } }); if (active && status === 'available') throw new AppError('A driver with an active order cannot be available', 409); await driver.update({ availability_status: status }); return success(res, { message: 'Availability updated successfully', data: { driver } }); });
const availableOrders = asyncHandler(async (req, res) => { const driver = await driverFor(req.auth.user.id); if (driver.availability_status !== 'available') throw new AppError('Set availability_status to available first', 409); const orders = await Order.findAll({ where: { order_status: 'waiting_delivery' }, include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'address', 'latitude', 'longitude'] }, { model: CustomerAddress, as: 'address' }, { model: Delivery, as: 'delivery', required: false }], order: [['created_at', 'ASC']] }); return success(res, { message: 'Available orders retrieved successfully', data: { orders: orders.filter((order) => !order.delivery) } }); });
const accept = asyncHandler(async (req, res) => {
  const delivery = await sequelize.transaction(async (transaction) => {
    const driver = await DeliveryDriver.findOne({ where: { user_id: req.auth.user.id }, transaction, lock: transaction.LOCK.UPDATE }); if (!driver) throw new AppError('Delivery driver profile not found', 404); if (driver.availability_status !== 'available') throw new AppError('Driver is not available', 409);
    const existing = await Delivery.findOne({ where: { driver_id: driver.id, status: { [Op.in]: activeStatuses } }, transaction, lock: transaction.LOCK.UPDATE }); if (existing) throw new AppError('Driver already has an active order', 409);
    const order = await Order.findOne({ where: { id: req.params.id, order_status: 'waiting_delivery' }, transaction, lock: transaction.LOCK.UPDATE }); if (!order) throw new AppError('Order is no longer available', 409);
    const alreadyAssigned = await Delivery.findOne({ where: { order_id: order.id }, transaction, lock: transaction.LOCK.UPDATE }); if (alreadyAssigned) throw new AppError('Order is already assigned', 409);
    const created = await Delivery.create({ order_id: order.id, driver_id: driver.id, delivery_fee: order.delivery_fee, driver_payment: order.delivery_fee, status: 'accepted', accepted_at: new Date() }, { transaction }); await driver.update({ availability_status: 'busy' }, { transaction }); return created;
  });
  const fullDelivery = await Delivery.findByPk(delivery.id, { include: deliveryInclude });
  await notifyUser(fullDelivery.order.customer_id, { type: 'DELIVERY_ASSIGNED', title: 'Domiciliario asignado', message: 'Un domiciliario acepto tu pedido y pronto pasara a recogerlo.', data: { order_id: fullDelivery.order_id, delivery_id: fullDelivery.id, delivery_code: fullDelivery.order.delivery_code } });
  emitToUser(fullDelivery.order.customer_id, 'delivery:assigned', { order_id: fullDelivery.order_id, delivery_id: fullDelivery.id, delivery_code: fullDelivery.order.delivery_code, company_name: fullDelivery.order.company?.name || null });
  return success(res, { message: 'Order accepted successfully', data: { delivery: fullDelivery } });
});
const current = asyncHandler(async (req, res) => { const driver = await driverFor(req.auth.user.id); const delivery = await Delivery.findOne({ where: { driver_id: driver.id, status: { [Op.in]: activeStatuses } }, include: deliveryInclude }); return success(res, { message: 'Current order retrieved successfully', data: { delivery } }); });
const onTheWay = asyncHandler(async (req, res) => { const driver = await driverFor(req.auth.user.id); const delivery = await Delivery.findOne({ where: { order_id: req.params.id, driver_id: driver.id, status: 'accepted' }, include: deliveryInclude }); if (!delivery) throw new AppError('Accepted delivery not found', 404); await sequelize.transaction(async (transaction) => { await delivery.update({ status: 'on_the_way', picked_up_at: new Date() }, { transaction }); await delivery.order.update({ order_status: 'on_the_way' }, { transaction }); await history(delivery.order_id, 'on_the_way', req.auth.user.id, 'Domiciliario en camino', transaction); }); await notifyUser(delivery.order.customer_id, { type: 'ORDER_ON_THE_WAY', title: 'Tu pedido va en camino', message: 'Tu pedido ya salio para entrega. Tu codigo de entrega ya esta disponible.', data: { order_id: delivery.order_id } }); emitToUser(delivery.order.customer_id, 'order:status_changed', { order_id: delivery.order_id, order_status: 'on_the_way' }); return success(res, { message: 'Delivery started successfully', data: { delivery: await Delivery.findByPk(delivery.id, { include: deliveryInclude }) } }); });
const complete = asyncHandler(async (req, res) => { const driver = await driverFor(req.auth.user.id); const delivery = await Delivery.findOne({ where: { order_id: req.params.id, driver_id: driver.id, status: 'on_the_way' }, include: deliveryInclude }); if (!delivery) throw new AppError('Delivery in transit not found', 404); if (String(req.body.delivery_code || '') !== delivery.order.delivery_code) throw new AppError('Invalid delivery code', 422); await sequelize.transaction(async (transaction) => { await delivery.update({ status: 'delivered', delivered_at: new Date() }, { transaction }); await delivery.order.update({ order_status: 'delivered', payment_status: delivery.order.payment_method === 'cash' ? 'paid' : delivery.order.payment_status }, { transaction }); if (delivery.order.payment_method === 'cash') await Payment.update({ status: 'paid', paid_at: new Date() }, { where: { order_id: delivery.order_id, method: 'cash', status: 'pending' }, transaction }); await walletService.chargeOrderCommission({ orderId: delivery.order_id, changedByUserId: req.auth.user.id, transaction }); await driver.update({ availability_status: 'available' }, { transaction }); await history(delivery.order_id, 'delivered', req.auth.user.id, 'Entregado con codigo de seguridad', transaction); }); await notifyUser(delivery.order.customer_id, { type: 'ORDER_DELIVERED', title: 'Pedido entregado', message: 'Tu pedido fue entregado correctamente.', data: { order_id: delivery.order_id } }); emitToUser(delivery.order.customer_id, 'order:status_changed', { order_id: delivery.order_id, order_status: 'delivered' }); return success(res, { message: 'Delivery completed successfully', data: { delivery: await Delivery.findByPk(delivery.id, { include: deliveryInclude }) } }); });
const updateDriverPayment = asyncHandler(async (req, res) => { const amount = Number(req.body.driver_payment); if (!Number.isFinite(amount) || amount < 0) throw new AppError('driver_payment must be a non-negative amount', 422); const delivery = await Delivery.findByPk(req.params.id); if (!delivery) throw new AppError('Delivery not found', 404); if (delivery.status === 'delivered') throw new AppError('Delivered payment cannot be changed', 409); await delivery.update({ driver_payment: amount }); return success(res, { message: 'Driver payment updated successfully', data: { delivery } }); });
const location = asyncHandler(async (req, res) => { const latitude = Number(req.body.latitude); const longitude = Number(req.body.longitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new AppError('Valid latitude and longitude are required', 422); const driver = await driverFor(req.auth.user.id); await driver.update({ current_latitude: latitude, current_longitude: longitude, location_updated_at: new Date() }); const currentDelivery = await Delivery.findOne({ where: { driver_id: driver.id, status: 'on_the_way' }, include: deliveryInclude }); if (currentDelivery) emitToUser(currentDelivery.order.customer_id, 'delivery:location_updated', { order_id: currentDelivery.order_id, latitude, longitude }); return success(res, { message: 'Location updated successfully', data: { latitude, longitude } }); });
const reports = asyncHandler(async (req, res) => { const driver = await driverFor(req.auth.user.id); const filter = req.query.filter || 'today'; const now = new Date(); let from = new Date(now); if (filter === 'today') from.setHours(0, 0, 0, 0); else if (filter === 'week') from.setDate(now.getDate() - 7); else if (filter === 'month') from.setMonth(now.getMonth() - 1); else if (filter === 'custom' && req.query.date_from && req.query.date_to) { from = new Date(req.query.date_from); now.setTime(new Date(req.query.date_to).getTime() + 86400000); } else if (filter !== 'today') throw new AppError('Invalid report filter', 422); const deliveries = await Delivery.findAll({ where: { driver_id: driver.id, status: 'delivered', delivered_at: { [Op.between]: [from, now] } } }); const earnings = deliveries.reduce((total, delivery) => total + Number(delivery.driver_payment), 0); return success(res, { message: 'Delivery report retrieved successfully', data: { filter, delivered_orders: deliveries.length, earnings, date_from: from, date_to: now } }); });
module.exports = { createDriver, listAdminDrivers, listAdminDeliveries, getAdminDelivery, setAvailability, availableOrders, accept, current, onTheWay, complete, location, reports, updateDriverPayment };
