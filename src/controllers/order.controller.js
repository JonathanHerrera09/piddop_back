const crypto = require('node:crypto');
const AppError = require('../utils/app-error'); const asyncHandler = require('../utils/async-handler'); const { success } = require('../utils/api-response');
const { sequelize, Cart, CartItem, CartItemVariant, CartItemIngredient, CustomerAddress, Product, ProductIngredient, VariantOption, Company, Order, OrderItem, OrderItemVariant, OrderItemIngredient, OrderStatusHistory, CompanyReview, User, Delivery, DeliveryDriver, Coupon, CouponUsage, Payment } = require('../models');
const { validateCoupon } = require('../services/coupon.service');
const { assertPointWithinGlobalCoverage } = require('../services/platform-coverage.service');
const { assertCustomerCanCreateOrder, isPenaltyFreeOrderCancellation, suspendCustomerIfNeeded } = require('../services/customer-rules.service');
const { notifyUser, notifyCompany, notifyAvailableDrivers, emitCompany } = require('../services/notification.service');
const walletService = require('../services/company-wallet.service');
const emailTemplateService = require('../services/email-template.service');
const { assertCompanyOpen } = require('../services/company-availability.service');
const { emitToUser } = require('../websocket');
const { buildCheckout, getWompiConfiguration, getWompiTransaction } = require('../services/wompi.service');
const orderInclude = [{ model: Company, as: 'company', attributes: ['id', 'name', 'type', 'rating'] }, { model: CompanyReview, as: 'review', attributes: ['id', 'rating', 'comment', 'created_at'] }, { model: CustomerAddress, as: 'address' }, { model: OrderItem, as: 'items', include: [{ model: OrderItemVariant, as: 'variants' }, { model: OrderItemIngredient, as: 'ingredientAdjustments' }] }, { model: OrderStatusHistory, as: 'history', include: [{ model: User, as: 'changedBy', attributes: ['id', 'name', 'last_name'] }] }];
const orderNumber = () => `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const deliveryCode = () => crypto.randomInt(100000, 1000000).toString();
async function ownOrder(id, customerId) { const order = await Order.findOne({ where: { id, customer_id: customerId }, include: orderInclude }); if (!order) throw new AppError('Order not found', 404); return order; }
async function companyOrder(id, companyId) { const order = await Order.findOne({ where: { id, company_id: companyId }, include: orderInclude }); if (!order) throw new AppError('Order not found', 404); return order; }
async function addHistory(orderId, status, userId, notes, transaction) { await OrderStatusHistory.create({ order_id: orderId, status, changed_by_user_id: userId, notes: notes || null }, { transaction }); }
function assertAddressHasMapCoordinates(address) {
  const latitude = Number(address?.latitude);
  const longitude = Number(address?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError('Selecciona una direccion validada en el mapa antes de hacer la compra.', 422);
  }
}
const create = asyncHandler(async (req, res) => {
  if (!['cash', 'pse'].includes(req.body.payment_method) || !req.body.address_id) throw new AppError('address_id and valid payment_method are required', 422);
  const wompiConfiguration = req.body.payment_method === 'pse' ? await getWompiConfiguration() : null;
  if (wompiConfiguration) {
    buildCheckout({ amount: 1, configuration: wompiConfiguration, customer: null, reference: 'configuration-check' });
  }
  const address = await CustomerAddress.findOne({ where: { id: req.body.address_id, customer_id: req.auth.user.id } }); if (!address) throw new AppError('Address not found', 422);
  assertAddressHasMapCoordinates(address);
  const order = await sequelize.transaction(async (transaction) => {
    const cart = await Cart.findOne({ where: { customer_id: req.auth.user.id }, include: [{ model: CartItem, as: 'items', include: [{ model: CartItemVariant, as: 'variants', include: [{ model: VariantOption, as: 'option' }] }, { model: CartItemIngredient, as: 'ingredientAdjustments', include: [{ model: ProductIngredient, as: 'ingredient' }] }] }], transaction, lock: transaction.LOCK.UPDATE });
    if (!cart || !cart.items.length) throw new AppError('Cart is empty', 422);
    const company = await Company.findByPk(cart.company_id, { transaction }); if (!company || company.status !== 'active') throw new AppError('Company is not available', 422);
    assertCompanyOpen(company);
    await assertPointWithinGlobalCoverage({ latitude: address.latitude, longitude: address.longitude });
    await assertCustomerCanCreateOrder({ companyId: cart.company_id, transaction, userId: req.auth.user.id });
    let subtotal = 0;
    const lines = [];
    for (const item of cart.items) {
      const product = await Product.findOne({ where: { id: item.product_id, company_id: cart.company_id, status: 'active' }, transaction }); if (!product) throw new AppError('One or more cart products are not available', 422);
      const optionsTotal = item.variants.reduce((sum, variant) => sum + Number(variant.additional_price), 0);
      const lineTotal = (Number(product.base_price) + optionsTotal) * item.quantity; subtotal += lineTotal;
      lines.push({ item, product, optionsTotal, lineTotal });
    }
    let coupon = null; let discount = 0;
    if (cart.coupon_id) { coupon = await Coupon.findByPk(cart.coupon_id, { transaction, lock: transaction.LOCK.UPDATE }); discount = await validateCoupon({ coupon, userId: req.auth.user.id, cart, subtotal, categoryIds: lines.map((line) => line.product.category_id), transaction }); }
    const deliveryFee = 3000; const total = subtotal - discount + deliveryFee; const commission = walletService.calculateCompanyCommission({ company, subtotal });
    await walletService.assertCompanyCanCoverEstimatedCommission({ company, companyId: company.id, commissionAmount: commission, transaction });
    const created = await Order.create({ order_number: orderNumber(), customer_id: req.auth.user.id, company_id: cart.company_id, address_id: address.id, subtotal, delivery_fee: deliveryFee, discount, total, commission_amount: commission, coupon_id: coupon?.id || null, payment_method: req.body.payment_method, payment_status: 'pending', order_status: 'pending', delivery_code: deliveryCode(), customer_notes: req.body.customer_notes || null }, { transaction });
    for (const line of lines) { const orderItem = await OrderItem.create({ order_id: created.id, product_id: line.product.id, product_name: line.product.name, unit_base_price: line.product.base_price, quantity: line.item.quantity, variants_total: line.optionsTotal, line_total: line.lineTotal, customer_notes: line.item.customer_notes }, { transaction }); for (const variant of line.item.variants) await OrderItemVariant.create({ order_item_id: orderItem.id, variant_name: variant.option.Variant?.name || 'Option', option_name: variant.option.name, additional_price: variant.additional_price }, { transaction }); for (const ingredient of line.item.ingredientAdjustments) await OrderItemIngredient.create({ order_item_id: orderItem.id, ingredient_name: ingredient.ingredient?.name || 'Ingrediente', action: ingredient.action }, { transaction }); }
    if (coupon) { await CouponUsage.create({ coupon_id: coupon.id, user_id: req.auth.user.id, order_id: created.id, discount_amount: discount }, { transaction }); await coupon.increment('usage_count', { by: 1, transaction }); }
    await Payment.create({ order_id: created.id, method: req.body.payment_method, status: 'pending', amount: total, provider: req.body.payment_method === 'pse' ? 'wompi' : null, provider_reference: req.body.payment_method === 'pse' ? created.order_number : null }, { transaction });
    await addHistory(created.id, 'pending', req.auth.user.id, 'Pedido creado', transaction); await cart.destroy({ transaction }); return created;
  });
  if (order.payment_method === 'cash') {
    await notifyCompany(order.company_id, { type: 'ORDER_CREATED', title: 'Nuevo pedido', message: `El pedido ${order.order_number} esta pendiente por revisar.`, data: { order_id: order.id } });
    await emitCompany(order.company_id, 'order:created', { order_id: order.id, order_status: 'pending' });
  }
  const customerOrder = await ownOrder(order.id, req.auth.user.id);
  const wompiPayment = order.payment_method === 'pse'
    ? buildCheckout({
      amount: order.total,
      configuration: wompiConfiguration,
      customer: { email: req.auth.user.email, name: `${req.auth.user.name} ${req.auth.user.last_name}`.trim(), phone: req.auth.user.phone },
      orderId: order.id,
      reference: order.order_number
    })
    : null;
  if (order.payment_method === 'cash' && process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) {
    const total = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(customerOrder.total || 0));
    emailTemplateService.sendTemplate('purchase_thanks', req.auth.user.email, {
      name: req.auth.user.name,
      order_number: customerOrder.order_number,
      company_name: customerOrder.company?.name || 'el negocio',
      order_total: total,
      order_url: `${process.env.CUSTOMER_APP_URL || 'https://allora.app'}/orders/${customerOrder.id}`
    }).catch((error) => console.error('Purchase email failed:', error.message));
  }
  return success(res, { statusCode: 201, message: 'Order created successfully', data: { order: customerOrder, payment: wompiPayment } });
});
const listCustomer = asyncHandler(async (req, res) => success(res, { message: 'Orders retrieved successfully', data: { orders: await Order.findAll({ where: { customer_id: req.auth.user.id }, include: orderInclude, order: [['id', 'DESC']] }) } }));
const getCustomer = asyncHandler(async (req, res) => success(res, { message: 'Order retrieved successfully', data: { order: await ownOrder(req.params.id, req.auth.user.id) } }));

function storedWompiTransactionId(payment) {
  return payment?.provider_response?.transaction_id || null;
}

function assertWompiTransactionMatchesPayment(transaction, payment) {
  const amountMatches = Number(transaction.amount_in_cents) === Math.round(Number(payment.amount) * 100);
  if (transaction.reference !== payment.provider_reference || transaction.currency !== 'COP' || !amountMatches) {
    throw new AppError('La transaccion de Wompi no coincide con este pedido.', 409);
  }
}

async function announceReconciledWompiPayment(order) {
  await Promise.all([
    notifyUser(order.customer_id, { type: 'PAYMENT_APPROVED', title: 'Pago PSE aprobado', message: `Tu pago del pedido ${order.order_number} fue aprobado.`, data: { order_id: order.id } }),
    notifyCompany(order.company_id, { type: 'ORDER_CREATED', title: 'Nuevo pedido pagado', message: `El pedido ${order.order_number} fue pagado por PSE y esta pendiente por revisar.`, data: { order_id: order.id } })
  ]);
  await emitCompany(order.company_id, 'order:created', { order_id: order.id, order_status: order.order_status });
}

async function reconcileApprovedWompiPayment(orderId, wompiTransaction) {
  let changed = false;
  await sequelize.transaction(async (transaction) => {
    const lockedPayment = await Payment.findOne({ where: { order_id: orderId, method: 'pse' }, transaction, lock: transaction.LOCK.UPDATE });
    const lockedOrder = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lockedPayment || !lockedOrder || lockedPayment.status === 'paid') return;
    await lockedPayment.update({
      status: 'paid',
      paid_at: lockedPayment.paid_at || new Date(),
      provider_response: {
        transaction_id: wompiTransaction.id,
        reference: wompiTransaction.reference,
        status: wompiTransaction.status,
        status_message: wompiTransaction.status_message || null,
        finalized_at: wompiTransaction.finalized_at || null
      }
    }, { transaction });
    await lockedOrder.update({ payment_status: 'paid' }, { transaction });
    changed = true;
  });
  return changed;
}

async function retryPayment(req, res) {
  const order = await ownOrder(req.params.id, req.auth.user.id);
  if (order.payment_method !== 'pse') throw new AppError('Este pedido no usa PSE.', 409);
  if (order.order_status !== 'pending') throw new AppError('Solo puedes reintentar el pago de un pedido pendiente.', 409);
  if (order.payment_status === 'paid') throw new AppError('Este pedido ya esta pagado.', 409);

  const payment = await Payment.findOne({ where: { order_id: order.id, method: 'pse' } });
  if (!payment) throw new AppError('No encontramos el intento de pago de este pedido.', 404);
  const configuration = await getWompiConfiguration();
  const transactionId = storedWompiTransactionId(payment);

  if (transactionId) {
    const wompiTransaction = await getWompiTransaction(transactionId, configuration);
    assertWompiTransactionMatchesPayment(wompiTransaction, payment);

    if (wompiTransaction.status === 'APPROVED') {
      const changed = await reconcileApprovedWompiPayment(order.id, wompiTransaction);
      if (changed) await announceReconciledWompiPayment(order);
      emitToUser(order.customer_id, 'order:payment_changed', { order_id: order.id, payment_status: 'paid' });
      return success(res, { message: 'Payment was already approved', data: { order: await ownOrder(order.id, req.auth.user.id), payment: null } });
    }

    if (wompiTransaction.status === 'PENDING') {
      const asyncPaymentUrl = wompiTransaction.payment_method?.extra?.async_payment_url;
      if (!asyncPaymentUrl) throw new AppError('Wompi aun esta procesando este pago. Intenta de nuevo en unos minutos.', 409);
      return success(res, {
        message: 'Pending payment retrieved successfully',
        data: { order, payment: { amount_in_cents: wompiTransaction.amount_in_cents, checkout_url: asyncPaymentUrl, reference: payment.provider_reference } }
      });
    }
  }

  const shouldCreateAttempt = Boolean(transactionId) || payment.status === 'failed';
  const reference = shouldCreateAttempt ? `${order.order_number}-R${Date.now()}` : payment.provider_reference;
  if (shouldCreateAttempt) {
    const previousResponse = payment.provider_response;
    const previousAttempts = Array.isArray(previousResponse?.previous_attempts) ? previousResponse.previous_attempts : [];
    await sequelize.transaction(async (transaction) => {
      await payment.update({
        status: 'pending',
        provider_reference: reference,
        provider_response: { previous_attempts: [...previousAttempts, previousResponse].filter(Boolean) }
      }, { transaction });
      await order.update({ payment_status: 'pending' }, { transaction });
    });
  }

  const checkout = buildCheckout({
    amount: order.total,
    configuration,
    customer: { email: req.auth.user.email, name: `${req.auth.user.name} ${req.auth.user.last_name}`.trim(), phone: req.auth.user.phone },
    orderId: order.id,
    reference
  });
  return success(res, { message: 'Payment retry created successfully', data: { order: await ownOrder(order.id, req.auth.user.id), payment: checkout } });
}

const retryCustomerPayment = asyncHandler(retryPayment);

const cancel = asyncHandler(async (req, res) => {
  const order = await ownOrder(req.params.id, req.auth.user.id);
  if (order.order_status !== 'pending') throw new AppError('Only pending orders can be cancelled by the customer', 409);
  const penaltyFree = isPenaltyFreeOrderCancellation(order);
  const payment = await Payment.findOne({ where: { order_id: order.id } });

  if (penaltyFree && storedWompiTransactionId(payment)) {
    const configuration = await getWompiConfiguration();
    const wompiTransaction = await getWompiTransaction(storedWompiTransactionId(payment), configuration);
    assertWompiTransactionMatchesPayment(wompiTransaction, payment);
    if (wompiTransaction.status === 'APPROVED') {
      const changed = await reconcileApprovedWompiPayment(order.id, wompiTransaction);
      if (changed) await announceReconciledWompiPayment(order);
      emitToUser(order.customer_id, 'order:payment_changed', { order_id: order.id, payment_status: 'paid' });
      throw new AppError('El pago ya fue aprobado y el pedido no se puede cancelar como no pagado.', 409);
    }
    if (wompiTransaction.status === 'PENDING') {
      throw new AppError('Wompi aun esta procesando el pago. Espera su respuesta antes de cancelar.', 409);
    }
  }

  let blocked = false;
  await sequelize.transaction(async (transaction) => {
    const lockedOrder = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
    const lockedPayment = await Payment.findOne({ where: { order_id: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (lockedOrder.order_status !== 'pending') throw new AppError('El pedido ya cambio de estado y no se puede cancelar.', 409);
    if (lockedPayment?.status === 'paid' || lockedOrder.payment_status === 'paid') {
      throw new AppError('El pago ya fue aprobado y el pedido no se puede cancelar como no pagado.', 409);
    }
    await lockedOrder.update({ order_status: 'cancelled' }, { transaction });
    if (lockedPayment) await lockedPayment.update({ status: 'cancelled' }, { transaction });
    await addHistory(order.id, 'cancelled', req.auth.user.id, penaltyFree ? 'Pedido PSE no pagado cancelado sin penalizacion' : 'Cancelado por el cliente', transaction);

    const couponUsage = await CouponUsage.findOne({ where: { order_id: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (couponUsage) {
      const coupon = await Coupon.findByPk(couponUsage.coupon_id, { transaction, lock: transaction.LOCK.UPDATE });
      await couponUsage.destroy({ transaction });
      if (coupon) await coupon.update({ usage_count: Math.max(0, Number(coupon.usage_count || 0) - 1) }, { transaction });
    }

    if (!penaltyFree) blocked = await suspendCustomerIfNeeded({ transaction, userId: req.auth.user.id });
  });
  return success(res, {
    message: penaltyFree ? 'Order cancelled without penalty' : blocked ? 'Order cancelled successfully and account suspended due to excessive monthly cancellations' : 'Order cancelled successfully',
    data: {
      order: await ownOrder(order.id, req.auth.user.id),
      account_status: blocked ? 'suspended' : 'active',
      cancellation_penalized: !penaltyFree
    }
  });
});
const tracking = asyncHandler(async (req, res) => { const order = await ownOrder(req.params.id, req.auth.user.id); const data = { id: order.id, order_number: order.order_number, order_status: order.order_status, created_at: order.created_at }; if (order.order_status === 'on_the_way') { data.delivery_code = order.delivery_code; const delivery = await Delivery.findOne({ where: { order_id: order.id }, include: [{ model: DeliveryDriver, as: 'driver', attributes: ['current_latitude', 'current_longitude', 'location_updated_at'] }] }); if (delivery?.driver) data.driver_location = delivery.driver; } return success(res, { message: 'Order tracking retrieved successfully', data }); });
const listCompany = asyncHandler(async (req, res) => { const { Op } = require('sequelize'); const { paginate } = require('../utils/pagination'); const where = { company_id: req.companyAccess.company.id, [Op.and]: [{ [Op.or]: [{ payment_method: 'cash' }, { payment_status: 'paid' }] }] }; if (req.query.status) where.order_status = req.query.status; if (req.query.date_from || req.query.date_to) { where.created_at = {}; if (req.query.date_from) where.created_at[Op.gte] = new Date(`${req.query.date_from}T00:00:00`); if (req.query.date_to) where.created_at[Op.lte] = new Date(`${req.query.date_to}T23:59:59.999`); } if (req.query.search) where[Op.or] = [{ order_number: { [Op.like]: `%${req.query.search}%` } }, { order_status: { [Op.like]: `%${req.query.search}%` } }]; const page = await paginate(Order, { where, include: orderInclude, allowedSort: { id: 'id', created_at: 'created_at', order_status: 'order_status', total: 'total' } }, req.query); return success(res, { message: 'Company orders retrieved successfully', data: { orders: page.items, pagination: page.pagination } }); });
function customerStatusCopy(status) {
  const dictionary = {
    accepted: {
      title: 'Pedido aceptado',
      message: 'Tu pedido fue aceptado por el negocio y pronto comenzaran a prepararlo.'
    },
    rejected: {
      title: 'Pedido rechazado',
      message: 'Tu pedido fue rechazado por el negocio. Revisa el detalle para mas informacion.'
    },
    preparing: {
      title: 'Pedido en preparacion',
      message: 'Tu pedido ya esta en preparacion.'
    },
    waiting_delivery: {
      title: 'Esperando domiciliario',
      message: 'Tu pedido ya esta listo y estamos buscando un domiciliario.'
    }
  };

  return dictionary[status] || {
    title: 'Actualizacion de pedido',
    message: 'Tu pedido tuvo una actualizacion.'
  };
}

async function transition(req, res, nextStatus, requiredCurrent, note, requireReason = false) { const order = await companyOrder(req.params.id, req.companyAccess.company.id); if (!requiredCurrent.includes(order.order_status)) throw new AppError('Invalid order status transition', 409); if (nextStatus === 'accepted' && order.payment_method === 'pse' && order.payment_status !== 'paid') throw new AppError('El pedido PSE no se puede aceptar hasta que Wompi confirme el pago.', 409); const names = req.companyAccess.companyUser.companyRoles.map((role) => role.name); if (names.includes('COOK') && !names.some((name) => ['OWNER', 'MANAGER'].includes(name)) && nextStatus !== 'preparing') throw new AppError('COOK can only mark an accepted order as preparing', 403); if (requireReason && !req.body.rejection_reason?.trim()) throw new AppError('A rejection reason is required', 422); await sequelize.transaction(async (transaction) => { await order.update({ order_status: nextStatus, rejection_reason: requireReason ? req.body.rejection_reason.trim() : order.rejection_reason }, { transaction }); await addHistory(order.id, nextStatus, req.auth.user.id, requireReason ? req.body.rejection_reason : note, transaction); }); const statusCopy = customerStatusCopy(nextStatus); await notifyUser(order.customer_id, { type: `ORDER_${nextStatus.toUpperCase()}`, title: statusCopy.title, message: statusCopy.message, data: { order_id: order.id, order_status: nextStatus } }); emitToUser(order.customer_id, 'order:status_changed', { order_id: order.id, order_status: nextStatus }); if (nextStatus === 'waiting_delivery') await notifyAvailableDrivers({ type: 'DELIVERY_AVAILABLE', title: 'Pedido disponible', message: 'Hay un pedido nuevo listo para entregar.', data: { order_id: order.id } }); return success(res, { message: 'Order status updated successfully', data: { order: await companyOrder(order.id, req.companyAccess.company.id) } }); }
const getCompany = asyncHandler(async (req, res) => success(res, { message: 'Company order retrieved successfully', data: { order: await companyOrder(req.params.id, req.companyAccess.company.id) } }));
const accept = asyncHandler((req, res) => transition(req, res, 'accepted', ['pending'], 'Accepted by company'));
const reject = asyncHandler((req, res) => transition(req, res, 'rejected', ['pending'], null, true));
const preparing = asyncHandler((req, res) => transition(req, res, 'preparing', ['accepted'], 'Preparation started'));
const waitingDelivery = asyncHandler((req, res) => transition(req, res, 'waiting_delivery', ['preparing'], 'Ready for delivery'));
module.exports = { create, listCustomer, getCustomer, retryCustomerPayment, cancel, tracking, listCompany, getCompany, accept, reject, preparing, waitingDelivery };
