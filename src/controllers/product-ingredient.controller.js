const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { Product, ProductIngredient } = require('../models');
const { buildIngredientLibrary, searchable } = require('../services/ingredient-library.service');
const { Op, col, fn, where } = require('sequelize');

async function ownProduct(productId, companyId) {
  const product = await Product.findOne({
    where: { id: productId, company_id: companyId }
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return product;
}

async function ownIngredient(ingredientId, productId) {
  const ingredient = await ProductIngredient.findOne({
    where: { id: ingredientId, product_id: productId }
  });

  if (!ingredient) {
    throw new AppError('Ingredient not found', 404);
  }

  return ingredient;
}

function normalizePayload(body) {
  if (!body.name?.trim()) {
    throw new AppError('Ingredient name is required', 422);
  }

  return {
    name: body.name.trim(),
    is_removable: Boolean(body.is_removable),
    is_default: body.is_default === undefined ? true : Boolean(body.is_default),
    status: body.status || 'active',
    sort_order: Number(body.sort_order || 1)
  };
}

const list = asyncHandler(async (req, res) => {
  const product = await ownProduct(req.params.id, req.companyAccess.company.id);
  const ingredients = await ProductIngredient.findAll({
    where: { product_id: product.id },
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });

  return success(res, {
    message: 'Product ingredients retrieved successfully',
    data: { ingredients }
  });
});

const library = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 80);
  if (search.length < 2) {
    return success(res, {
      message: 'Ingredient library retrieved successfully',
      data: { ingredients: [] }
    });
  }

  const ingredients = await ProductIngredient.findAll({
    attributes: ['name', 'is_default', 'is_removable', 'updated_at'],
    include: [{
      model: Product,
      as: 'product',
      attributes: [],
      required: true,
      where: { company_id: req.companyAccess.company.id }
    }],
    where: {
      status: 'active',
      [Op.and]: where(
        fn('LOWER', col('ProductIngredient.name')),
        { [Op.like]: `%${search.toLocaleLowerCase('es')}%` }
      )
    },
    order: [['updated_at', 'DESC']],
    limit: 200
  });

  return success(res, {
    message: 'Ingredient library retrieved successfully',
    data: { ingredients: buildIngredientLibrary(ingredients, search, 8) }
  });
});

const create = asyncHandler(async (req, res) => {
  const product = await ownProduct(req.params.id, req.companyAccess.company.id);
  const payload = normalizePayload(req.body);

  const currentIngredients = await ProductIngredient.findAll({ where: { product_id: product.id } });
  if (currentIngredients.some((ingredient) => searchable(ingredient.name) === searchable(payload.name))) {
    throw new AppError('This ingredient already exists in the product', 409);
  }

  const ingredient = await ProductIngredient.create({
    product_id: product.id,
    ...payload
  });

  return success(res, {
    statusCode: 201,
    message: 'Product ingredient created successfully',
    data: { ingredient }
  });
});

const update = asyncHandler(async (req, res) => {
  const product = await ownProduct(req.params.id, req.companyAccess.company.id);
  const ingredient = await ownIngredient(req.params.ingredientId, product.id);
  const payload = normalizePayload(req.body);

  const currentIngredients = await ProductIngredient.findAll({ where: { product_id: product.id } });
  if (currentIngredients.some((candidate) => String(candidate.id) !== String(ingredient.id) && searchable(candidate.name) === searchable(payload.name))) {
    throw new AppError('This ingredient already exists in the product', 409);
  }

  await ingredient.update(payload);

  return success(res, {
    message: 'Product ingredient updated successfully',
    data: { ingredient }
  });
});

const remove = asyncHandler(async (req, res) => {
  const product = await ownProduct(req.params.id, req.companyAccess.company.id);
  const ingredient = await ownIngredient(req.params.ingredientId, product.id);
  await ingredient.destroy();
  return res.status(204).send();
});

module.exports = { list, library, create, update, remove };
