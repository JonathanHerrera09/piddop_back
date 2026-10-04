const crypto = require('node:crypto');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const { sequelize, Company, CompanyWallet, CompanySettlement, CompanySettlementItem, Payment, Order, WalletTransaction, AuditLog } = require('../models');
const walletService = require('./company-wallet.service');

const money = (value) => Number(Number(value || 0).toFixed(2));

function periodBounds(dateFrom, dateTo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo || '')) {
    throw new AppError('date_from and date_to must use YYYY-MM-DD', 422);
  }
  const start = new Date(`${dateFrom}T00:00:00-05:00`);
  const endInclusive = new Date(`${dateTo}T23:59:59.999-05:00`);
  const validCalendarDate = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(`${value}T00:00:00Z`);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
  };
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime()) || !validCalendarDate(dateFrom) || !validCalendarDate(dateTo) || start > endInclusive) {
    throw new AppError('The settlement period is invalid', 422);
  }
  if ((endInclusive.getTime() - start.getTime()) / 86400000 > 366) {
    throw new AppError('A settlement period cannot exceed 366 days', 422);
  }
  return { start, end: endInclusive };
}

function snapshot(payment) {
  const order = payment.order;
  const subtotal = money(order.subtotal);
  const discount = money(order.discount);
  const netProductSale = money(subtotal - discount);
  const commission = money(order.commission_amount);
  const payable = money(netProductSale - commission);
  if (payable < 0) throw new AppError(`Order ${order.order_number} has an invalid negative payable amount`, 409);
  return {
    order_id: order.id, payment_id: payment.id, order_number: order.order_number,
    payment_provider: payment.provider || null, payment_reference: payment.provider_reference || null, paid_at: payment.paid_at,
    subtotal, discount, net_product_sale: netProductSale, delivery_fee: money(order.delivery_fee),
    customer_paid_total: money(payment.amount ?? order.total), commission_amount: commission, company_payable: payable
  };
}

function totals(items) {
  const result = items.reduce((sum, item) => ({
    gross_sales: money(sum.gross_sales + item.subtotal), discounts: money(sum.discounts + item.discount),
    net_product_sales: money(sum.net_product_sales + item.net_product_sale), delivery_fees: money(sum.delivery_fees + item.delivery_fee),
    customer_paid_total: money(sum.customer_paid_total + item.customer_paid_total),
    platform_commission: money(sum.platform_commission + item.commission_amount), amount_payable: money(sum.amount_payable + item.company_payable)
  }), { gross_sales: 0, discounts: 0, net_product_sales: 0, delivery_fees: 0, customer_paid_total: 0, platform_commission: 0, amount_payable: 0 });
  return { ...result, order_count: items.length };
}

function salesTotals(payments) {
  return payments.reduce((result, payment) => {
    const sale = money(Number(payment.order.subtotal || 0) - Number(payment.order.discount || 0));
    const commission = money(payment.order.commission_amount);
    result.total_sales = money(result.total_sales + sale);
    result.total_commissions = money(result.total_commissions + commission);
    result.customer_paid = money(result.customer_paid + Number(payment.amount || 0));
    if (payment.method === 'pse') result.pse_sales = money(result.pse_sales + sale);
    if (payment.method === 'cash') result.cash_sales = money(result.cash_sales + sale);
    result.orders += 1;
    return result;
  }, { orders: 0, total_sales: 0, pse_sales: 0, cash_sales: 0, total_commissions: 0, customer_paid: 0 });
}

