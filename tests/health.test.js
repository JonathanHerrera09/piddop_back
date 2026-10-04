const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { sequelize } = require('../src/models');

const app = createApp();

test('GET /api/v1/health returns API and database status', async () => {
  const response = await request(app).get('/api/v1/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.api, 'up');
  assert.equal(response.body.data.database, 'connected');
});

test('unknown routes return the standard 404 response', async () => {
  const response = await request(app).get('/api/v1/not-found');

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, 'Route not found');
});

test.after(async () => {
  await sequelize.close();
});
