const AppError = require('../utils/app-error');
const { PlatformSetting } = require('../models');
const { normalizeCoveragePolygon } = require('./company-coverage.service');

const GLOBAL_COVERAGE_KEY = 'global_coverage';
const CUSTOMER_LINKS_KEY = 'customer_links';

function normalizeUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeCustomerLinks(value) {
  return {
    support_url: normalizeUrl(value?.support_url),
    become_store_url: normalizeUrl(value?.become_store_url),
    privacy_policy_url: normalizeUrl(value?.privacy_policy_url),
    terms_url: normalizeUrl(value?.terms_url),
    data_authorization_url: normalizeUrl(value?.data_authorization_url)
  };
}

function normalizeCoordinatePoint(point) {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeCoveragePayload(value) {
  const enabled = Boolean(value?.enabled);
  const rawPolygon = Array.isArray(value?.polygon) ? value.polygon : [];
  const polygon = rawPolygon.length ? normalizeCoveragePolygon(rawPolygon) : [];
  const center = normalizeCoordinatePoint(value?.center);
  const zoom = Number(value?.zoom);

  return {
    enabled,
    label: value?.label?.trim() || null,
    notes: value?.notes?.trim() || null,
    center,
    zoom: Number.isFinite(zoom) ? Math.min(20, Math.max(8, Math.round(zoom))) : 16,
    polygon
  };
}

async function getPlatformSetting(key) {
  return PlatformSetting.findOne({ where: { key } });
}

async function getGlobalCoverageSetting() {
  const setting = await getPlatformSetting(GLOBAL_COVERAGE_KEY);

  if (!setting?.value_json) {
    return {
      enabled: false,
      label: 'Cobertura general',
      notes: null,
      center: null,
      zoom: 16,
      polygon: []
    };
  }

  return normalizeCoveragePayload(setting.value_json);
}

async function saveGlobalCoverageSetting(value) {
  const payload = normalizeCoveragePayload(value);

  if (payload.enabled && payload.polygon.length < 3) {
    throw new AppError('Debes definir al menos 3 puntos para activar la cobertura global.', 422);
  }

  const [setting] = await PlatformSetting.findOrCreate({
    where: { key: GLOBAL_COVERAGE_KEY },
    defaults: {
      key: GLOBAL_COVERAGE_KEY,
      value_json: payload
    }
  });

  await setting.update({ value_json: payload });
  return payload;
}

async function getCustomerLinksSetting() {
  const setting = await getPlatformSetting(CUSTOMER_LINKS_KEY);
  return normalizeCustomerLinks(setting?.value_json);
}

async function saveCustomerLinksSetting(value) {
  const payload = normalizeCustomerLinks(value);
  const invalidLink = Object.entries(value || {}).find(([key, item]) => key.endsWith('_url') && item && !normalizeUrl(item));
  if (invalidLink) throw new AppError('Todos los enlaces deben comenzar por https:// o http://.', 422);
  const [setting] = await PlatformSetting.findOrCreate({
    where: { key: CUSTOMER_LINKS_KEY },
    defaults: { key: CUSTOMER_LINKS_KEY, value_json: payload }
  });
  await setting.update({ value_json: payload });
  return payload;
}

module.exports = {
  getPlatformSetting,
  getGlobalCoverageSetting,
  saveGlobalCoverageSetting,
  getCustomerLinksSetting,
  saveCustomerLinksSetting
};
