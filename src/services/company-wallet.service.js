const { Op, fn, col } = require('sequelize');
const AppError = require('../utils/app-error');
const { parsePagination } = require('../utils/pagination');
const {
  sequelize,
  Company,
  CompanyWallet,
  WalletTransaction,
  Order,
  PlatformSetting
} = require('../models');

const DEFAULT_LOW_BALANCE_THRESHOLD = 10000;
const LOW_BALANCE_SETTING_KEY = 'company_wallet_low_balance_threshold';

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function getLowBalanceThreshold(transaction) {
  const setting = await PlatformSetting.findOne({
    where: { key: LOW_BALANCE_SETTING_KEY },
    transaction
  });

  const configuredValue = Number(setting?.value_json?.amount ?? setting?.value_json?.value);
  return Number.isFinite(configuredValue) && configuredValue >= 0
    ? roundMoney(configuredValue)
    : DEFAULT_LOW_BALANCE_THRESHOLD;
}

function normalizeWalletStatus(balance, lowBalanceThreshold) {
  const normalizedBalance = roundMoney(balance);

  if (normalizedBalance <= 0) return 'insufficient_balance';
  if (normalizedBalance <= roundMoney(lowBalanceThreshold)) return 'low_balance';
  return 'active';
}

function getCommissionRate(company) {
  const percentage = Number(company?.commission_percentage);
  return Number.isFinite(percentage) && percentage >= 0 ? percentage : 0;
}

function calculateCompanyCommission({ company, subtotal }) {
  return roundMoney(roundMoney(subtotal) * (getCommissionRate(company) / 100));
}

async function getOrCreateWallet(companyId, transaction, options = {}) {
  const query = {
    where: { company_id: companyId },
    transaction
  };

  if (options.lock && transaction) {
    query.lock = transaction.LOCK.UPDATE;
  }

  let wallet = await CompanyWallet.findOne(query);
  if (wallet) return wallet;

  const lowBalanceThreshold = await getLowBalanceThreshold(transaction);
  wallet = await CompanyWallet.create({
    company_id: companyId,
    balance: 0,
    currency: 'COP',
    status: normalizeWalletStatus(0, lowBalanceThreshold)
  }, { transaction });

  return wallet;
}

async function refreshWalletStatus(wallet, transaction) {
  const lowBalanceThreshold = await getLowBalanceThreshold(transaction);
  const nextStatus = normalizeWalletStatus(wallet.balance, lowBalanceThreshold);

  if (wallet.status !== nextStatus) {
    await wallet.update({ status: nextStatus }, { transaction });
  }

  return wallet;
}

async function createWalletTransaction({
  wallet,
  type,
  amount,
  description,
  referenceType = null,
  referenceId = null,
  metadata = null,
  createdBy = null,
  transaction
}) {
  const normalizedAmount = roundMoney(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
    throw new AppError('El monto de la transaccion debe ser diferente de cero.', 422);
  }

  const balanceBefore = roundMoney(wallet.balance);
  const balanceAfter = roundMoney(balanceBefore + normalizedAmount);

  if (balanceAfter < 0) {
    throw new AppError('La empresa no tiene saldo suficiente para esta operacion.', 409);
  }

  await wallet.update({ balance: balanceAfter }, { transaction });
  await refreshWalletStatus(wallet, transaction);

  const created = await WalletTransaction.create({
    company_wallet_id: wallet.id,
    company_id: wallet.company_id,
    type,
    amount: normalizedAmount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    reference_type: referenceType,
    reference_id: referenceId,
    description: description || null,
    metadata: metadata || null,
    created_by: createdBy
  }, { transaction });

  return { wallet, transactionRecord: created };
}

async function topupCompanyWallet({
  companyId,
  amount,
  description,
  metadata = null,
  createdBy = null,
  transaction
}) {
  const wallet = await getOrCreateWallet(companyId, transaction, { lock: true });
  return createWalletTransaction({
    wallet,
    type: 'topup',
    amount: Math.abs(roundMoney(amount)),
    description: description || 'Recarga manual de saldo',
    metadata,
    createdBy,
    transaction
  });
}

