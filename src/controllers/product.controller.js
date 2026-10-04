const fs = require('node:fs/promises'); const path = require('node:path'); const crypto = require('node:crypto');
const AppError = require('../utils/app-error'); const asyncHandler = require('../utils/async-handler'); const { success } = require('../utils/api-response');
const { Op } = require('sequelize');
const { sequelize, Company, Category, Product, ProductImage, ProductIngredient, Variant, VariantOption, ProductVariant, ProductVariantOptionPrice } = require('../models');
const { collectVariantOptionIds, serializeProductWithPrices } = require('../services/product-variant-pricing.service');
const includes = [
  { model: Category, as: 'category' },
  { model: ProductImage, as: 'images' },
  { model: ProductIngredient, as: 'ingredients', where: { status: 'active' }, required: false },
  { model: ProductVariantOptionPrice, as: 'variantOptionPrices', required: false },
  {
    model: Variant,
    as: 'variants',
    where: { parent_option_id: null },
    required: false,
    include: [{
      model: VariantOption,
      as: 'options',
      include: [{ model: Variant, as: 'childVariants', required: false, include: [{ model: VariantOption, as: 'options' }] }]
    }]
  }
];
async function ownProduct(id, companyId) { const product = await Product.findOne({ where: { id, company_id: companyId }, include: includes }); if (!product) throw new AppError('Product not found', 404); return product; }
async function validCategory(categoryId, company) { if (company.type === 'services') throw new AppError('Service companies cannot create products', 422); const category = await Category.findOne({ where: { id: categoryId, type: company.type } }); if (!category) throw new AppError('Category does not belong to this company type', 422); return category; }
async function setVariants(product, ids, priceItems) {
  if (ids === undefined) {
    if (priceItems !== undefined) throw new AppError('variant_ids are required when configuring variant prices', 422);
    return;
  }
  if (!Array.isArray(ids)) throw new AppError('variant_ids must be an array', 422);
  const variants = await Variant.findAll({ where: { id: ids, company_id: product.company_id, parent_option_id: null }, include: includes[4].include });
  if (variants.length !== new Set(ids.map(Number)).size) throw new AppError('One or more root variants do not belong to this company', 422);
  const allowedOptionIds = collectVariantOptionIds(variants);
  const allowed = new Set(allowedOptionIds.map(String));
  const prices = priceItems === undefined ? null : priceItems;
  if (prices !== null && !Array.isArray(prices)) throw new AppError('variant_prices must be an array', 422);
  if (prices) {
    const seen = new Set();
    for (const item of prices) {
      const optionId = Number(item.variant_option_id);
      const price = Number(item.additional_price);
      if (!allowed.has(String(optionId))) throw new AppError('A priced option does not belong to the selected product variants', 422);
      if (seen.has(optionId)) throw new AppError('Variant option prices cannot be repeated', 422);
      if (!Number.isFinite(price) || price < 0) throw new AppError('Product variant prices must be zero or greater', 422);
      seen.add(optionId);
    }
  }

  await ProductVariant.destroy({ where: { product_id: product.id } });
  if (variants.length) await ProductVariant.bulkCreate(variants.map((variant, index) => ({ product_id: product.id, variant_id: variant.id, sort_order: index + 1 })));
  if (prices !== null) {
    await ProductVariantOptionPrice.destroy({ where: { product_id: product.id } });
    if (prices.length) await ProductVariantOptionPrice.bulkCreate(prices.map((item) => ({ product_id: product.id, variant_option_id: item.variant_option_id, additional_price: Number(item.additional_price) })));
  } else if (!allowedOptionIds.length) {
    await ProductVariantOptionPrice.destroy({ where: { product_id: product.id } });
  } else {
    await ProductVariantOptionPrice.destroy({ where: { product_id: product.id, variant_option_id: { [Op.notIn]: allowedOptionIds } } });
  }
}
function copiedName(name, maxLength = 180) {
  const suffix = ' (Copia)';
  return `${String(name).slice(0, maxLength - suffix.length)}${suffix}`;
}
async function duplicateProductRecord(source, transaction) {
  const copy = await Product.create({
    company_id: source.company_id,
    category_id: source.category_id,
    name: copiedName(source.name),
    description: source.description,
    base_price: source.base_price,
    status: 'inactive'
  }, { transaction });
  if (source.ingredients?.length) {
    await ProductIngredient.bulkCreate(source.ingredients.map((ingredient) => ({
      product_id: copy.id,
      name: ingredient.name,
      is_removable: ingredient.is_removable,
      is_default: ingredient.is_default,
      status: ingredient.status,
      sort_order: ingredient.sort_order
    })), { transaction });
  }
  if (source.variants?.length) {
    await ProductVariant.bulkCreate(source.variants.map((variant, index) => ({ product_id: copy.id, variant_id: variant.id, sort_order: index + 1 })), { transaction });
  }
  if (source.variantOptionPrices?.length) {
    await ProductVariantOptionPrice.bulkCreate(source.variantOptionPrices.map((price) => ({
      product_id: copy.id,
      variant_option_id: price.variant_option_id,
      additional_price: price.additional_price
    })), { transaction });
  }
  return copy;
}
const publicList = asyncHandler(async (req, res) => { const products = await Product.findAll({ where: { status: 'active' }, include: includes }); return success(res, { message: 'Products retrieved successfully', data: { products: products.map(serializeProductWithPrices) } }); });
const publicGet = asyncHandler(async (req, res) => { const product = await Product.findOne({ where: { id: req.params.id, status: 'active' }, include: includes }); if (!product) throw new AppError('Product not found', 404); return success(res, { message: 'Product retrieved successfully', data: { product: serializeProductWithPrices(product) } }); });
const companyList = asyncHandler(async (req, res) => { const { paginate } = require('../utils/pagination'); const where = { company_id: req.companyAccess.company.id }; if (req.query.status) where.status = req.query.status; if (req.query.category_id) where.category_id = req.query.category_id; if (req.query.search) where[Op.or] = [{ name: { [Op.like]: `%${req.query.search}%` } }, { description: { [Op.like]: `%${req.query.search}%` } }]; const page = await paginate(Product, { where, include: includes, allowedSort: { id: 'id', name: 'name', price: 'base_price', base_price: 'base_price', status: 'status', created_at: 'created_at' } }, req.query); return success(res, { message: 'Company products retrieved successfully', data: { products: page.items.map(serializeProductWithPrices), pagination: page.pagination } }); });
const create = asyncHandler(async (req, res) => { const company = req.companyAccess.company; if (!req.body.name || !req.body.category_id || Number(req.body.base_price) < 0) throw new AppError('Name, category_id, and valid base_price are required', 422); await validCategory(req.body.category_id, company); if (req.body.status === 'active') throw new AppError('Upload at least 1 image before activating a product', 422); const product = await Product.create({ company_id: company.id, category_id: req.body.category_id, name: req.body.name.trim(), description: req.body.description || null, base_price: req.body.base_price, status: req.body.status || 'inactive' }); await setVariants(product, req.body.variant_ids, req.body.variant_prices); return success(res, { statusCode: 201, message: 'Product created successfully', data: { product: serializeProductWithPrices(await ownProduct(product.id, company.id)) } }); });
const update = asyncHandler(async (req, res) => { const product = await ownProduct(req.params.id, req.companyAccess.company.id); if (req.body.category_id) await validCategory(req.body.category_id, req.companyAccess.company); if (req.body.status === 'active' && product.images.length < 1) throw new AppError('A product needs at least 1 image before activation', 422); await product.update(Object.fromEntries(Object.entries(req.body).filter(([key]) => ['category_id', 'name', 'description', 'base_price', 'status'].includes(key)))); await setVariants(product, req.body.variant_ids, req.body.variant_prices); return success(res, { message: 'Product updated successfully', data: { product: serializeProductWithPrices(await ownProduct(product.id, product.company_id)) } }); });
const duplicate = asyncHandler(async (req, res) => { const source = await ownProduct(req.params.id, req.companyAccess.company.id); const copy = await sequelize.transaction((transaction) => duplicateProductRecord(source, transaction)); return success(res, { statusCode: 201, message: 'Product duplicated successfully', data: { product: serializeProductWithPrices(await ownProduct(copy.id, source.company_id)) } }); });
const remove = asyncHandler(async (req, res) => { const product = await ownProduct(req.params.id, req.companyAccess.company.id); await product.destroy(); return res.status(204).send(); });
const addImages = asyncHandler(async (req, res) => { const product = await ownProduct(req.params.id, req.companyAccess.company.id); if (!req.files?.length) throw new AppError('At least one image is required', 422); if (product.images.length + req.files.length > 5) throw new AppError('A product can have at most 5 images', 422); const directory = path.join(__dirname, '..', '..', 'uploads', 'products'); await fs.mkdir(directory, { recursive: true }); const nextSortOrder = product.images.reduce((max, image) => Math.max(max, Number(image.sort_order || 0)), 0); const rows = []; for (const file of req.files) { const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype]; const filename = `${product.id}-${crypto.randomUUID()}.${ext}`; await fs.writeFile(path.join(directory, filename), file.buffer); rows.push({ product_id: product.id, image_url: `/uploads/products/${filename}`, sort_order: nextSortOrder + rows.length + 1 }); } await ProductImage.bulkCreate(rows); return success(res, { statusCode: 201, message: 'Product images uploaded successfully', data: { product: serializeProductWithPrices(await ownProduct(product.id, product.company_id)) } }); });
const deleteImage = asyncHandler(async (req, res) => { const product = await ownProduct(req.params.id, req.companyAccess.company.id); const image = product.images.find((item) => String(item.id) === String(req.params.imageId)); if (!image) throw new AppError('Product image not found', 404); await fs.unlink(path.join(__dirname, '..', '..', image.image_url)).catch(() => {}); await image.destroy(); return res.status(204).send(); });
module.exports = { publicList, publicGet, companyList, create, update, duplicate, remove, addImages, deleteImage, duplicateProductRecord };
