const { Op, fn, col } = require('sequelize');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const AppError = require('../utils/app-error');
const crypto = require('node:crypto');
const { sequelize, User, Role, CustomerAddress, Cart, Order, Appointment, Company, CompanyReview, CouponUsage, SupportTicket, Notification, PushToken, AuthRefreshToken, PasswordResetToken, UserLegalAcceptance, Delivery, Payment, CompanySettlementItem, WalletTransaction } = require('../models');
const { paginate } = require('../utils/pagination');

function monthRange(date = new Date()) {
  const from = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

async function customerRoleId() {
  const role = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  if (!role) {
    throw new AppError('Customer role is not configured', 500);
  }

  return role.id;
}

async function buildCustomerSummary(customer) {
  const { from, to } = monthRange();

  const [addresses, ordersCount, activeOrdersCount, deliveredOrdersCount, appointmentsCount, pendingAppointmentsCount, cancellationsThisMonth, recentOrders, recentAppointments] = await Promise.all([
    CustomerAddress.findAll({
      where: { customer_id: customer.id },
      order: [['is_default', 'DESC'], ['id', 'DESC']]
    }),
    Order.count({ where: { customer_id: customer.id } }),
    Order.count({
      where: {
        customer_id: customer.id,
        order_status: {
          [Op.in]: ['pending', 'accepted', 'preparing', 'waiting_delivery', 'on_the_way']
        }
      }
    }),
    Order.count({
      where: {
        customer_id: customer.id,
        order_status: 'delivered'
      }
    }),
    Appointment.count({ where: { customer_id: customer.id } }),
    Appointment.count({
      where: {
        customer_id: customer.id,
        status: {
          [Op.in]: ['pending', 'accepted']
        }
      }
    }),
    Promise.all([
      Order.count({
        where: {
          customer_id: customer.id,
          order_status: 'cancelled',
          updated_at: { [Op.gte]: from, [Op.lt]: to }
        }
      }),
      Appointment.count({
        where: {
          customer_id: customer.id,
          status: 'cancelled',
          updated_at: { [Op.gte]: from, [Op.lt]: to }
        }
      })
    ]).then(([ordersCancelled, appointmentsCancelled]) => ordersCancelled + appointmentsCancelled),
    Order.findAll({
      where: { customer_id: customer.id },
      attributes: ['id', 'order_number', 'order_status', 'total', 'created_at'],
      include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'type'] }],
      order: [['id', 'DESC']],
      limit: 5
    }),
    Appointment.findAll({
      where: { customer_id: customer.id },
      attributes: ['id', 'appointment_number', 'status', 'scheduled_date', 'start_time', 'price', 'created_at'],
      include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'type'] }],
      order: [['scheduled_date', 'DESC'], ['start_time', 'DESC']],
      limit: 5
    })
  ]);

  return {
    id: customer.id,
    name: customer.name,
    last_name: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    profile_image: customer.profile_image,
    status: customer.status,
    addresses,
    stats: {
      addresses_count: addresses.length,
      orders_count: ordersCount,
      active_orders_count: activeOrdersCount,
      delivered_orders_count: deliveredOrdersCount,
      appointments_count: appointmentsCount,
      pending_appointments_count: pendingAppointmentsCount,
      cancellations_this_month: cancellationsThisMonth
    },
    recent_orders: recentOrders,
    recent_appointments: recentAppointments,
    created_at: customer.created_at,
    updated_at: customer.updated_at
  };
}

