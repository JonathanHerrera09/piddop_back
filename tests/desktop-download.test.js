const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

test('Windows installer is publicly downloadable with a stable filename', async () => {
  const response = await request(createApp()).get('/downloads/Piddop-Setup.exe');

  assert.equal(response.status, 200);
  assert.match(response.headers['content-disposition'], /attachment; filename="Piddop-Setup\.exe"/);
  assert.equal(response.headers['cache-control'], 'no-cache');
  assert.ok(Number(response.headers['content-length']) > 0);
});
