const test = require('node:test');
const assert = require('node:assert/strict');
const { isPenaltyFreeOrderCancellation } = require('../src/services/customer-rules.service');

test('unpaid PSE cancellations are penalty free', () => {
  assert.equal(isPenaltyFreeOrderCancellation({ payment_method: 'pse', payment_status: 'pending' }), true);
  assert.equal(isPenaltyFreeOrderCancellation({ payment_method: 'pse', payment_status: 'failed' }), true);
});

test('paid PSE and cash cancellations remain eligible for the cancellation rule', () => {
  assert.equal(isPenaltyFreeOrderCancellation({ payment_method: 'pse', payment_status: 'paid' }), false);
  assert.equal(isPenaltyFreeOrderCancellation({ payment_method: 'pse', payment_status: 'refunded' }), false);
  assert.equal(isPenaltyFreeOrderCancellation({ payment_method: 'cash', payment_status: 'pending' }), false);
});
