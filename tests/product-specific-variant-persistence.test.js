const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Category,
  Company,
  Product,
  ProductVariant,
  ProductVariantOptionPrice,
  Variant,
  VariantOption
} = require('../src/models');
const { serializeProductWithPrices } = require('../src/services/product-variant-pricing.service');
const { replaceVariantTree } = require('../src/controllers/variant.controller');
const { productOptions } = require('../src/controllers/cart.controller');

test('the same reusable option keeps different prices for two products', async (context) => {
  const [company, category] = await Promise.all([Company.findOne(), Category.findOne()]);
  if (!company || !category) {
    context.skip('Company and category fixtures are required');
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    const variant = await Variant.create({ company_id: company.id, name: 'Tamaño reusable test', selection_type: 'single', required: true, min_selections: 1, max_selections: 1, status: 'active' }, { transaction });
    const option = await VariantOption.create({ variant_id: variant.id, name: 'Grande', status: 'active', sort_order: 1 }, { transaction });
    const products = await Product.bulkCreate([
      { company_id: company.id, category_id: category.id, name: 'Producto precio A', base_price: 10000, status: 'inactive' },
      { company_id: company.id, category_id: category.id, name: 'Producto precio B', base_price: 12000, status: 'inactive' }
    ], { transaction });
    await ProductVariant.bulkCreate(products.map((product) => ({ product_id: product.id, variant_id: variant.id, sort_order: 1 })), { transaction });
    await ProductVariantOptionPrice.bulkCreate([
      { product_id: products[0].id, variant_option_id: option.id, additional_price: 5000 },
      { product_id: products[1].id, variant_option_id: option.id, additional_price: 7500 }
    ], { transaction });

    const [cartOptionA] = await productOptions(products[0].id, [option.id], transaction);
    const [cartOptionB] = await productOptions(products[1].id, [option.id], transaction);
    assert.equal(cartOptionA.additional_price, 5000);
    assert.equal(cartOptionB.additional_price, 7500);

    await replaceVariantTree(variant, {
      name: variant.name,
      selection_type: 'single',
      required: true,
      min_selections: 1,
      max_selections: 1,
      status: 'active',
      options: [{ id: option.id, name: 'Grande renombrado', status: 'active', child_variants: [] }]
    }, transaction);
    const preservedPrice = await ProductVariantOptionPrice.findOne({
      where: { product_id: products[0].id, variant_option_id: option.id },
      transaction
    });
    assert.equal(Number(preservedPrice.additional_price), 5000);

    const stored = await Product.findAll({
      where: { id: products.map((product) => product.id) },
      include: [
        { model: ProductVariantOptionPrice, as: 'variantOptionPrices' },
        { model: Variant, as: 'variants', through: { attributes: [] }, include: [{ model: VariantOption, as: 'options' }] }
      ],
      order: [['id', 'ASC']],
      transaction
    });
    const serialized = stored.map(serializeProductWithPrices);
    assert.equal(serialized[0].variants[0].options[0].additional_price, 5000);
    assert.equal(serialized[1].variants[0].options[0].additional_price, 7500);
  } finally {
    await transaction.rollback();
  }
});

test.after(() => sequelize.close());
