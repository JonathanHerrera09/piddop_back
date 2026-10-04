const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedOrigins } = require('../src/config/cors');

test('development CORS defaults include the Vite web origin', () => {
  assert.deepEqual(allowedOrigins({ NODE_ENV: 'development' }), ['http://localhost:5174', 'http://localhost:5173']);
});

test('production CORS requires an explicit origin', () => {
  assert.throws(() => allowedOrigins({ NODE_ENV: 'production' }), /CORS_ORIGIN must be configured/);
});

test('configured CORS origins are trimmed and split', () => {
  assert.deepEqual(allowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: ' https://panel.example.com,https://admin.example.com ' }), ['https://panel.example.com', 'https://admin.example.com']);
});
