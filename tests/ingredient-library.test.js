const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIngredientLibrary, searchable } = require('../src/services/ingredient-library.service');

test('ingredient library groups prior ingredients without case or accent duplicates', () => {
  const result = buildIngredientLibrary([
    { name: 'Queso', is_default: true, is_removable: true },
    { name: ' queso ', is_default: false, is_removable: false },
    { name: 'Jalapeño', is_default: true, is_removable: false }
  ]);

  assert.deepEqual(result, [
    { name: 'Queso', is_default: true, is_removable: true, usage_count: 2 },
    { name: 'Jalapeño', is_default: true, is_removable: false, usage_count: 1 }
  ]);
});

test('ingredient library search is accent insensitive and limited', () => {
  const result = buildIngredientLibrary([
    { name: 'Jalapeño' },
    { name: 'Cebolla' }
  ], 'jalapeno', 1);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Jalapeño');
  assert.equal(searchable(' ÁRBOL '), 'arbol');
});

test('ingredient library search ignores uppercase and lowercase differences', () => {
  const rows = [
    { name: 'Queso Mozzarella', is_default: true },
    { name: 'TOMATE', is_default: true }
  ];

  assert.equal(buildIngredientLibrary(rows, 'QUESO')[0].name, 'Queso Mozzarella');
  assert.equal(buildIngredientLibrary(rows, 'tomate')[0].name, 'TOMATE');
  assert.equal(buildIngredientLibrary(rows, 'ToMaTe')[0].name, 'TOMATE');
});
