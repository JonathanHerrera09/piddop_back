const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCampaignLink } = require('../src/utils/campaign-link');

test('normalizes supported internal campaign destinations', () => {
  assert.equal(normalizeCampaignLink(' ALLORA-CUSTOMER://Orders/ '), 'allora-customer://orders');
});

test('accepts http and https external campaign links', () => {
  assert.equal(normalizeCampaignLink('https://example.com/oferta'), 'https://example.com/oferta');
  assert.equal(normalizeCampaignLink('http://example.com'), 'http://example.com');
});

test('rejects unsafe protocols and unsupported internal routes', () => {
  assert.throws(() => normalizeCampaignLink('javascript:alert(1)'), /must use http, https/);
  assert.throws(() => normalizeCampaignLink('allora-customer://admin'), /unsupported app destination/);
});

test('turns empty values into null', () => {
  assert.equal(normalizeCampaignLink('  '), null);
  assert.equal(normalizeCampaignLink(null), null);
});
