const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildCheckout, eventChecksum, getWompiTransaction, verifyEvent } = require('../src/services/wompi.service');

const configuration = {
  enabled: true,
  environment: 'sandbox',
  public_key: 'pub_test_example',
  private_key: 'prv_test_example',
  events_secret: 'test_events_example',
  integrity_secret: 'test_integrity_example',
  public_base_url: 'https://example.test/'
};

test('buildCheckout signs the amount and creates the public redirect URL', () => {
  const checkout = buildCheckout({
    amount: 12345,
    configuration,
    customer: { email: 'cliente@example.com', name: 'Cliente Prueba', phone: '3001234567' },
    orderId: 42,
    reference: 'ORD-123'
  });
  const url = new URL(checkout.checkout_url);
  const expected = crypto.createHash('sha256').update('ORD-1231234500COPtest_integrity_example').digest('hex');
  assert.equal(checkout.amount_in_cents, 1234500);
  assert.equal(url.searchParams.get('signature:integrity'), expected);
  assert.equal(url.searchParams.get('redirect-url'), 'https://example.test/api/v1/payments/wompi/redirect?order_id=42');
  assert.equal(url.searchParams.get('customer-data:email'), 'cliente@example.com');
});

test('event signature follows the dynamic properties sent by Wompi', () => {
  const event = {
    data: { transaction: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 1234500 } },
    timestamp: 1700000000,
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] }
  };
  const checksum = eventChecksum(event, configuration.events_secret);
  assert.equal(verifyEvent(event, checksum, configuration.events_secret), true);
  assert.equal(verifyEvent(event, '0'.repeat(64), configuration.events_secret), false);
});

test('getWompiTransaction uses the private key and selected environment', async () => {
  let requestedUrl;
  let authorization;
  const transaction = await getWompiTransaction('tx-123', configuration, async (url, options) => {
    requestedUrl = url;
    authorization = options.headers.Authorization;
    return {
      ok: true,
      json: async () => ({ data: { id: 'tx-123', status: 'PENDING' } })
    };
  });

  assert.equal(requestedUrl, 'https://sandbox.wompi.co/v1/transactions/tx-123');
  assert.equal(authorization, 'Bearer prv_test_example');
  assert.equal(transaction.status, 'PENDING');
});
