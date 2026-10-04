const { Op } = require('sequelize');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { success } = require('../utils/api-response');
const { paginate } = require('../utils/pagination');
const { CompanySettlement, Company } = require('../models');
const settlementService = require('../services/settlement.service');
const { renderSettlementPdf } = require('../services/settlement-pdf.service');
const { sendWithAttachment } = require('../services/email-template.service');
const { escapeHtml } = require('../utils/html');

function settlementEmailHtml(settlement) {
  const amount = new Intl.NumberFormat('es-CO').format(Number(settlement.amount_payable || 0));
  return [
    '<div style="font-family:Arial,sans-serif;color:#172033;max-width:600px;margin:auto">',
    '<div style="padding:28px;background:#172033;color:white"><h1 style="margin:0;font-size:24px">Detalle de ordenes facturadas</h1></div>',
    '<div style="padding:28px;border:1px solid #e5e7eb"><p>Hola <strong>', escapeHtml(settlement.company.name), '</strong>,</p>',
    '<p>Adjuntamos el soporte de la factura <strong>', escapeHtml(settlement.settlement_number), '</strong>, con ', String(Number(settlement.order_count) || 0), ' ordenes y un total a recibir de <strong>$', amount, '</strong>.</p>',
    '<p>Referencia de pago: <strong>', escapeHtml(settlement.payout_reference || '-'), '</strong>.</p>',
    '<p style="color:#667085">Este mensaje incluye el PDF con el detalle de las ordenes.</p></div></div>'
  ].join('');
}

const companyInclude = [{ model: Company, as: 'company', attributes: ['id', 'name', 'logo', 'address', 'email', 'phone'] }];

function settlementWhere(query, companyId) {
  const where = companyId ? { company_id: companyId } : {};
  if (query.status) {
    if (!['issued', 'paid'].includes(query.status)) throw new AppError('Invalid settlement status', 422);
    where.status = query.status;
  }
  if (query.company_id && !companyId) {
    const requestedCompanyId = Number(query.company_id);
    if (!Number.isSafeInteger(requestedCompanyId) || requestedCompanyId <= 0) throw new AppError('company_id must be a valid positive integer', 422);
    where.company_id = requestedCompanyId;
  }
  if (query.search) where[Op.or] = [{ settlement_number: { [Op.like]: `%${String(query.search).trim().slice(0, 100)}%` } }, { payout_reference: { [Op.like]: `%${String(query.search).trim().slice(0, 100)}%` } }];
  return where;
}

async function listFor(req, res, companyId) {
  const page = await paginate(CompanySettlement, {
    where: settlementWhere(req.query, companyId), include: companyInclude,
    allowedSort: { id: 'id', issued_at: 'issued_at', amount_payable: 'amount_payable', status: 'status' },
    defaultSortKey: 'issued_at', defaultDirection: 'DESC'
  }, req.query);
  return success(res, { message: 'Settlements retrieved successfully', data: { settlements: page.items, pagination: page.pagination } });
}

const listAdmin = asyncHandler((req, res) => listFor(req, res));
const listOwn = asyncHandler((req, res) => listFor(req, res, req.companyAccess.company.id));

const preview = asyncHandler(async (req, res) => {
  const data = await settlementService.preview(Number(req.body.company_id), req.body.date_from, req.body.date_to);
  return success(res, { message: 'Settlement preview generated', data });
});

const eligibleOrders = asyncHandler(async (_req, res) => success(res, { message: 'Eligible orders retrieved successfully', data: { orders: await settlementService.eligibleOrders() } }));

const createSelected = asyncHandler(async (req, res) => {
  const settlement = await settlementService.createSelected({ orderIds: req.body.order_ids, payoutReference: req.body.payout_reference, notes: req.body.notes, actor: req.auth.user, request: req });
  return success(res, { statusCode: 201, message: 'Orders invoiced successfully', data: { settlement } });
});

const overviewAdmin = asyncHandler(async (req, res) => {
  const data = await settlementService.overview(Number(req.query.company_id), req.query.date_from, req.query.date_to);
  return success(res, { message: 'Settlement overview generated', data });
});

