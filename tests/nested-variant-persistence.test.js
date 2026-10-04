const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Company, Variant, VariantOption } = require('../src/models');

test('persists and retrieves a subvariant beneath a specific combo option', async (context) => {
  const company = await Company.findOne();
  if (!company) {
    context.skip('No company fixture is available');
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    const root = await Variant.create({
      company_id: company.id,
      name: 'Tipo de combo test',
      selection_type: 'single',
      required: true,
      min_selections: 1,
      max_selections: 1,
      status: 'active'
    }, { transaction });
    const combo3 = await VariantOption.create({
      variant_id: root.id,
      name: 'Combo 3',
      additional_price: 5000,
      status: 'active',
      sort_order: 1
    }, { transaction });
    const beverage = await Variant.create({
      company_id: company.id,
      parent_option_id: combo3.id,
      name: 'Elige tu bebida',
      selection_type: 'single',
      required: true,
      min_selections: 1,
      max_selections: 1,
      status: 'active'
    }, { transaction });
    await VariantOption.bulkCreate([
      { variant_id: beverage.id, name: 'Gaseosa', additional_price: 0, status: 'active', sort_order: 1 },
      { variant_id: beverage.id, name: 'Limonada', additional_price: 3500, status: 'active', sort_order: 2 }
    ], { transaction });

    const stored = await Variant.findByPk(root.id, {
      include: [{
        model: VariantOption,
        as: 'options',
        include: [{ model: Variant, as: 'childVariants', include: [{ model: VariantOption, as: 'options' }] }]
      }],
      transaction
    });

    assert.equal(stored.options[0].childVariants[0].name, 'Elige tu bebida');
    assert.deepEqual(stored.options[0].childVariants[0].options.map((option) => option.name).sort(), ['Gaseosa', 'Limonada']);
  } finally {
    await transaction.rollback();
  }
});

test.after(() => sequelize.close());
