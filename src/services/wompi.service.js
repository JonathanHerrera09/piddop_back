const crypto = require('node:crypto');
const AppError = require('../utils/app-error');
const { PlatformSetting } = require('../models');

const WOMPI_SETTING_KEY = 'wompi';
const CHECKOUT_URL = 'https://checkout.wompi.co/p/';
const API_URLS = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1'
};
const SECRET_FIELDS = ['private_key', 'events_secret', 'integrity_secret'];

function encryptionKey() {
  const material = process.env.WOMPI_SETTINGS_ENCRYPTION_KEY || process.env.JWT_REFRESH_SECRET;
  if (!material) throw new AppError('Falta WOMPI_SETTINGS_ENCRYPTION_KEY en el backend.', 503);
  return crypto.createHash('sha256').update(material).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
  if (!value) return '';
  if (!String(value).startsWith('v1:')) return String(value);
  const [, iv, tag, encrypted] = String(value).split(':');
  try {
    const authenticationTag = Buffer.from(tag, 'base64');
    if (authenticationTag.length !== 16) throw new Error('Invalid GCM authentication tag');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'), { authTagLength: 16 });
    decipher.setAuthTag(authenticationTag);
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError('No fue posible descifrar la configuracion de Wompi.', 500);
  }
}

function envConfiguration() {
  return {
    enabled: process.env.WOMPI_ENABLED === 'true',
    environment: process.env.WOMPI_ENVIRONMENT || 'sandbox',
    public_key: process.env.WOMPI_PUBLIC_KEY || '',
    private_key: process.env.WOMPI_PRIVATE_KEY || '',
    events_secret: process.env.WOMPI_EVENTS_SECRET || '',
    integrity_secret: process.env.WOMPI_INTEGRITY_SECRET || '',
    public_base_url: process.env.WOMPI_PUBLIC_BASE_URL || ''
  };
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function validateConfiguration(configuration, { requireComplete = false } = {}) {
  const environment = configuration.environment === 'production' ? 'production' : 'sandbox';
  const prefix = environment === 'production'
    ? { public_key: 'pub_prod_', private_key: 'prv_prod_', events_secret: 'prod_events_', integrity_secret: 'prod_integrity_' }
    : { public_key: 'pub_test_', private_key: 'prv_test_', events_secret: 'test_events_', integrity_secret: 'test_integrity_' };

  for (const [field, expectedPrefix] of Object.entries(prefix)) {
    const value = String(configuration[field] || '').trim();
    if (value && !value.startsWith(expectedPrefix)) {
      throw new AppError(`La credencial ${field} no corresponde al ambiente ${environment}.`, 422);
    }
    if (requireComplete && !value) throw new AppError(`Falta configurar ${field} para habilitar Wompi.`, 422);
  }

  const publicBaseUrl = normalizeBaseUrl(configuration.public_base_url);
  if (publicBaseUrl && !/^https:\/\//i.test(publicBaseUrl)) {
    throw new AppError('La URL publica de Wompi debe comenzar por https://.', 422);
  }
  if (requireComplete && !publicBaseUrl) throw new AppError('Falta configurar la URL publica del backend.', 422);
}

async function getWompiConfiguration() {
  const fallback = envConfiguration();
  const setting = await PlatformSetting.findOne({ where: { key: WOMPI_SETTING_KEY } });
  if (!setting?.value_json) return fallback;
  const saved = setting.value_json;
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : fallback.enabled,
    environment: saved.environment || fallback.environment,
    public_key: saved.public_key || fallback.public_key,
    public_base_url: normalizeBaseUrl(saved.public_base_url || fallback.public_base_url),
    ...Object.fromEntries(SECRET_FIELDS.map((field) => [field, saved[field] ? decryptSecret(saved[field]) : fallback[field]]))
  };
}

function publicConfiguration(configuration) {
  const baseUrl = normalizeBaseUrl(configuration.public_base_url);
  const hint = (value) => value ? `••••${String(value).slice(-4)}` : null;
  return {
    enabled: Boolean(configuration.enabled),
    environment: configuration.environment,
    public_key: configuration.public_key,
    public_base_url: baseUrl,
    webhook_url: baseUrl ? `${baseUrl}/api/v1/payments/wompi/events` : '',
    private_key_configured: Boolean(configuration.private_key),
    events_secret_configured: Boolean(configuration.events_secret),
    integrity_secret_configured: Boolean(configuration.integrity_secret),
    private_key_hint: hint(configuration.private_key),
    events_secret_hint: hint(configuration.events_secret),
    integrity_secret_hint: hint(configuration.integrity_secret)
  };
}

