const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVariantSelections } = require('../src/services/variant-selection.service');

const variants = [
  {
    id: 1,
    name: 'Tamano de papas',
    selection_type: 'single',
    required: true,
    min_selections: 1,
    max_selections: 1,
    status: 'active',
    options: [
      { id: 10, name: 'Medianas', additional_price: 0, status: 'active' },
      { id: 11, name: 'Grandes', additional_price: 0, status: 'active' }
    ]
  },
  {
    id: 2,
    name: 'Bebida',
    selection_type: 'single',
    required: true,
    min_selections: 1,
    max_selections: 1,
    status: 'active',
    options: [
      {
        id: 20,
        name: 'Combo 3',
        additional_price: 5000,
        status: 'active',
        childVariants: [{
          id: 3,
          name: 'Elige tu bebida',
          selection_type: 'single',
          required: true,
          min_selections: 1,
          max_selections: 1,
          status: 'active',
          options: [
            { id: 30, name: 'Gaseosa', additional_price: 0, status: 'active' },
            { id: 31, name: 'Limonada', additional_price: 3500, status: 'active' }
          ]
        }]
      },
      { id: 21, name: 'Combo 2', additional_price: 2500, status: 'active' },
      { id: 22, name: 'Oculta', additional_price: 0, status: 'inactive' }
    ]
  }
];

test('accepts a nested included or paid option when its parent combo is selected', () => {
  assert.deepEqual(validateVariantSelections(variants, [10, 20, 31]), [10, 20, 31]);
});

test('rejects a combo when a required group is missing', () => {
  assert.throws(
    () => validateVariantSelections(variants, [10]),
    (error) => error.statusCode === 422 && /Bebida/.test(error.message)
  );
});

test('requires the nested beverage group only after selecting Combo 3', () => {
  assert.throws(
    () => validateVariantSelections(variants, [10, 20]),
    (error) => error.statusCode === 422 && /Elige tu bebida/.test(error.message)
  );
  assert.deepEqual(validateVariantSelections(variants, [10, 21]), [10, 21]);
});

test('rejects a nested beverage if its parent combo is not selected', () => {
  assert.throws(
    () => validateVariantSelections(variants, [10, 21, 30]),
    (error) => error.statusCode === 422 && /require another selection first/.test(error.message)
  );
});

test('rejects multiple choices in a single-selection group', () => {
  assert.throws(
    () => validateVariantSelections(variants, [10, 11, 20]),
    (error) => error.statusCode === 422 && /Tamano de papas/.test(error.message)
  );
});

test('rejects inactive or unrelated options', () => {
  assert.throws(
    () => validateVariantSelections(variants, [10, 22]),
    (error) => error.statusCode === 422 && /not active/.test(error.message)
  );
});