async function adjustCompanyWallet({
  companyId,
  amount,
  type,
  description,
  metadata = null,
  createdBy = null,
  transaction
}) {
  if (!['manual_credit', 'manual_debit', 'bonus', 'refund', 'adjustment'].includes(type)) {
    throw new AppError('Tipo de ajuste no permitido.', 422);
  }

  const normalizedAmount = roundMoney(amount);
  const isDebit = type === 'manual_debit';
  const finalAmount = isDebit ? -Math.abs(normalizedAmount) : Math.abs(normalizedAmount);
  const wallet = await getOrCreateWallet(companyId, transaction, { lock: true });

  return createWalletTransaction({
    wallet,
    type,
    amount: finalAmount,
    description: description || 'Ajuste manual de saldo',
    metadata,
    createdBy,
    transaction
  });
}

async function assertCompanyCanCoverEstimatedCommission({
  company,
  companyId,
  commissionAmount,
  transaction
}) {
  const normalizedCommission = roundMoney(commissionAmount);
  if (normalizedCommission <= 0) return null;

  const targetCompanyId = companyId || company?.id;
  if (!targetCompanyId) throw new AppError('No fue posible identificar la empresa.', 500);

  const wallet = await getOrCreateWallet(targetCompanyId, transaction, { lock: true });
  if (roundMoney(wallet.balance) < normalizedCommission) {
    throw new AppError(
      'La empresa no tiene saldo suficiente para cubrir la comision de este pedido.',
      409
    );
  }

  return wallet;
}