async function buildCustomerPageSummaries(customers) {
  const ids = customers.map((customer) => customer.id);
  if (!ids.length) return [];
  const { from, to } = monthRange();
  const [addresses, orders, appointments, orderCounts, appointmentCounts] = await Promise.all([
    CustomerAddress.findAll({ where: { customer_id: { [Op.in]: ids } }, order: [['is_default', 'DESC'], ['id', 'DESC']] }),
    Order.findAll({ where: { customer_id: { [Op.in]: ids } }, attributes: ['id', 'customer_id', 'order_number', 'order_status', 'total', 'created_at', 'updated_at'], include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'type'] }], order: [['id', 'DESC']], limit: ids.length * 5 }),
    Appointment.findAll({ where: { customer_id: { [Op.in]: ids } }, attributes: ['id', 'customer_id', 'appointment_number', 'status', 'scheduled_date', 'start_time', 'price', 'created_at', 'updated_at'], include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'type'] }], order: [['scheduled_date', 'DESC'], ['start_time', 'DESC']], limit: ids.length * 5 }),
    Order.findAll({ where: { customer_id: { [Op.in]: ids } }, attributes: ['customer_id', 'order_status', [fn('COUNT', col('id')), 'count']], group: ['customer_id', 'order_status'], raw: true }),
    Appointment.findAll({ where: { customer_id: { [Op.in]: ids } }, attributes: ['customer_id', 'status', [fn('COUNT', col('id')), 'count']], group: ['customer_id', 'status'], raw: true })
  ]);
  const addressesByCustomer = new Map(); const ordersByCustomer = new Map(); const appointmentsByCustomer = new Map();
  for (const address of addresses) { const list = addressesByCustomer.get(address.customer_id) || []; list.push(address); addressesByCustomer.set(address.customer_id, list); }
  for (const order of orders) { const list = ordersByCustomer.get(order.customer_id) || []; list.push(order); ordersByCustomer.set(order.customer_id, list); }
  for (const appointment of appointments) { const list = appointmentsByCustomer.get(appointment.customer_id) || []; list.push(appointment); appointmentsByCustomer.set(appointment.customer_id, list); }
  const orderStats = new Map(); const appointmentStats = new Map();
  for (const item of orderCounts) { const stats = orderStats.get(item.customer_id) || {}; stats[item.order_status] = Number(item.count); orderStats.set(item.customer_id, stats); }
  for (const item of appointmentCounts) { const stats = appointmentStats.get(item.customer_id) || {}; stats[item.status] = Number(item.count); appointmentStats.set(item.customer_id, stats); }
  return customers.map((customer) => {
    const customerAddresses = addressesByCustomer.get(customer.id) || []; const customerOrders = ordersByCustomer.get(customer.id) || []; const customerAppointments = appointmentsByCustomer.get(customer.id) || [];
    const orderStat = orderStats.get(customer.id) || {}; const appointmentStat = appointmentStats.get(customer.id) || {};
    const activeOrders = ['pending', 'accepted', 'preparing', 'waiting_delivery', 'on_the_way'].reduce((sum, status) => sum + (orderStat[status] || 0), 0);
    const deliveredOrders = orderStat.delivered || 0;
    const pendingAppointments = (appointmentStat.pending || 0) + (appointmentStat.accepted || 0);
    const cancellations = customerOrders.filter((item) => item.order_status === 'cancelled' && item.updated_at >= from && item.updated_at < to).length + customerAppointments.filter((item) => item.status === 'cancelled' && item.updated_at >= from && item.updated_at < to).length;
    return { id: customer.id, name: customer.name, last_name: customer.last_name, email: customer.email, phone: customer.phone, profile_image: customer.profile_image, status: customer.status, addresses: customerAddresses, stats: { addresses_count: customerAddresses.length, orders_count: Object.values(orderStat).reduce((sum, count) => sum + Number(count), 0), active_orders_count: activeOrders, delivered_orders_count: deliveredOrders, appointments_count: Object.values(appointmentStat).reduce((sum, count) => sum + Number(count), 0), pending_appointments_count: pendingAppointments, cancellations_this_month: cancellations }, recent_orders: customerOrders.slice(0, 5), recent_appointments: customerAppointments.slice(0, 5), created_at: customer.created_at, updated_at: customer.updated_at };
  });
}

const listAdminCustomers = asyncHandler(async (req, res) => {
  const roleId = await customerRoleId();
  // Erased accounts are retained only as anonymous accounting references and
  // must not appear as customer profiles in the administration list.
  const where = { role_id: roleId, email: { [Op.notLike]: 'deleted-%@deleted.invalid' } };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where[Op.or] = [{ name: { [Op.like]: `%${req.query.search}%` } }, { last_name: { [Op.like]: `%${req.query.search}%` } }, { email: { [Op.like]: `%${req.query.search}%` } }, { phone: { [Op.like]: `%${req.query.search}%` } }];
  const page = await paginate(User, { where, allowedSort: { id: 'id', name: 'name', email: 'email', created_at: 'created_at' } }, req.query);

  const items = await buildCustomerPageSummaries(page.items);

  return success(res, {
    message: 'Customers retrieved successfully',
    data: { customers: items, pagination: page.pagination }
  });
});

const getAdminCustomer = asyncHandler(async (req, res) => {
  const roleId = await customerRoleId();
  const customer = await User.findOne({
    where: {
      id: req.params.id,
      role_id: roleId
    }
  });

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  return success(res, {
    message: 'Customer retrieved successfully',
    data: { customer: await buildCustomerSummary(customer) }
  });
});

const activateAdminCustomer = asyncHandler(async (req, res) => {
  const roleId = await customerRoleId();
  const customer = await User.findOne({
    where: {
      id: req.params.id,
      role_id: roleId
    }
  });

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  if (customer.status !== 'active') {
    await customer.update({ status: 'active' });
  }

  return success(res, {
    message: 'Customer activated successfully',
    data: { customer: await buildCustomerSummary(customer) }
  });
});

