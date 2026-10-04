const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { Category } = require('../models');
const { Op } = require('sequelize');
const { paginate } = require('../utils/pagination');
const validTypes = new Set(['food', 'products', 'services']);
async function saveCategoryIcon(file, categoryId) {
  if (!file) throw new AppError('An icon file is required', 422);
  const ext = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }[file.mimetype];
  const directory = path.join(__dirname, '..', '..', 'uploads', 'categories');
  await fs.mkdir(directory, { recursive: true });
  const filename = `${categoryId}-${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return `/uploads/categories/${filename}`;
}

async function deleteCategoryIcon(iconUrl) {
  if (iconUrl?.startsWith('/uploads/categories/')) {
    await fs.unlink(path.join(__dirname, '..', '..', iconUrl)).catch(() => {});
  }
}

const listAdmin = asyncHandler(async (req, res) => { const page = await paginate(Category, { where: req.query.search ? { [Op.or]: [{ name: { [Op.like]: `%${req.query.search}%` } }, { type: { [Op.like]: `%${req.query.search}%` } }] } : {}, allowedSort: { id: 'id', name: 'name', type: 'type', status: 'status' }, order: [['type', 'ASC'], ['name', 'ASC']] }, req.query); return success(res, { message: 'Categories retrieved successfully', data: { categories: page.items, pagination: page.pagination } }); });
const listPublic = asyncHandler(async (req, res) => success(res, { message: 'Categories retrieved successfully', data: { categories: await Category.findAll({ where: { status: 'active' }, order: [['name', 'ASC']] }) } }));
const getPublic = asyncHandler(async (req, res) => { const category = await Category.findOne({ where: { id: req.params.id, status: 'active' } }); if (!category) throw new AppError('Category not found', 404); return success(res, { message: 'Category retrieved successfully', data: { category } }); });
const create = asyncHandler(async (req, res) => { if (!req.body.name || !validTypes.has(req.body.type)) throw new AppError('A name and valid type are required', 422); const category = await Category.create({ name: req.body.name.trim(), type: req.body.type, icon: req.body.icon || null, status: req.body.status || 'active' }); return success(res, { statusCode: 201, message: 'Category created successfully', data: { category } }); });
const update = asyncHandler(async (req, res) => { const category = await Category.findByPk(req.params.id); if (!category) throw new AppError('Category not found', 404); if (req.body.type && req.body.type !== category.type) throw new AppError('Category type cannot be changed after creation', 409); await category.update(Object.fromEntries(Object.entries(req.body).filter(([key]) => ['name', 'icon', 'status'].includes(key)))); return success(res, { message: 'Category updated successfully', data: { category } }); });
const remove = asyncHandler(async (req, res) => { const category = await Category.findByPk(req.params.id); if (!category) throw new AppError('Category not found', 404); try { await category.destroy(); } catch (error) { if (error.name === 'SequelizeForeignKeyConstraintError') throw new AppError('Category cannot be deleted because it has related products', 409); throw error; } return res.status(204).send(); });
const updateIcon = asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  if (!category) throw new AppError('Category not found', 404);

  if (req.file) {
    const previousIcon = category.icon;
    const icon = await saveCategoryIcon(req.file, category.id);
    await category.update({ icon });
    await deleteCategoryIcon(previousIcon);
    return success(res, { message: 'Category icon updated successfully', data: { category } });
  }

  if (!req.body.icon) throw new AppError('Icon is required', 422);
  await category.update({ icon: req.body.icon });
  return success(res, { message: 'Category icon updated successfully', data: { category } });
});
module.exports = { listAdmin, listPublic, getPublic, create, update, remove, updateIcon };
