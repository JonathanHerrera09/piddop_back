const test = require('node:test');
const assert = require('node:assert/strict');
const { hasExpectedImageSignature } = require('../src/middlewares/upload.middleware');
const { MIN_SECRET_LENGTH, swaggerEnabled, validateSecurityConfiguration } = require('../src/config/security');

test('image uploads require content signatures that match their claimed MIME type', () => {
  assert.equal(hasExpectedImageSignature({ mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]) }), true);
  assert.equal(hasExpectedImageSignature({ mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }), true);
  assert.equal(hasExpectedImageSignature({ mimetype: 'image/webp', buffer: Buffer.from('RIFFxxxxWEBPVP8 ', 'ascii') }), true);
  assert.equal(hasExpectedImageSignature({ mimetype: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') }), false);
  assert.equal(hasExpectedImageSignature({ mimetype: 'image/jpeg', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }), false);
});

test('Swagger is disabled by default in production and can be explicitly enabled', () => {
  assert.equal(swaggerEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }), true);
  assert.equal(swaggerEnabled({ NODE_ENV: 'development' }), true);
});

test('production refuses missing or weak JWT secrets', () => {
  assert.throws(
    () => validateSecurityConfiguration({ NODE_ENV: 'production', CORS_ORIGIN: 'https://panel.example.com' }),
    /JWT_ACCESS_SECRET/
  );
  assert.throws(
    () => validateSecurityConfiguration({ NODE_ENV: 'production', CORS_ORIGIN: 'https://panel.example.com', JWT_ACCESS_SECRET: 'a'.repeat(MIN_SECRET_LENGTH - 1), JWT_REFRESH_SECRET: 'b'.repeat(MIN_SECRET_LENGTH) }),
    /at least/
  );
  assert.doesNotThrow(() => validateSecurityConfiguration({
    NODE_ENV: 'production', CORS_ORIGIN: 'https://panel.example.com',
    JWT_ACCESS_SECRET: 'a'.repeat(MIN_SECRET_LENGTH), JWT_REFRESH_SECRET: 'b'.repeat(MIN_SECRET_LENGTH)
  }));
});
