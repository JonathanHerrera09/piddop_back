const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination } = require('../src/utils/pagination');

test('pagination parses page and page_size with deterministic offset', () => {
  const result = parsePagination({ page: '3', page_size: '25' });
  assert.deepEqual({ page: result.page, pageSize: result.pageSize, offset: result.offset }, { page: 3, pageSize: 25, offset: 50 });
});

test('pagination rejects unsafe limits and sort fields', () => {
  assert.throws(() => parsePagination({ page_size: '101' }), /cannot exceed/);
  assert.throws(() => parsePagination({ page: '0' }), /positive integer/);
  assert.throws(() => parsePagination({ sort: 'password' }, { allowedSort: { id: 'id' } }), /Invalid sort field/);
});

test('pagination whitelists sort direction and normalizes bounded search', () => {
  const result = parsePagination({ sort: '-created_at', search: `  ${'x'.repeat(150)}  ` }, { allowedSort: { created_at: 'created_at' } });
  assert.deepEqual(result.order, [['created_at', 'DESC']]);
  assert.equal(result.search.length, 100);
});
