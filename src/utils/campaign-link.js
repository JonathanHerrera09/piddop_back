const AppError = require('./app-error');

const INTERNAL_PREFIX = 'allora-customer://';
const INTERNAL_ROUTES = new Set(['home', 'companies', 'orders', 'cart', 'appointments', 'settings']);

function normalizeCampaignLink(value) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;

  const link = String(value).trim();

  if (link.length > 500) {
    throw new AppError('link_url must not exceed 500 characters', 422);
  }

  if (link.toLowerCase().startsWith(INTERNAL_PREFIX)) {
    const route = link.slice(INTERNAL_PREFIX.length).replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!INTERNAL_ROUTES.has(route)) {
      throw new AppError('link_url contains an unsupported app destination', 422);
    }
    return `${INTERNAL_PREFIX}${route}`;
  }

  let url;
  try {
    url = new URL(link);
  } catch (_error) {
    throw new AppError('link_url must be a valid URL', 422);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError('link_url must use http, https, or an allowed app destination', 422);
  }

  return link;
}

function normalizeCampaignValues(values) {
  if (Object.prototype.hasOwnProperty.call(values, 'link_url')) {
    return { ...values, link_url: normalizeCampaignLink(values.link_url) };
  }
  return values;
}

module.exports = { INTERNAL_PREFIX, INTERNAL_ROUTES, normalizeCampaignLink, normalizeCampaignValues };
