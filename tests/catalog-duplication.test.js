const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Category,
  Company,
  Product,
  ProductImage,
  ProductIngredient,
  ProductVariant,
  ProductVariantOptionPrice,
  Variant,
  VariantOption
} = require('../src/models');
const { duplicateProductRecord } = require('../src/controllers/product.controller');
const { createVariantTree, normalizeVariantTree } = require('../src/controllers/variant.controller');

test('duplicates a product configuration without sharing its images', async (context) => {
  const [company, category] = await Promise.all([Company.findOne(), Category.findOne()]);
  if (!company || !category) {
    context.skip('Company and category fixtures are required');
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    const variant = await Variant.create({ company_id: company.id, name: 'Presentación copy test', selection_type: 'single', required: true, min_selections: 1, max_selections: 1, status: 'active' }, { transaction });
    const combo = await VariantOption.create({ variant_id: variant.id, name: 'Combo', status: 'active', sort_order: 1 }, { transaction });
    const beverage = await Variant.create({ company_id: company.id, parent_option_id: combo.id, name: 'Bebida', selection_type: 'single', required: true, min_selections: 1, max_selections: 1, status: 'active' }, { transaction });
    await VariantOption.create({ variant_id: beverage.id, name: 'Gaseosa', status: 'active', sort_order: 1 }, { transaction });
    const source = await Product.create({ company_id: company.id, category_id: category.id, name: 'Sándwich original', description: 'Descripción', base_price: 14500, status: 'active' }, { transaction });
    await Promise.all([
      ProductImage.create({ product_id: source.id, image_url: '/uploads/products/shared-test.webp', sort_order: 1 }, { transaction }),
      ProductIngredient.create({ product_id: source.id, name: 'Queso', is_default: true, is_removable: true, status: 'active', sort_order: 1 }, { transaction }),
      ProductVariant.create({ product_id: source.id, variant_id: variant.id, sort_order: 1 }, { transaction }),
      ProductVariantOptionPrice.create({ product_id: source.id, variant_option_id: combo.id, additional_price: 8000 }, { transaction })
    ]);

    const loadedSource = await Product.findByPk(source.id, {
      include: [
        { model: ProductImage, as: 'images' },
        { model: ProductIngredient, as: 'ingredients' },
        { model: ProductVariantOptionPrice, as: 'variantOptionPrices' },
        { model: Variant, as: 'variants', through: { attributes: [] } }
      ],
      transaction
    });
    const copy = await duplicateProductRecord(loadedSource, transaction);
    const [copyImages, copyIngredients, copyPrices, copyVariants] = await Promise.all([
      ProductImage.count({ where: { product_id: copy.id }, transaction }),
      ProductIngredient.findAll({ where: { product_id: copy.id }, transaction }),
      ProductVariantOptionPrice.findAll({ where: { product_id: copy.id }, transaction }),
      ProductVariant.findAll({ where: { product_id: copy.id }, transaction })
    ]);

    assert.equal(copy.name, 'Sándwich original (Copia)');
    assert.equal(copy.status, 'inactive');
    assert.equal(copyImages, 0);
    assert.equal(copyIngredients[0].name, 'Queso');
    assert.equal(Number(copyPrices[0].additional_price), 8000);
    assert.equal(String(copyVariants[0].variant_id), String(variant.id));

    const tree = await Variant.findByPk(variant.id, { include: [{ model: VariantOption, as: 'options', include: [{ model: Variant, as: 'childVariants', include: [{ model: VariantOption, as: 'options' }] }] }], transaction });
    const variantCopy = await createVariantTree(company.id, normalizeVariantTree(tree.toJSON()), null, transaction);
    const storedVariantCopy = await Variant.findByPk(variantCopy.id, { include: [{ model: VariantOption, as: 'options', include: [{ model: Variant, as: 'childVariants', include: [{ model: VariantOption, as: 'options' }] }] }], transaction });
    assert.notEqual(String(storedVariantCopy.options[0].id), String(combo.id));
    assert.equal(storedVariantCopy.options[0].childVariants[0].options[0].name, 'Gaseosa');
  } finally {
    await transaction.rollback();
  }
});

test.after(() => sequelize.close());
