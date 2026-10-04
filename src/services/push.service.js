const crypto = require('node:crypto');
const { PushToken } = require('../models');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHANNEL_ID = 'allora-alerts';

function isExpoPushToken(token) {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token);
}

function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function buildPushMessage(item, payload) {
  return {
    to: item.token,
    title: payload.title,
    body: payload.body,
    data: {
      ...(payload.data || {}),
      notification_type: payload.type || null
    },
    sound: 'default',
    channelId: PUSH_CHANNEL_ID,
    priority: 'high'
  };
}

async function registerPushToken({ appScope, deviceName, platform, token, userId }) {
  if (!isExpoPushToken(token)) {
    return null;
  }

  const [record] = await PushToken.findOrCreate({
    where: { user_id: userId, token },
    defaults: {
      app_scope: appScope,
      device_name: deviceName || null,
      last_seen_at: new Date(),
      platform
    }
  });

  await record.update({
    app_scope: appScope,
    device_name: deviceName || null,
    last_seen_at: new Date(),
    platform
  });

  return record;
}

async function revokePushToken({ token, userId }) {
  await PushToken.destroy({
    where: { token, user_id: userId }
  });
}

async function postJsonWithRetry(url, body, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const responseBody = await response.json().catch(() => null);
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) {
        return { response, body: responseBody };
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      }
    }
  }
  throw lastError || new Error('Push request failed');
}

async function processReceipts(ticketEntries) {
  const receiptsResult = [];
  for (let offset = 0; offset < ticketEntries.length; offset += 100) {
    const batch = ticketEntries.slice(offset, offset + 100);
    const receiptIds = batch.map((entry) => entry.ticket?.id).filter(Boolean);
    if (!receiptIds.length) continue;

    const { response, body } = await postJsonWithRetry(
      'https://exp.host/--/api/v2/push/getReceipts',
      { ids: receiptIds }
    );
    if (!response.ok) {
      console.error('[push] receipt request failed', { status: response.status });
      continue;
    }

    const receipts = body?.data || {};
    receiptsResult.push(...Object.values(receipts));
    for (const entry of batch) {
      const receipt = entry.ticket?.id ? receipts[entry.ticket.id] : null;
      if (!receipt || receipt.status !== 'error') continue;
      const details = receipt.details || {};
      console.error('[push] receipt error', {
        ticket_id: entry.ticket.id,
        ...(entry.token ? { token_sha256: tokenFingerprint(entry.token) } : {}),
        error: receipt.message || details.error || 'unknown'
      });
      if (details.error === 'DeviceNotRegistered' && entry.token) {
        await PushToken.destroy({ where: { token: entry.token } });
      }
    }
  }
  return receiptsResult;
}

async function sendPushToUsers(userIds, payload, { appScope = payload.app_scope || 'customer' } = {}) {
  const tokens = await PushToken.findAll({
    where: {
      user_id: userIds,
      ...(appScope ? { app_scope: appScope } : {})
    }
  });

  const validEntries = tokens.filter((item) => isExpoPushToken(item.token));
  const messages = validEntries.map((item) => buildPushMessage(item, payload));

  if (!messages.length) {
    return { tickets: [], receipts: [] };
  }

  try {
    const tickets = [];
    for (let offset = 0; offset < messages.length; offset += 100) {
      const batchMessages = messages.slice(offset, offset + 100);
      const batchTokens = validEntries.slice(offset, offset + 100);
      const { response, body } = await postJsonWithRetry(EXPO_PUSH_URL, batchMessages);
      if (!response.ok) {
        console.error('[push] send failed', { status: response.status });
        continue;
      }
      for (const [index, ticket] of (body?.data || []).entries()) {
        const entry = { ticket, token: batchTokens[index]?.token };
        tickets.push(entry);
        if (ticket?.status === 'error') {
          console.error('[push] ticket error', {
            token_sha256: entry.token ? tokenFingerprint(entry.token) : undefined,
            error: ticket.message || ticket.details?.error || 'unknown'
          });
          if (ticket.details?.error === 'DeviceNotRegistered' && entry.token) {
            await PushToken.destroy({ where: { token: entry.token } });
          }
        }
      }
    }
    const receipts = await processReceipts(tickets);
    return { tickets: tickets.map(({ ticket }) => ticket), receipts };
  } catch (error) {
    console.error('[push] send failed:', error.message);
    return { tickets: [], receipts: [] };
  }
}

module.exports = {
  PUSH_CHANNEL_ID,
  isExpoPushToken,
  buildPushMessage,
  processReceipts,
  registerPushToken,
  revokePushToken,
  sendPushToUsers
};