async function getAdminWompiConfiguration() {
  return publicConfiguration(await getWompiConfiguration());
}

async function saveWompiConfiguration(input) {
  const current = await getWompiConfiguration();
  const next = {
    enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
    environment: input.environment || current.environment,
    public_key: input.public_key === undefined ? current.public_key : String(input.public_key).trim(),
    public_base_url: input.public_base_url === undefined ? current.public_base_url : normalizeBaseUrl(input.public_base_url),
    ...Object.fromEntries(SECRET_FIELDS.map((field) => [
      field,
      input[field] === undefined || input[field] === '' ? current[field] : String(input[field]).trim()
    ]))
  };
  validateConfiguration(next, { requireComplete: next.enabled });

  const persisted = {
    enabled: next.enabled,
    environment: next.environment,
    public_key: next.public_key,
    public_base_url: next.public_base_url,
    ...Object.fromEntries(SECRET_FIELDS.map((field) => [field, next[field] ? encryptSecret(next[field]) : null]))
  };
  const [setting] = await PlatformSetting.findOrCreate({
    where: { key: WOMPI_SETTING_KEY },
    defaults: { key: WOMPI_SETTING_KEY, value_json: persisted }
  });
  await setting.update({ value_json: persisted });
  return publicConfiguration(next);
}

function amountInCents(amount) {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new AppError('El total del pedido no es valido para Wompi.', 422);
  return cents;
}

function buildCheckout({ amount, configuration, customer, orderId, reference }) {
  validateConfiguration(configuration, { requireComplete: true });
  if (!configuration.enabled) throw new AppError('El pago por PSE no esta habilitado.', 503);
  const cents = amountInCents(amount);
  const signature = crypto.createHash('sha256')
    .update(`${reference}${cents}COP${configuration.integrity_secret}`)
    .digest('hex');
  const redirectUrl = new URL(`${normalizeBaseUrl(configuration.public_base_url)}/api/v1/payments/wompi/redirect`);
  if (orderId) redirectUrl.searchParams.set('order_id', String(orderId));
  const params = new URLSearchParams({
    'public-key': configuration.public_key,
    currency: 'COP',
    'amount-in-cents': String(cents),
    reference,
    'signature:integrity': signature,
    'redirect-url': redirectUrl.toString()
  });
  if (customer?.email) params.set('customer-data:email', customer.email);
  if (customer?.name) params.set('customer-data:full-name', customer.name);
  if (customer?.phone) params.set('customer-data:phone-number', customer.phone);
  return { amount_in_cents: cents, checkout_url: `${CHECKOUT_URL}?${params.toString()}`, reference };
}

async function getWompiTransaction(transactionId, configuration, request = fetch) {
  if (!transactionId) throw new AppError('Falta el identificador de la transaccion de Wompi.', 422);
  if (!configuration?.private_key) throw new AppError('Falta configurar la llave privada de Wompi.', 503);
  const environment = configuration.environment === 'production' ? 'production' : 'sandbox';

  let response;
  try {
    response = await request(`${API_URLS[environment]}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${configuration.private_key}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new AppError('No fue posible consultar el estado del pago en Wompi.', 502);
  }

  if (!response.ok) throw new AppError('Wompi no permitio consultar el estado del pago.', 502);
  const payload = await response.json();
  if (!payload?.data?.id || !payload?.data?.status) {
    throw new AppError('Wompi respondio con un estado de pago invalido.', 502);
  }
  return payload.data;
}

function valueAtPath(object, path) {
  return String(path).split('.').reduce((value, segment) => value?.[segment], object);
}

function eventChecksum(event, eventsSecret) {
  const properties = event?.signature?.properties;
  if (!Array.isArray(properties) || !Number.isInteger(event?.timestamp)) return null;
  const values = properties.map((property) => valueAtPath(event.data, property));
  if (values.some((value) => value === undefined || value === null)) return null;
  return crypto.createHash('sha256').update(`${values.join('')}${event.timestamp}${eventsSecret}`).digest('hex');
}

function verifyEvent(event, headerChecksum, eventsSecret) {
  const expected = eventChecksum(event, eventsSecret);
  const received = String(headerChecksum || event?.signature?.checksum || '').toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(received)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

module.exports = {
  WOMPI_SETTING_KEY,
  amountInCents,
  buildCheckout,
  eventChecksum,
  getAdminWompiConfiguration,
  getWompiConfiguration,
  getWompiTransaction,
  saveWompiConfiguration,
  verifyEvent
};