// Removes an order history only when it has not entered an operational or
// financial process. This keeps deliveries, settlements and wallet balances
// consistent while still allowing administrators to reset test/customer data.
const clearAdminCustomerOrders = asyncHandler(async (req, res) => {
  const roleId = await customerRoleId();
  const customer = await User.findOne({ where: { id: req.params.id, role_id: roleId } });
  if (!customer) throw new AppError('Customer not found', 404);

  const orders = await Order.findAll({
    where: { customer_id: customer.id },
    attributes: ['id'],
    transaction: undefined
  });
  const orderIds = orders.map((order) => order.id);

  if (!orderIds.length) {
    return success(res, { message: 'El cliente no tiene pedidos para vaciar.', data: { customer: await buildCustomerSummary(customer), deleted_orders: 0 } });
  }

  const [activeOrders, settledOrders, chargedOrders] = await Promise.all([
    Order.count({ where: { id: { [Op.in]: orderIds }, order_status: { [Op.in]: ['pending', 'accepted', 'preparing', 'waiting_delivery', 'on_the_way'] } } }),
    CompanySettlementItem.count({ where: { order_id: { [Op.in]: orderIds } } }),
    WalletTransaction.count({ where: { type: 'order_commission', reference_type: 'ORDER', reference_id: { [Op.in]: orderIds } } })
  ]);

  if (activeOrders) throw new AppError('No se pueden vaciar pedidos activos. Finalízalos o cancélalos antes de continuar.', 409);
  if (settledOrders || chargedOrders) throw new AppError('No se pueden vaciar pedidos que ya tienen movimientos financieros o están incluidos en una liquidación.', 409);

  const reviewedCompanyIds = await CompanyReview.findAll({
    where: { order_id: { [Op.in]: orderIds } },
    attributes: ['company_id'],
    group: ['company_id'],
    raw: true
  });

  await sequelize.transaction(async (transaction) => {
    // These relations do not all cascade in existing database installations.
    await Promise.all([
      Delivery.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction }),
      Payment.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction }),
      CompanyReview.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction })
    ]);
    await Order.destroy({ where: { id: { [Op.in]: orderIds } }, transaction });

    // Deleting a review changes the public company score, so refresh it in the
    // same transaction instead of leaving a stale cached rating.
    await Promise.all(reviewedCompanyIds.map(async ({ company_id: companyId }) => {
      const result = await CompanyReview.findOne({
        where: { company_id: companyId },
        attributes: [[fn('AVG', col('rating')), 'average']],
        raw: true,
        transaction
      });
      await Company.update({ rating: Number(result?.average || 0).toFixed(2) }, { where: { id: companyId }, transaction });
    }));
  });

  return success(res, {
    message: `${orderIds.length} pedido(s) del cliente fueron eliminados.`,
    data: { customer: await buildCustomerSummary(customer), deleted_orders: orderIds.length }
  });
});

// A customer can have completed orders that must remain available for accounting.
// Instead of deleting those transactions, remove identifying data and all
// non-financial customer activity. This also makes the credentials unusable.
const eraseAdminCustomerData = asyncHandler(async (req, res) => {
  const roleId = await customerRoleId();
  const customer = await User.findOne({ where: { id: req.params.id, role_id: roleId } });
  if (!customer) throw new AppError('Customer not found', 404);

  if (customer.status !== 'inactive') {
    const activeItems = await Promise.all([
      Order.count({ where: { customer_id: customer.id, order_status: { [Op.in]: ['pending', 'accepted', 'preparing', 'waiting_delivery', 'on_the_way'] } } }),
      Appointment.count({ where: { customer_id: customer.id, status: { [Op.in]: ['pending', 'accepted'] } } })
    ]);
    if (activeItems.some(Boolean)) throw new AppError('No se puede borrar la cuenta mientras tenga pedidos o citas activos.', 409);
  }

  const anonymousId = `${customer.id}-${crypto.randomUUID().slice(0, 8)}`;
  await sequelize.transaction(async (transaction) => {
    await Promise.all([
      AuthRefreshToken.destroy({ where: { user_id: customer.id }, transaction }),
      PasswordResetToken.destroy({ where: { user_id: customer.id }, transaction }),
      UserLegalAcceptance.destroy({ where: { user_id: customer.id }, transaction }),
      Notification.destroy({ where: { user_id: customer.id }, transaction }),
      PushToken.destroy({ where: { user_id: customer.id }, transaction }),
      SupportTicket.destroy({ where: { customer_id: customer.id }, transaction }),
      CompanyReview.destroy({ where: { customer_id: customer.id }, transaction }),
      CouponUsage.destroy({ where: { user_id: customer.id }, transaction }),
      Appointment.destroy({ where: { customer_id: customer.id }, transaction }),
      Cart.destroy({ where: { customer_id: customer.id }, transaction })
    ]);
    // Past orders reference their delivery address, so anonymize it rather than
    // breaking referential integrity.
    await CustomerAddress.update({
      label: 'Datos eliminados', recipient_name: 'Cliente eliminado', recipient_phone: '0000000000',
      address_line: 'Datos eliminados', additional_details: null, neighborhood: null, city: null,
      latitude: null, longitude: null, is_default: false
    }, { where: { customer_id: customer.id }, transaction, paranoid: false });
    await customer.update({
      name: 'Usuario', last_name: 'eliminado', email: `deleted-${anonymousId}@deleted.invalid`,
      phone: `9${String(customer.id).padStart(14, '0').slice(-14)}`, password: crypto.randomBytes(32).toString('hex'),
      google_sub: null, apple_sub: null, profile_image: null, email_verified_at: null, status: 'inactive'
    }, { transaction });
  });

  return success(res, { message: 'Los datos personales y registros no financieros del cliente fueron eliminados.', data: {} });
});

module.exports = {
  listAdminCustomers,
  getAdminCustomer,
  activateAdminCustomer,
  clearAdminCustomerOrders,
  eraseAdminCustomerData
};
