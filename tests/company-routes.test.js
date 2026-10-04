const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();

test('company catalog routes reject missing authentication before permission checks', async () => {
  for (const path of ['/api/v1/company/products', '/api/v1/company/products/1/duplicate', '/api/v1/company/products/ingredients/library', '/api/v1/company/variants', '/api/v1/company/variants/1/duplicate']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.body.success, false, path);
  }
});