async function chargeOrderCommission({ orderId, changedByUserId = null, transaction }) {
  const order = await Order.findByPk(orderId, {
    include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'commission_percentage'] }],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  if (!order) throw new AppError('Pedido no encontrado para cobrar comision.', 404);

  const commissionAmount = roundMoney(order.commission_amount);
  if (commissionAmount <= 0) {
    return { already_charged: false, skipped: true, wallet: await getOrCreateWallet(order.company_id, transaction, { lock: true }) };
  }

  const existing = await WalletTransaction.findOne({
    where: {
      type: 'order_commission',
      reference_type: 'ORDER',
      reference_id: order.id
    },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  if (existing) {
    return { already_charged: true, skipped: false, transactionRecord: existing };
  }

  const wallet = await getOrCreateWallet(order.company_id, transaction, { lock: true });
  if (roundMoney(wallet.balance) < commissionAmount) {
    throw new AppError(
      `La empresa ${order.company?.name || ''} no tiene saldo suficiente para descontar la comision del pedido.`,
      409
    );
  }

  return createWalletTransaction({
    wallet,
    type: 'order_commission',
    amount: -commissionAmount,
    description: `Cobro de comision del pedido ${order.order_number}`,
    referenceType: 'ORDER',
    referenceId: order.id,
    metadata: {
      order_number: order.order_number,
      commission_percentage: getCommissionRate(order.company),
      product_subtotal: roundMoney(order.subtotal),
      discount: roundMoney(order.discount),
      sale_amount: roundMoney(Number(order.subtotal || 0) - Number(order.discount || 0)),
      commission_amount: commissionAmount
    },
    createdBy: changedByUserId,
    transaction
  });
}

async function getWalletSummary(companyId) {
  const wallet = await getOrCreateWallet(companyId);
  await refreshWalletStatus(wallet);

  const company = await Company.findByPk(companyId, {
    attributes: ['id', 'name', 'commission_percentage']
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayOrders, todayCommissions, walletTotals, lowBalanceThreshold] = await Promise.all([
    Order.count({ where: { company_id: companyId, created_at: { [Op.gte]: todayStart } } }),
    WalletTransaction.findOne({
      where: {
        company_id: companyId,
        type: 'order_commission',
        created_at: { [Op.gte]: todayStart }
      },
      attributes: [[fn('COALESCE', fn('SUM', fn('ABS', col('amount'))), 0), 'total']],
      raw: true
    }),
    WalletTransaction.findOne({
      where: { company_id: companyId },
      attributes: [
        [fn('COALESCE', fn('SUM', sequelize.literal('CASE WHEN amount > 0 THEN amount ELSE 0 END')), 0), 'credits'],
        [fn('COALESCE', fn('SUM', sequelize.literal('CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END')), 0), 'debits'],
        [fn('COALESCE', fn('SUM', sequelize.literal("CASE WHEN type = 'order_commission' THEN ABS(amount) ELSE 0 END")), 0), 'commissions']
      ],
      raw: true
    }),
    getLowBalanceThreshold()
  ]);

  return {
    wallet,
    company,
    low_balance_threshold: lowBalanceThreshold,
    today: {
      orders: todayOrders,
      commissions: roundMoney(todayCommissions?.total)
    },
    lifetime: {
      credits: roundMoney(walletTotals?.credits),
      debits: roundMoney(walletTotals?.debits),
      commissions: roundMoney(walletTotals?.commissions)
    }
  };
}

async function listWalletTransactions(companyId, options = {}) {
  const filters = typeof options === 'object' && options !== null ? options : { limit: options };
  const pagination = parsePagination(filters, { defaultPageSize: 50, allowedSort: { id: 'id', created_at: 'created_at', amount: 'amount', type: 'type' } });
  const where = { company_id: companyId };
  const allowedTypes = new Set(['topup', 'order_commission', 'refund', 'bonus', 'manual_credit', 'manual_debit', 'adjustment']);

  if (allowedTypes.has(filters.type)) {
    where.type = filters.type;
  }

  const fromDate = filters.date_from ? new Date(`${filters.date_from}T00:00:00`) : null;
  const toDate = filters.date_to ? new Date(`${filters.date_to}T23:59:59.999`) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    where.created_at = { [Op.gte]: fromDate };
  }
  if (toDate && !Number.isNaN(toDate.getTime())) {
    where.created_at = { ...(where.created_at || {}), [Op.lte]: toDate };
  }

  const search = String(filters.search || '').trim();
  if (search) {
    where[Op.or] = [{ description: { [Op.like]: `%${search}%` } }];
    if (/^\d+$/.test(search)) {
      where[Op.or].push({ reference_id: Number(search) });
    }
  }

  await getOrCreateWallet(companyId);

  const result = await WalletTransaction.findAndCountAll({
    where,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: pagination.limit,
    offset: pagination.offset
  });
  const transactions = result.rows;

  // Complete older commission movements too, so the business can always see
  // the exact sale amount used for the charge without exposing delivery fees.
  const orderIds = transactions
    .filter((item) => item.type === 'order_commission' && item.reference_type === 'ORDER' && item.reference_id)
    .map((item) => Number(item.reference_id));
  const orders = orderIds.length
    ? await Order.findAll({
      where: { id: { [Op.in]: orderIds }, company_id: companyId },
      attributes: ['id', 'order_number', 'subtotal', 'discount', 'commission_amount']
    })
    : [];
  const ordersById = new Map(orders.map((order) => [Number(order.id), order]));

  const items = transactions.map((item) => {
    const movement = item.toJSON();
    const order = ordersById.get(Number(movement.reference_id));
    if (!order) return movement;

    const metadata = movement.metadata && typeof movement.metadata === 'object'
      ? movement.metadata
      : {};
    const productSubtotal = roundMoney(order.subtotal);
    const discount = roundMoney(order.discount);
    const saleAmount = roundMoney(productSubtotal - discount);
    const chargedCommission = Math.abs(roundMoney(movement.amount || order.commission_amount));

    return {
      ...movement,
      metadata: {
        ...metadata,
        order_number: metadata.order_number || order.order_number,
        product_subtotal: productSubtotal,
        discount,
        sale_amount: saleAmount,
        commission_amount: chargedCommission,
        commission_percentage: metadata.commission_percentage
          ?? (saleAmount > 0 ? roundMoney((chargedCommission / saleAmount) * 100) : 0)
      }
    };
  });
  const totalItems = Number(result.count);
  return { items, pagination: { page: pagination.page, page_size: pagination.pageSize, total_items: totalItems, total_pages: Math.ceil(totalItems / pagination.pageSize), has_previous: pagination.page > 1, has_next: pagination.page < Math.ceil(totalItems / pagination.pageSize) } };
}

module.exports = {
  DEFAULT_LOW_BALANCE_THRESHOLD,
  LOW_BALANCE_SETTING_KEY,
  roundMoney,
  getLowBalanceThreshold,
  normalizeWalletStatus,
  getCommissionRate,
  calculateCompanyCommission,
  getOrCreateWallet,
  refreshWalletStatus,
  topupCompanyWallet,
  adjustCompanyWallet,
  assertCompanyCanCoverEstimatedCommission,
  chargeOrderCommission,
  getWalletSummary,
  listWalletTransactions
};
