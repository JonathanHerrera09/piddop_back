const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { Popup } = require('../models');
const { paginate } = require('../utils/pagination');
const { normalizeCampaignValues } = require('../utils/campaign-link');

const editableFields = ['title', 'message', 'link_url', 'display_order', 'starts_at', 'ends_at', 'status'];
const clean = (body) => Object.fromEntries(Object.entries(body).filter(([key]) => editableFields.includes(key)));

function validateDates(values) {
  if (values.starts_at && Number.isNaN(new Date(values.starts_at).getTime())) throw new AppError('starts_at must be a valid date', 422);
  if (values.ends_at && Number.isNaN(new Date(values.ends_at).getTime())) throw new AppError('ends_at must be a valid date', 422);
  if (values.starts_at && values.ends_at && new Date(values.starts_at) > new Date(values.ends_at)) throw new AppError('ends_at must be later than starts_at', 422);
}

async function saveImage(file, popupId) {
  if (!file) throw new AppError('An image is required', 422);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype];
  const directory = path.join(__dirname, '..', '..', 'uploads', 'popups');
  await fs.mkdir(directory, { recursive: true });
  const filename = `${popupId}-${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return `/uploads/popups/${filename}`;
}

async function deleteImage(imageUrl) {
  if (imageUrl?.startsWith('/uploads/popups/')) {
    await fs.unlink(path.join(__dirname, '..', '..', imageUrl)).catch(() => {});
  }
}

const publicList = asyncHandler(async (req, res) => {
  const now = new Date();
  const popups = await Popup.findAll({
    where: {
      status: 'active',
      [Op.and]: [
        { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
        { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] }
      ]
    },
    order: [['display_order', 'ASC'], ['id', 'DESC']]
  });
  return success(res, { message: 'Active popups retrieved successfully', data: { popups } });
});

const list = asyncHandler(async (req, res) => {
  const where = req.query.status ? { status: req.query.status } : {};
  if (req.query.search) where[Op.or] = [{ title: { [Op.like]: `%${req.query.search}%` } }, { message: { [Op.like]: `%${req.query.search}%` } }];
  const page = await paginate(Popup, { where, allowedSort: { id: 'id', title: 'title', display_order: 'display_order', status: 'status' }, order: [['display_order', 'ASC'], ['id', 'DESC']] }, req.query);
  return success(res, { message: 'Popups retrieved successfully', data: { popups: page.items, pagination: page.pagination } });
});

const create = asyncHandler(async (req, res) => {
  if (!req.body.title?.trim()) throw new AppError('title is required', 422);
  const values = normalizeCampaignValues(clean(req.body));
  validateDates(values);
  const popup = await Popup.create({ title: req.body.title.trim(), ...values, image_url: 'pending-upload' });
  try {
    const imageUrl = await saveImage(req.file, popup.id);
    await popup.update({ image_url: imageUrl });
  } catch (error) {
    await popup.destroy();
    throw error;
  }
  return success(res, { statusCode: 201, message: 'Popup created successfully', data: { popup } });
});

const update = asyncHandler(async (req, res) => {
  const popup = await Popup.findByPk(req.params.id);
  if (!popup) throw new AppError('Popup not found', 404);
  const values = normalizeCampaignValues(clean(req.body));
  validateDates({ starts_at: values.starts_at ?? popup.starts_at, ends_at: values.ends_at ?? popup.ends_at });
  await popup.update(values);
  return success(res, { message: 'Popup updated successfully', data: { popup } });
});

const replaceImage = asyncHandler(async (req, res) => {
  const popup = await Popup.findByPk(req.params.id);
  if (!popup) throw new AppError('Popup not found', 404);
  const previousImage = popup.image_url;
  const imageUrl = await saveImage(req.file, popup.id);
  await popup.update({ image_url: imageUrl });
  await deleteImage(previousImage);
  return success(res, { message: 'Popup image updated successfully', data: { popup } });
});

const remove = asyncHandler(async (req, res) => {
  const popup = await Popup.findByPk(req.params.id);
  if (!popup) throw new AppError('Popup not found', 404);
  await deleteImage(popup.image_url);
  await popup.destroy();
  return success(res, { message: 'Popup deleted successfully', data: null });
});

module.exports = { publicList, list, create, update, replaceImage, remove };