const overviewOwn = asyncHandler(async (req, res) => {
  const data = await settlementService.overview(req.companyAccess.company.id, req.query.date_from, req.query.date_to);
  return success(res, { message: 'Settlement overview generated', data });
});

const create = asyncHandler(async (req, res) => {
  const settlement = await settlementService.create({
    companyId: Number(req.body.company_id), dateFrom: req.body.date_from, dateTo: req.body.date_to,
    notes: req.body.notes, closureType: req.body.closure_type, paidNow: req.body.paid_now === true,
    payoutReference: req.body.payout_reference, payoutMethod: req.body.payout_method, paidAt: req.body.paid_at,
    actor: req.auth.user, request: req
  });
  return success(res, { statusCode: 201, message: 'Settlement issued successfully', data: { settlement } });
});

const getAdmin = asyncHandler(async (req, res) => success(res, { message: 'Settlement retrieved successfully', data: { settlement: await settlementService.getById(req.params.id) } }));
const getOwn = asyncHandler(async (req, res) => {
  const settlement = await settlementService.getById(req.params.id);
  if (Number(settlement.company_id) !== Number(req.companyAccess.company.id)) throw new AppError('Settlement not found', 404);
  return success(res, { message: 'Settlement retrieved successfully', data: { settlement } });
});

const markPaid = asyncHandler(async (req, res) => {
  const settlement = await settlementService.markPaid(req.params.id, { payoutReference: req.body.payout_reference, payoutMethod: req.body.payout_method, paidAt: req.body.paid_at, actor: req.auth.user, request: req });
  return success(res, { message: 'Settlement marked as paid', data: { settlement } });
});

async function pdfFor(req, res, ownCompanyId) {
  const settlement = await settlementService.getById(req.params.id);
  if (ownCompanyId && Number(settlement.company_id) !== Number(ownCompanyId)) throw new AppError('Settlement not found', 404);
  const pdf = await renderSettlementPdf(settlement.toJSON());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${settlement.settlement_number}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  return res.send(pdf);
}

const sendToCompany = asyncHandler(async (req, res) => {
  const settlement = await settlementService.getById(req.params.id);
  const email = settlement.company?.email;
  if (!email) throw new AppError('La empresa no tiene correo registrado para enviar el PDF.', 422);
  const pdf = await renderSettlementPdf(settlement.toJSON());
  settlement.payout_reference = escapeHtml(settlement.payout_reference || '—');
  const delivery = await sendWithAttachment({ recipient: email, filename: `${settlement.settlement_number}.pdf`, content: pdf,
    subject: `Factura ${settlement.settlement_number} | Allora`,
    html: settlementEmailHtml(settlement)
    /* Legacy inline template kept only as a migration reference; dynamic HTML is now escaped above.
    html: `<div style="font-family:Arial,sans-serif;color:#172033;max-width:600px;margin:auto"><div style="padding:28px;background:#172033;color:white"><h1 style="margin:0;font-size:24px">Detalle de órdenes facturadas</h1></div><div style="padding:28px;border:1px solid #e5e7eb"><p>Hola <strong>${settlement.company.name}</strong>,</p><p>Adjuntamos el soporte de la factura <strong>${settlement.settlement_number}</strong>, con ${settlement.order_count} órdenes y un total a recibir de <strong>$${new Intl.NumberFormat('es-CO').format(Number(settlement.amount_payable || 0))}</strong>.</p><p>Referencia de pago: <strong>${settlement.payout_reference || '—'}</strong>.</p><p style="color:#667085">Este mensaje incluye el PDF con el detalle de las órdenes.</p></div></div>` });
    */ });
  return success(res, { message: 'Settlement email sent successfully', data: { delivery } });
});

const pdfAdmin = asyncHandler((req, res) => pdfFor(req, res));
const pdfOwn = asyncHandler((req, res) => pdfFor(req, res, req.companyAccess.company.id));

module.exports = { listAdmin, listOwn, preview, overviewAdmin, overviewOwn, eligibleOrders, createSelected, create, getAdmin, getOwn, markPaid, pdfAdmin, pdfOwn, sendToCompany };