async function overview(companyId, dateFrom, dateTo, options = {}) {
  const { transaction, pending: suppliedPending, company: suppliedCompany } = options;
  if (!Number.isSafeInteger(Number(companyId)) || Number(companyId) <= 0) throw new AppError('company_id must be a valid positive integer', 422);
  const company = suppliedCompany || await Company.findByPk(companyId, { transaction });
  if (!company) throw new AppError('Company not found', 404);
  if (company.type === 'services') throw new AppError('Service appointments do not have a supported PSE settlement flow yet', 422);
  const { start, end } = periodBounds(dateFrom, dateTo);
  await walletService.getOrCreateWallet(company.id, transaction);
  const [payments, walletTransactions, settledItems, wallet, pending, openingMovement, closingMovement] = await Promise.all([
    Payment.findAll({
      where: { status: 'paid', paid_at: { [Op.between]: [start, end] } },
      attributes: ['id', 'method', 'amount'],
      include: [{ model: Order, as: 'order', required: true, attributes: ['id', 'subtotal', 'discount', 'commission_amount'], where: { company_id: company.id, order_status: 'delivered', payment_status: 'paid' } }],
      transaction
    }),
    WalletTransaction.findAll({ where: { company_id: company.id, created_at: { [Op.between]: [start, end] } }, attributes: ['type', 'amount'], transaction }),
    CompanySettlementItem.findAll({
      where: { paid_at: { [Op.between]: [start, end] } }, attributes: ['company_payable'],
      include: [{ model: CompanySettlement, as: 'settlement', required: true, attributes: [], where: { company_id: company.id } }],
      transaction
    }),
    CompanyWallet.findOne({ where: { company_id: company.id }, transaction }),
    suppliedPending || eligibleItems(company.id, dateFrom, dateTo, transaction),
    WalletTransaction.findOne({ where: { company_id: company.id, created_at: { [Op.lt]: start } }, attributes: ['balance_after'], order: [['created_at', 'DESC'], ['id', 'DESC']], transaction }),
    WalletTransaction.findOne({ where: { company_id: company.id, created_at: { [Op.lte]: end } }, attributes: ['balance_after'], order: [['created_at', 'DESC'], ['id', 'DESC']], transaction })
  ]);
  const walletPeriod = walletTransactions.reduce((result, movement) => {
    const amount = Number(movement.amount || 0);
    if (movement.type === 'topup') result.topups = money(result.topups + Math.max(amount, 0));
    if (amount > 0) result.credits = money(result.credits + amount);
    if (amount < 0) result.debits = money(result.debits + Math.abs(amount));
    if (movement.type === 'order_commission') result.commissions = money(result.commissions + Math.abs(amount));
    return result;
  }, { topups: 0, credits: 0, debits: 0, commissions: 0 });
  const alreadySettled = money(settledItems.reduce((sum, item) => sum + Number(item.company_payable || 0), 0));
  return {
    company,
    period_start: start,
    period_end: end,
    sales: salesTotals(payments),
    wallet: {
      balance: money(wallet.balance),
      status: wallet.status,
      opening_balance: money(openingMovement?.balance_after),
      closing_balance: money(closingMovement?.balance_after),
      period: walletPeriod,
    },
    pse: {
      total_payable: money(alreadySettled + pending.totals.amount_payable),
      already_settled: alreadySettled,
      pending_payable: pending.totals.amount_payable,
      pending_orders: pending.totals.order_count
    }
  };
}

