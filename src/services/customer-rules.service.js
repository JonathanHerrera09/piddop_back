const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const { Appointment, AuthRefreshToken, Order, User } = require('../models');
const { disconnectUser } = require('../websocket');

const activeOrderStatuses = ['pending', 'accepted', 'preparing', 'waiting_delivery', 'on_the_way'];

function currentMonthRange(now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
}

async function assertCustomerCanCreateOrder({ companyId, transaction, userId }) {
  const activeOrders = await Order.findAll({
    where: {
      customer_id: userId,
      order_status: { [Op.in]: activeOrderStatuses }
    },
    transaction
  });

  if (activeOrders.length >= 2) {
    throw new AppError('Solo puedes tener hasta 2 pedidos activos al mismo tiempo.', 422);
  }

  if (activeOrders.some((order) => String(order.company_id) !== String(companyId))) {
    throw new AppError('Active orders must belong to the same company or restaurant', 409);
  }
}

async function countMonthlyCustomerCancellations({ transaction, userId }) {
  const { end, start } = currentMonthRange();

  const [orderCancellations, appointmentCancellations] = await Promise.all([
    Order.count({
      where: {
        customer_id: userId,
        order_status: 'cancelled',
        [Op.or]: [
          { payment_method: { [Op.ne]: 'pse' } },
          { payment_status: { [Op.notIn]: ['pending', 'failed'] } }
        ],
        updated_at: { [Op.gte]: start, [Op.lt]: end }
      },
      transaction
    }),
    Appointment.count({
      where: {
        customer_id: userId,
        status: 'cancelled',
        updated_at: { [Op.gte]: start, [Op.lt]: end }
      },
      transaction
    })
  ]);

  return orderCancellations + appointmentCancellations;
}

function isPenaltyFreeOrderCancellation(order) {
  return order?.payment_method === 'pse' && ['pending', 'failed'].includes(order?.payment_status);
}

async function suspendCustomerIfNeeded({ transaction, userId }) {
  const cancellations = await countMonthlyCustomerCancellations({ transaction, userId });

  if (cancellations < 3) {
    return false;
  }

  await User.update({ status: 'suspended' }, { where: { id: userId }, transaction });
  await AuthRefreshToken.update({ revoked_at: new Date() }, { where: { user_id: userId, revoked_at: null }, transaction });
  transaction.afterCommit(() => disconnectUser(userId, 'account_suspended'));
  return true;
}

module.exports = { activeOrderStatuses, assertCustomerCanCreateOrder, isPenaltyFreeOrderCancellation, suspendCustomerIfNeeded };
