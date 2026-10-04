const test = require('node:test');
const assert = require('node:assert/strict');
const { PUSH_CHANNEL_ID, isExpoPushToken, buildPushMessage } = require('../src/services/push.service');

test('accepts both official Expo push token formats and rejects malformed values', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('ExponentPushToken[]'), false);
  assert.equal(isExpoPushToken('not-a-push-token'), false);
  assert.equal(isExpoPushToken(null), false);
});

test('builds the Android channel and notification type into the payload', () => {
  const message = buildPushMessage(
    { token: 'ExpoPushToken[abc123]' },
    { title: 'Pedido', body: 'Actualizado', type: 'ORDER_ACCEPTED', data: { order_id: 7 } }
  );

  assert.equal(message.channelId, PUSH_CHANNEL_ID);
  assert.equal(message.data.notification_type, 'ORDER_ACCEPTED');
  assert.equal(message.data.order_id, 7);
  assert.equal(message.to, 'ExpoPushToken[abc123]');
});
