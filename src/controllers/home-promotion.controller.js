const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { HomePromotion } = require('../models');
const { normalizeCampaignValues } = require('../utils/campaign-link');

const editableFields = ['title', 'message', 'link_url', 'display_order', 'starts_at', 'ends_at', 'status'];
const clean = (body) => Object.fromEntries(Object.entries(body).filter(([key]) => editableFields.includes(key)));

function validateDates(values) {
  if (values.starts_at && Number.isNaN(new Date(values.starts_at).getTime())) throw new AppError('starts_at must be a valid date', 422);
  if (values.ends_at && Number.isNaN(new Date(values.ends_at).getTime())) throw new AppError('ends_at must be a valid date', 422);
  if (values.starts_at && values.ends_at && new Date(values.starts_at) > new Date(values.ends_at)) throw new AppError('ends_at must be later than starts_at', 422);
}

async function saveImage(file, promotionId) {
  if (!file) throw new AppError('An image is required', 422);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype];
  const directory = path.join(__dirname, '..', '..', 'uploads', 'home-promotions');
  await fs.mkdir(directory, { recursive: true });
  const filename = `${promotionId}-${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return `/uploads/home-promotions/${filename}`;
}

async function deleteImage(imageUrl) {
  if (imageUrl?.startsWith('/uploads/home-promotions/')) {
    await fs.unlink(path.join(__dirname, '..', '..', imageUrl)).catch(() => {});
  }
}

const publicList = asyncHandler(async (req, res) => {
  const now = new Date();
  const promotions = await HomePromotion.findAll({
    where: {
      status: 'active',
      [Op.and]: [
        { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
        { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] }
      ]
    },
    order: [['display_order', 'ASC'], ['id', 'DESC']]
  });
  return success(res, { message: 'Active home promotions retrieved successfully', data: { promotions } });
});

const list = asyncHandler(async (req, res) => {
  const promotions = await HomePromotion.findAll({ order: [['display_order', 'ASC'], ['id', 'DESC']] });
  return success(res, { message: 'Home promotions retrieved successfully', data: { promotions } });
});

const create = asyncHandler(async (req, res) => {
  // Promotions are visual-only banners; keep an internal title for storage.
  const values = normalizeCampaignValues(clean(req.body));
  validateDates(values);
  const promotion = await HomePromotion.create({ title: req.body.title?.trim() || 'Imagen promocional', ...values, image_url: 'pending-upload' });
  try {
    const imageUrl = await saveImage(req.file, promotion.id);
    await promotion.update({ image_url: imageUrl });
  } catch (error) {
    await promotion.destroy();
    throw error;
  }
  return success(res, { statusCode: 201, message: 'Home promotion created successfully', data: { promotion } });
});

const update = asyncHandler(async (req, res) => {
  const promotion = await HomePromotion.findByPk(req.params.id);
  if (!promotion) throw new AppError('Home promotion not found', 404);
  const values = normalizeCampaignValues(clean(req.body));
  validateDates({ starts_at: values.starts_at ?? promotion.starts_at, ends_at: values.ends_at ?? promotion.ends_at });
  await promotion.update(values);
  return success(res, { message: 'Home promotion updated successfully', data: { promotion } });
});

const replaceImage = asyncHandler(async (req, res) => {
  const promotion = await HomePromotion.findByPk(req.params.id);
  if (!promotion) throw new AppError('Home promotion not found', 404);
  const previousImage = promotion.image_url;
  const imageUrl = await saveImage(req.file, promotion.id);
  await promotion.update({ image_url: imageUrl });
  await deleteImage(previousImage);
  return success(res, { message: 'Home promotion image updated successfully', data: { promotion } });
});

const remove = asyncHandler(async (req, res) => {
  const promotion = await HomePromotion.findByPk(req.params.id);
  if (!promotion) throw new AppError('Home promotion not found', 404);
  await deleteImage(promotion.image_url);
  await promotion.destroy();
  return success(res, { message: 'Home promotion deleted successfully', data: null });
});

module.exports = { publicList, list, create, update, replaceImage, remove };