async function eligibleItems(companyId, dateFrom, dateTo, transaction, lock = false) {
  if (!Number.isSafeInteger(Number(companyId)) || Number(companyId) <= 0) throw new AppError('company_id must be a valid positive integer', 422);
  const company = await Company.findByPk(companyId, { transaction });
  if (!company) throw new AppError('Company not found', 404);
  if (company.type === 'services') throw new AppError('Service appointments do not have a supported PSE settlement flow yet', 422);
  const { start, end } = periodBounds(dateFrom, dateTo);
  const settled = await CompanySettlementItem.findAll({
    attributes: ['order_id'],
    include: [{ model: CompanySettlement, as: 'settlement', attributes: [], required: true, where: { company_id: company.id } }],
    raw: true,
    transaction
  });
  const excluded = settled.map((item) => item.order_id);
  const orderWhere = { company_id: company.id, order_status: 'delivered', payment_method: 'pse', payment_status: 'paid' };
  if (excluded.length) orderWhere.id = { [Op.notIn]: excluded };
  const payments = await Payment.findAll({
    where: { method: 'pse', status: 'paid', paid_at: { [Op.between]: [start, end] } },
    include: [{ model: Order, as: 'order', required: true, where: orderWhere }],
    order: [['paid_at', 'ASC'], ['id', 'ASC']], transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  const items = payments.map(snapshot);
  return { company, period_start: start, period_end: end, items, totals: totals(items) };
}

async function preview(companyId, dateFrom, dateTo) {
  return eligibleItems(companyId, dateFrom, dateTo);
}

// These are the rows displayed in the billing work queue.  Keeping this query
// server-side is important: a row can disappear between the time it is shown
// and the time the operator invoices it.
async function eligibleOrders() {
  const settled = await CompanySettlementItem.findAll({ attributes: ['order_id'], raw: true });
  const excluded = settled.map((item) => item.order_id);
  const orderWhere = { order_status: 'delivered', payment_method: 'pse', payment_status: 'paid' };
  if (excluded.length) orderWhere.id = { [Op.notIn]: excluded };
  const payments = await Payment.findAll({
    where: { method: 'pse', status: 'paid' },
    include: [{ model: Order, as: 'order', required: true, where: orderWhere, include: [{ model: Company, as: 'company', required: true, attributes: ['id', 'name', 'email', 'logo'] }] }],
    order: [['paid_at', 'ASC'], ['id', 'ASC']]
  });
  return payments.map((payment) => ({ ...snapshot(payment), company_id: payment.order.company_id, company: payment.order.company }));
}

async function selectedItems(orderIds, transaction) {
  const uniqueIds = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(Number))];
  if (!uniqueIds.length || uniqueIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new AppError('Selecciona al menos una orden válida.', 422);
  const settled = await CompanySettlementItem.findAll({ where: { order_id: { [Op.in]: uniqueIds } }, attributes: ['order_id'], transaction, lock: transaction.LOCK.UPDATE });
  if (settled.length) throw new AppError('Una o más órdenes ya fueron facturadas.', 409);
  const payments = await Payment.findAll({
    where: { method: 'pse', status: 'paid' },
    include: [{ model: Order, as: 'order', required: true, where: { id: { [Op.in]: uniqueIds }, order_status: 'delivered', payment_method: 'pse', payment_status: 'paid' }, include: [{ model: Company, as: 'company', required: true }] }],
    transaction, lock: transaction.LOCK.UPDATE
  });
  if (payments.length !== uniqueIds.length) throw new AppError('Alguna orden ya no está disponible para facturar.', 409);
  const companyIds = [...new Set(payments.map((payment) => Number(payment.order.company_id)))];
  if (companyIds.length !== 1) throw new AppError('Solo puedes facturar órdenes de una misma empresa.', 422);
  const items = payments.map(snapshot);
  return { company: payments[0].order.company, companyId: companyIds[0], items, totals: totals(items) };
}

async function createSelected({ orderIds, payoutReference, notes, actor, request }) {
  if (!String(payoutReference || '').trim()) throw new AppError('La referencia de pago es obligatoria.', 422);
  try {
    return await sequelize.transaction(async (transaction) => {
      const data = await selectedItems(orderIds, transaction);
      const paidTimes = data.items.map((item) => new Date(item.paid_at).getTime());
      const issuedAt = new Date();
      const canonical = JSON.stringify({ company_id: data.companyId, order_ids: data.items.map((item) => item.order_id).sort((a, b) => a - b), payout_reference: String(payoutReference).trim(), items: data.items });
      const settlement = await CompanySettlement.create({
        settlement_number: `PENDING-${crypto.randomUUID().replace(/-/g, '')}`, company_id: data.companyId,
        period_start: new Date(Math.min(...paidTimes)), period_end: new Date(Math.max(...paidTimes)), closure_type: 'custom', status: 'issued', currency: 'COP',
        ...data.totals, notes: notes?.trim() || null, issued_at: issuedAt, payout_reference: String(payoutReference).trim(),
        period_orders_count: data.items.length, period_total_sales: data.totals.net_product_sales, period_pse_sales: data.totals.net_product_sales,
        period_cash_sales: 0, period_customer_paid: data.totals.customer_paid_total, period_commissions: data.totals.platform_commission,
        period_topups: 0, period_wallet_credits: 0, period_wallet_debits: 0, opening_wallet_balance: 0, closing_wallet_balance: 0,
        created_by: actor.id, document_hash: crypto.createHash('sha256').update(canonical).digest('hex')
      }, { transaction });
      await settlement.update({ settlement_number: `FAC-${issuedAt.getFullYear()}-${String(settlement.id).padStart(8, '0')}` }, { transaction });
      await CompanySettlementItem.bulkCreate(data.items.map((item) => ({ ...item, settlement_id: settlement.id })), { transaction });
      await AuditLog.create({ user_id: actor.id, action: 'settlement.invoiced', entity_type: 'company_settlement', entity_id: settlement.id, old_values: null,
        new_values: { settlement_number: settlement.settlement_number, company_id: data.companyId, payout_reference: String(payoutReference).trim(), ...data.totals }, ip_address: request.ip || null, user_agent: request.get('user-agent') || null }, { transaction });
      return getById(settlement.id, { transaction });
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') throw new AppError('Una o más órdenes ya fueron facturadas.', 409);
    throw error;
  }
}

async function create({ companyId, dateFrom, dateTo, notes, closureType, paidNow, payoutReference, payoutMethod, paidAt, actor, request }) {
  try {
    return await sequelize.transaction(async (transaction) => {
    const data = await eligibleItems(companyId, dateFrom, dateTo, transaction, true);
    const overlapping = await CompanySettlement.findOne({ where: { company_id: companyId, period_start: { [Op.lte]: data.period_end }, period_end: { [Op.gte]: data.period_start } }, transaction, lock: transaction.LOCK.UPDATE });
    if (overlapping) throw new AppError(`The selected period overlaps closure ${overlapping.settlement_number}`, 409);
    const financial = await overview(companyId, dateFrom, dateTo, { transaction, pending: data, company: data.company });
    const issuedAt = new Date();
    const normalizedClosureType = ['weekly', 'monthly'].includes(closureType) ? closureType : 'custom';
    const initialStatus = paidNow ? 'paid' : 'issued';
    const paidAtDate = paidAt ? new Date(paidAt) : issuedAt;
    if (paidNow && data.totals.amount_payable > 0 && !payoutReference?.trim()) throw new AppError('payout_reference is required when the closure is paid', 422);
    if (paidNow && Number.isNaN(paidAtDate.getTime())) throw new AppError('paid_at must be a valid date', 422);
    const canonical = JSON.stringify({ company_id: Number(companyId), closure_type: normalizedClosureType, period_start: data.period_start.toISOString(), period_end: data.period_end.toISOString(), financial, items: data.items });
    const settlement = await CompanySettlement.create({
      settlement_number: `PENDING-${crypto.randomUUID().replace(/-/g, '')}`, company_id: companyId, period_start: data.period_start, period_end: data.period_end,
      closure_type: normalizedClosureType, status: initialStatus, currency: 'COP', ...data.totals, notes: notes?.trim() || null, issued_at: issuedAt,
      period_orders_count: financial.sales.orders, period_total_sales: financial.sales.total_sales, period_pse_sales: financial.sales.pse_sales,
      period_cash_sales: financial.sales.cash_sales, period_customer_paid: financial.sales.customer_paid,
      period_commissions: financial.wallet.period.commissions, period_topups: financial.wallet.period.topups,
      period_wallet_credits: financial.wallet.period.credits, period_wallet_debits: financial.wallet.period.debits,
      opening_wallet_balance: financial.wallet.opening_balance, closing_wallet_balance: financial.wallet.closing_balance,
      payout_reference: paidNow ? payoutReference?.trim() || 'SIN-DESEMBOLSO' : null,
      payout_method: paidNow ? payoutMethod?.trim() || (data.totals.amount_payable > 0 ? 'bank_transfer' : 'no_transfer') : null,
      paid_at: paidNow ? paidAtDate : null,
      created_by: actor.id, document_hash: crypto.createHash('sha256').update(canonical).digest('hex')
    }, { transaction });
    await settlement.update({ settlement_number: `LIQ-${issuedAt.getFullYear()}-${String(settlement.id).padStart(8, '0')}` }, { transaction });
    if (data.items.length) await CompanySettlementItem.bulkCreate(data.items.map((item) => ({ ...item, settlement_id: settlement.id })), { transaction });
    await AuditLog.create({ user_id: actor.id, action: 'settlement.issued', entity_type: 'company_settlement', entity_id: settlement.id,
      old_values: null, new_values: { settlement_number: settlement.settlement_number, company_id: Number(companyId), closure_type: normalizedClosureType, status: initialStatus, ...data.totals },
      ip_address: request.ip || null, user_agent: request.get('user-agent') || null }, { transaction });
    return getById(settlement.id, { transaction });
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') throw new AppError('One or more orders were already included in another settlement', 409);
    throw error;
  }
}

async function getById(id, options = {}) {
  const settlement = await CompanySettlement.findByPk(id, {
    include: [{ model: Company, as: 'company' }, { model: CompanySettlementItem, as: 'items' }],
    order: [[{ model: CompanySettlementItem, as: 'items' }, 'paid_at', 'ASC']], transaction: options.transaction
  });
  if (!settlement) throw new AppError('Settlement not found', 404);
  return settlement;
}

async function markPaid(id, { payoutReference, payoutMethod, paidAt, actor, request }) {
  const paidAtDate = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(paidAtDate.getTime())) throw new AppError('paid_at must be a valid date', 422);
  return sequelize.transaction(async (transaction) => {
    const settlement = await CompanySettlement.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!settlement) throw new AppError('Settlement not found', 404);
    if (settlement.status === 'paid') throw new AppError('Settlement is already paid', 409);
    if (Number(settlement.amount_payable || 0) > 0 && !payoutReference?.trim()) throw new AppError('payout_reference is required', 422);
    const oldValues = settlement.toJSON();
    await settlement.update({ status: 'paid', payout_reference: payoutReference?.trim() || 'SIN-DESEMBOLSO', payout_method: payoutMethod?.trim() || (Number(settlement.amount_payable || 0) > 0 ? 'bank_transfer' : 'no_transfer'), paid_at: paidAtDate }, { transaction });
    await AuditLog.create({ user_id: actor.id, action: 'settlement.paid', entity_type: 'company_settlement', entity_id: settlement.id,
      old_values: { status: oldValues.status }, new_values: { status: 'paid', payout_reference: settlement.payout_reference, payout_method: settlement.payout_method, paid_at: settlement.paid_at },
      ip_address: request.ip || null, user_agent: request.get('user-agent') || null }, { transaction });
    return getById(id, { transaction });
  });
}

module.exports = { periodBounds, preview, overview, create, createSelected, eligibleOrders, getById, markPaid, totals, salesTotals };
