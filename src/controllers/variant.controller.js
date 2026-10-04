const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { sequelize, Variant, VariantOption } = require('../models');
const { Op } = require('sequelize');

const childVariantInclude = {
  model: Variant,
  as: 'childVariants',
  required: false,
  include: [{ model: VariantOption, as: 'options' }]
};
const optionInclude = { model: VariantOption, as: 'options', include: [childVariantInclude] };

async function own(id, companyId) {
  const variant = await Variant.findOne({
    where: { id, company_id: companyId, parent_option_id: null },
    include: [optionInclude]
  });
  if (!variant) throw new AppError('Variant not found', 404);
  return variant;
}

function normalizeOptions(items, depth) {
  if (!Array.isArray(items) || !items.length) throw new AppError('At least one variant option is required', 422);
  const normalized = items.map((item) => ({
    id: item.id ? Number(item.id) : null,
    name: String(item.name || '').trim(),
    status: item.status || 'active',
    child_variants: (item.child_variants || item.childVariants || []).map((child) => normalizeVariantTree(child, depth + 1))
  }));
  if (normalized.some((item) => !item.name)) throw new AppError('Every variant option requires a name', 422);
  if (normalized.some((item) => !['active', 'inactive'].includes(item.status))) throw new AppError('Invalid variant option status', 422);
  if (new Set(normalized.map((item) => item.name.toLocaleLowerCase('es'))).size !== normalized.length) throw new AppError('Variant option names cannot be repeated', 422);
  return normalized;
}

function normalizeVariantTree(body, depth = 0) {
  if (depth > 2) throw new AppError('Variant nesting supports up to three levels', 422);
  const options = normalizeOptions(body.options, depth);
  const selectionType = body.selection_type || 'single';
  if (!['single', 'multiple'].includes(selectionType)) throw new AppError('selection_type must be single or multiple', 422);
  const required = Boolean(body.required);
  const requestedMinimum = Number(body.min_selections || 0);
  const requestedMaximum = Number(body.max_selections || 1);
  const minimum = required ? Math.max(1, requestedMinimum) : requestedMinimum;
  const maximum = selectionType === 'single' ? 1 : requestedMaximum;
  if (!Number.isInteger(minimum) || minimum < 0 || !Number.isInteger(maximum) || maximum < 1) throw new AppError('Selection limits must be valid whole numbers', 422);
  if (minimum > maximum) throw new AppError('min_selections cannot be greater than max_selections', 422);
  const activeOptions = options.filter((item) => item.status === 'active').length;
  if (maximum > activeOptions || minimum > activeOptions) throw new AppError('Selection limits cannot exceed the active option count', 422);
  const name = String(body.name || '').trim();
  if (!name) throw new AppError('Variant name is required', 422);
  const status = body.status || 'active';
  if (!['active', 'inactive'].includes(status)) throw new AppError('Invalid variant status', 422);
  return { id: body.id ? Number(body.id) : null, name, selection_type: selectionType, required, min_selections: minimum, max_selections: maximum, status, options };
}

async function createVariantTree(companyId, input, parentOptionId, transaction) {
  const variant = await Variant.create({
    company_id: companyId,
    parent_option_id: parentOptionId || null,
    name: input.name,
    selection_type: input.selection_type,
    required: input.required,
    min_selections: input.min_selections,
    max_selections: input.max_selections,
    status: input.status
  }, { transaction });

  for (const [index, item] of input.options.entries()) {
    const option = await VariantOption.create({
      variant_id: variant.id,
      name: item.name,
      status: item.status,
      sort_order: index + 1
    }, { transaction });
    for (const child of item.child_variants) {
      await createVariantTree(companyId, child, option.id, transaction);
    }
  }
  return variant;
}

