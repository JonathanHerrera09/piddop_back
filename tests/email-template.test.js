require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { renderTemplate, mailStatus } = require('../src/services/email-template.service');

test('email renderer replaces supported template variables', () => {
  const rendered = renderTemplate(
    { subject: 'Hola {{name}}', html: '<strong>{{code}}</strong> por {{expires_in}} segundos' },
    { name: 'Lina', code: '123456', expires_in: 60 }
  );
  assert.equal(rendered.subject, 'Hola Lina');
  assert.equal(rendered.html, '<strong>123456</strong> por 60 segundos');
});

test('verification email lifetime is fixed at 60 seconds', () => {
  assert.equal(mailStatus().verification_code_ttl_seconds, 60);
  assert.equal(mailStatus().automatic_sending_enabled, true);
  assert.equal(typeof mailStatus().transport_configured, 'boolean');
  assert.equal(typeof mailStatus().sender_configured, 'boolean');
});

test('email template API rejects unauthenticated access', async () => {
  const response = await request(createApp()).get('/api/v1/admin/email-templates');
  assert.equal(response.status, 401);
});
