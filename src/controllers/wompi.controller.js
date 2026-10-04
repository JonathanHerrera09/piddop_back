const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { success } = require('../utils/api-response');
const { sequelize, AuditLog, Company, Order, Payment, User } = require('../models');
const { notifyCompany, notifyUser, emitCompany } = require('../services/notification.service');
const emailTemplateService = require('../services/email-template.service');
const { emitToUser } = require('../websocket');
const {
  getAdminWompiConfiguration,
  getWompiConfiguration,
  saveWompiConfiguration,
  verifyEvent
} = require('../services/wompi.service');

const getSettings = asyncHandler(async (_req, res) => success(res, {
  message: 'Wompi configuration retrieved successfully',
  data: { wompi: await getAdminWompiConfiguration() }
}));

const updateSettings = asyncHandler(async (req, res) => {
  const wompi = await saveWompiConfiguration(req.body || {});
  await AuditLog.create({
    user_id: req.auth.user.id,
    action: 'wompi.configuration.updated',
    entity_type: 'platform_setting',
    entity_id: null,
    old_values: null,
    new_values: {
      enabled: wompi.enabled,
      environment: wompi.environment,
      public_base_url: wompi.public_base_url,
      private_key_updated: Boolean(req.body.private_key),
      events_secret_updated: Boolean(req.body.events_secret),
      integrity_secret_updated: Boolean(req.body.integrity_secret)
    },
    ip_address: req.ip || null,
    user_agent: req.get('user-agent') || null
  });
  return success(res, { message: 'Wompi configuration updated successfully', data: { wompi } });
});

function paymentStatus(wompiStatus) {
  if (wompiStatus === 'APPROVED') return 'paid';
  if (['DECLINED', 'ERROR'].includes(wompiStatus)) return 'failed';
  if (wompiStatus === 'VOIDED') return 'failed';
  return 'pending';
}

const events = asyncHandler(async (req, res) => {
  const configuration = await getWompiConfiguration();
  if (!configuration.events_secret) throw new AppError('Wompi events are not configured.', 503);
  if (!verifyEvent(req.body, req.get('X-Event-Checksum'), configuration.events_secret)) {
    throw new AppError('Invalid Wompi event signature.', 401);
  }
  if (req.body.event !== 'transaction.updated') {
    return success(res, { message: 'Wompi event ignored', data: null });
  }

  const transaction = req.body?.data?.transaction;
  const reference = transaction?.reference;
  const nextStatus = paymentStatus(transaction?.status);
  if (!reference) throw new AppError('Wompi transaction reference is missing.', 422);

  let notification = null;
  await sequelize.transaction(async (databaseTransaction) => {
    const payment = await Payment.findOne({
      where: { provider_reference: reference, method: 'pse' },
      transaction: databaseTransaction,
      lock: databaseTransaction.LOCK.UPDATE
    });
    if (!payment) return;
    const order = await Order.findByPk(payment.order_id, { transaction: databaseTransaction, lock: databaseTransaction.LOCK.UPDATE });
    if (!order) return;
    const amountMatches = Number(transaction.amount_in_cents) === Math.round(Number(payment.amount) * 100);
    if (transaction.currency !== 'COP' || !amountMatches) throw new AppError('Wompi event does not match the order amount.', 422);

    const previousStatus = payment.status;
    const wasPaid = previousStatus === 'paid';
    const wasCancelled = previousStatus === 'cancelled' || order.order_status === 'cancelled';
    if (wasPaid && nextStatus !== 'paid') return;
    await payment.update({
      provider: 'wompi',
      status: nextStatus,
      paid_at: nextStatus === 'paid' ? (payment.paid_at || new Date()) : payment.paid_at,
      provider_response: {
        ...(Array.isArray(payment.provider_response?.previous_attempts) ? { previous_attempts: payment.provider_response.previous_attempts } : {}),
        transaction_id: transaction.id,
        reference,
        status: transaction.status,
        status_message: transaction.status_message || null,
        finalized_at: transaction.finalized_at || null
      }
    }, { transaction: databaseTransaction });
    await order.update({ payment_status: nextStatus }, { transaction: databaseTransaction });
    if (!wasPaid && nextStatus === 'paid') notification = { kind: wasCancelled ? 'approved_after_cancel' : 'approved', order };
    if (previousStatus !== nextStatus && nextStatus === 'failed') notification = { kind: 'failed', order };
  });

  if (notification?.kind === 'approved_after_cancel') {
    const { order } = notification;
    await Promise.all([
      notifyUser(order.customer_id, { type: 'PAYMENT_REVIEW_REQUIRED', title: 'Pago recibido para pedido cancelado', message: `Wompi aprobo el pago de ${order.order_number} despues de su cancelacion. El equipo revisara la devolucion.`, data: { order_id: order.id } }),
      notifyCompany(order.company_id, { type: 'PAYMENT_REVIEW_REQUIRED', title: 'Pago requiere revision', message: `El pago PSE de ${order.order_number} fue aprobado despues de la cancelacion. No prepares el pedido.`, data: { order_id: order.id } })
    ]);
    emitToUser(order.customer_id, 'order:payment_changed', { order_id: order.id, payment_status: 'paid' });
  } else if (notification?.kind === 'approved') {
    const { order } = notification;
    await Promise.all([
      notifyUser(order.customer_id, { type: 'PAYMENT_APPROVED', title: 'Pago PSE aprobado', message: `Tu pago del pedido ${order.order_number} fue aprobado.`, data: { order_id: order.id } }),
      notifyCompany(order.company_id, { type: 'ORDER_CREATED', title: 'Nuevo pedido pagado', message: `El pedido ${order.order_number} fue pagado por PSE y esta pendiente por revisar.`, data: { order_id: order.id } })
    ]);
    await emitCompany(order.company_id, 'order:created', { order_id: order.id, order_status: order.order_status });
    emitToUser(order.customer_id, 'order:payment_changed', { order_id: order.id, payment_status: 'paid' });
    if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) {
      const [fullOrder, customer, company] = await Promise.all([
        Order.findByPk(order.id),
        User.findByPk(order.customer_id, { attributes: ['email', 'name'] }),
        Company.findByPk(order.company_id, { attributes: ['name'] })
      ]);
      const total = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(fullOrder?.total || 0));
      if (customer?.email) {
        emailTemplateService.sendTemplate('purchase_thanks', customer.email, {
          name: customer.name || 'Cliente',
          order_number: order.order_number,
          company_name: company?.name || 'el negocio',
          order_total: total,
          order_url: `${process.env.CUSTOMER_APP_URL || 'https://allora.app'}/orders/${order.id}`
        }).catch((error) => console.error('Purchase email failed:', error.message));
      }
    }
  } else if (notification?.kind === 'failed') {
    await notifyUser(notification.order.customer_id, { type: 'PAYMENT_FAILED', title: 'Pago PSE no aprobado', message: `Wompi no aprobo el pago del pedido ${notification.order.order_number}.`, data: { order_id: notification.order.id } });
  }
  return success(res, { message: 'Wompi event processed', data: null });
});

function redirect(req, res) {
  const orderId = Number(req.query.order_id);
  const params = new URLSearchParams();
  if (Number.isSafeInteger(orderId) && orderId > 0) params.set('order_id', String(orderId));
  const transactionId = String(req.query.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (transactionId) params.set('transaction_id', transactionId);
  const query = params.toString();
  return res.redirect(302, `allora-customer://payments/wompi${query ? `?${query}` : ''}`);
}

module.exports = { events, getSettings, redirect, updateSettings };