async function replaceVariantTree(variant, input, transaction) {
  await variant.update({
    name: input.name,
    selection_type: input.selection_type,
    required: input.required,
    min_selections: input.min_selections,
    max_selections: input.max_selections,
    status: input.status
  }, { transaction });

  const currentOptions = await VariantOption.findAll({ where: { variant_id: variant.id }, transaction });
  const currentById = new Map(currentOptions.map((option) => [String(option.id), option]));
  const keptOptionIds = [];
  for (const [index, item] of input.options.entries()) {
    let option;
    if (item.id) {
      option = currentById.get(String(item.id));
      if (!option) throw new AppError('A variant option does not belong to this variant', 422);
      await option.update({ name: item.name, status: item.status, sort_order: index + 1 }, { transaction });
    } else {
      option = await VariantOption.create({ variant_id: variant.id, name: item.name, status: item.status, sort_order: index + 1 }, { transaction });
    }
    keptOptionIds.push(option.id);

    const currentChildren = await Variant.findAll({ where: { parent_option_id: option.id }, transaction });
    const childrenById = new Map(currentChildren.map((child) => [String(child.id), child]));
    const keptChildIds = [];
    for (const child of item.child_variants) {
      if (child.id) {
        const currentChild = childrenById.get(String(child.id));
        if (!currentChild) throw new AppError('A child variant does not belong to this option', 422);
        await replaceVariantTree(currentChild, child, transaction);
        keptChildIds.push(currentChild.id);
      } else {
        const createdChild = await createVariantTree(variant.company_id, child, option.id, transaction);
        keptChildIds.push(createdChild.id);
      }
    }
    if (currentChildren.length) {
      await Variant.destroy({
        where: keptChildIds.length
          ? { parent_option_id: option.id, id: { [Op.notIn]: keptChildIds } }
          : { parent_option_id: option.id },
        transaction
      });
    }
  }
  if (currentOptions.length) await VariantOption.destroy({ where: { variant_id: variant.id, id: { [Op.notIn]: keptOptionIds } }, transaction });
}

const list = asyncHandler(async (req, res) => {
  const { Op } = require('sequelize');
  const { paginate } = require('../utils/pagination');
  const where = { company_id: req.companyAccess.company.id, parent_option_id: null };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
  const page = await paginate(Variant, { where, include: [optionInclude], allowedSort: { id: 'id', name: 'name', status: 'status', created_at: 'created_at' } }, req.query);
  return success(res, { message: 'Variants retrieved successfully', data: { variants: page.items, pagination: page.pagination } });
});

const create = asyncHandler(async (req, res) => {
  const input = normalizeVariantTree(req.body);
  const variant = await sequelize.transaction((transaction) => createVariantTree(req.companyAccess.company.id, input, null, transaction));
  return success(res, { statusCode: 201, message: 'Variant created successfully', data: { variant: await own(variant.id, variant.company_id) } });
});

const update = asyncHandler(async (req, res) => {
  const variant = await own(req.params.id, req.companyAccess.company.id);
  const current = variant.toJSON();
  const input = normalizeVariantTree({ ...current, ...req.body, options: req.body.options || current.options });
  await sequelize.transaction((transaction) => replaceVariantTree(variant, input, transaction));
  return success(res, { message: 'Variant updated successfully', data: { variant: await own(variant.id, variant.company_id) } });
});

const duplicate = asyncHandler(async (req, res) => {
  const source = await own(req.params.id, req.companyAccess.company.id);
  const input = normalizeVariantTree(source.toJSON());
  input.name = `${source.name.slice(0, 92)} (Copia)`;
  const copy = await sequelize.transaction((transaction) => createVariantTree(source.company_id, input, null, transaction));
  return success(res, { statusCode: 201, message: 'Variant duplicated successfully', data: { variant: await own(copy.id, source.company_id) } });
});

const remove = asyncHandler(async (req, res) => {
  const variant = await own(req.params.id, req.companyAccess.company.id);
  await variant.destroy();
  return res.status(204).send();
});

module.exports = { list, create, update, duplicate, remove, replaceVariantTree, createVariantTree, normalizeVariantTree };
