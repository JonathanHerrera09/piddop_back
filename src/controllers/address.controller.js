const AppError = require('../utils/app-error'); const asyncHandler = require('../utils/async-handler'); const { success } = require('../utils/api-response'); const { sequelize, CustomerAddress } = require('../models');
const { assertPointWithinGlobalCoverage } = require('../services/platform-coverage.service');
const fields = ['label', 'recipient_name', 'recipient_phone', 'address_line', 'additional_details', 'neighborhood', 'city', 'latitude', 'longitude'];
async function own(id, userId) { const address = await CustomerAddress.findOne({ where: { id, customer_id: userId } }); if (!address) throw new AppError('Address not found', 404); return address; }
async function validateCoverageForPayload(payload, fallback = {}) {
  const latitude = payload.latitude ?? fallback.latitude;
  const longitude = payload.longitude ?? fallback.longitude;

  if (latitude == null || longitude == null) {
    throw new AppError('Selecciona una direccion validada en el mapa antes de guardar.', 422);
  }

  await assertPointWithinGlobalCoverage({ latitude, longitude });
}
const list = asyncHandler(async (req, res) => success(res, { message: 'Addresses retrieved successfully', data: { addresses: await CustomerAddress.findAll({ where: { customer_id: req.auth.user.id }, order: [['is_default', 'DESC'], ['id', 'DESC']] }) } }));
const get = asyncHandler(async (req, res) => success(res, { message: 'Address retrieved successfully', data: { address: await own(req.params.id, req.auth.user.id) } }));
const create = asyncHandler(async (req, res) => { if (!req.body.address_line?.trim() || !req.body.neighborhood?.trim()) throw new AppError('La direccion y el barrio son obligatorios.', 422); await validateCoverageForPayload(req.body); const count = await CustomerAddress.count({ where: { customer_id: req.auth.user.id } }); if (count >= 3) throw new AppError('A customer can have at most 3 active addresses', 422); const isDefault = count === 0 || Boolean(req.body.is_default); if (isDefault) await CustomerAddress.update({ is_default: false }, { where: { customer_id: req.auth.user.id } }); const address = await CustomerAddress.create({ customer_id: req.auth.user.id, label: req.body.label?.trim() || (count === 0 ? 'Casa' : `Direccion ${count + 1}`), recipient_name: `${req.auth.user.name} ${req.auth.user.last_name}`.trim(), recipient_phone: req.auth.user.phone, address_line: req.body.address_line.trim(), neighborhood: req.body.neighborhood.trim(), latitude: req.body.latitude, longitude: req.body.longitude, is_default: isDefault }); return success(res, { statusCode: 201, message: 'Address created successfully', data: { address } }); });
const update = asyncHandler(async (req, res) => { const address = await own(req.params.id, req.auth.user.id); await validateCoverageForPayload(req.body, address); await address.update(Object.fromEntries(Object.entries(req.body).filter(([key]) => fields.includes(key)))); return success(res, { message: 'Address updated successfully', data: { address } }); });
const setDefault = asyncHandler(async (req, res) => { const address = await own(req.params.id, req.auth.user.id); await sequelize.transaction(async (transaction) => { await CustomerAddress.update({ is_default: false }, { where: { customer_id: req.auth.user.id }, transaction }); await address.update({ is_default: true }, { transaction }); }); return success(res, { message: 'Default address updated successfully', data: { address } }); });
const remove = asyncHandler(async (req, res) => { const address = await own(req.params.id, req.auth.user.id); const [orders] = await sequelize.query('SELECT id FROM orders WHERE address_id = ? LIMIT 1', { replacements: [address.id] }); if (orders.length) { await address.destroy(); return success(res, { message: 'Address archived because it is associated with orders', data: {} }); } await address.destroy({ force: true }); return res.status(204).send(); });
module.exports = { list, get, create, update, setDefault, remove };
