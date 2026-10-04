const test = require('node:test');
const assert = require('node:assert/strict');
const { collectVariantOptionIds, serializeProductWithPrices } = require('../src/services/product-variant-pricing.service');

const variants = [{
  id: 1,
  options: [{
    id: 10,
    name: 'Combo',
    childVariants: [{ id: 2, options: [{ id: 20, name: 'Limonada' }] }]
  }, { id: 11, name: 'Solo' }]
}];

test('collects root and nested option ids for product pricing', () => {
  assert.deepEqual(collectVariantOptionIds(variants), [10, 20, 11]);
});

test('places product-specific prices into the reusable variant tree', () => {
  const product = serializeProductWithPrices({
    id: 7,
    variants,
    variantOptionPrices: [
      { variant_option_id: 10, additional_price: '8000.00' },
      { variant_option_id: 20, additional_price: '3000.00' }
    ]
  });
  assert.equal(product.variants[0].options[0].additional_price, 8000);
  assert.equal(product.variants[0].options[0].childVariants[0].options[0].additional_price, 3000);
  assert.equal(product.variants[0].options[1].additional_price, 0);
  assert.equal(product.variantOptionPrices, undefined);
});
