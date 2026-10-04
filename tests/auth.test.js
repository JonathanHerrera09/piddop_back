require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const authService = require('../src/services/auth.service');
const emailTemplateService = require('../src/services/email-template.service');
const { OAuth2Client } = require('google-auth-library');
const { sequelize, User, Role, AuthRefreshToken, EmailVerificationCode, CustomerAddress } = require('../src/models');

const app = createApp();
emailTemplateService.sendTemplate = async () => ({ message_id: 'test-message' });
const originalRandomInt = crypto.randomInt;
crypto.randomInt = () => 123456;

test('Super Admin can log in and access protected role permissions', async () => {
  const identity = uniqueIdentity('super-admin');
  const role = await Role.findOne({ where: { name: 'SUPER_ADMIN', scope: 'platform' } });
  assert.ok(role, 'SUPER_ADMIN role must be seeded for access-control tests');
  const password = 'Test-only-super-admin-password';
  await User.create({
    role_id: role.id,
    name: 'Test',
    last_name: 'Administrator',
    email: identity.email,
    phone: identity.phone,
    password: await bcrypt.hash(password, 12),
    status: 'active'
  });

  const login = await request(app).post('/api/v1/auth/login').send({
    email: identity.email,
    password
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.role.name, 'SUPER_ADMIN');

  const permissions = await request(app)
    .get('/api/v1/admin/permissions')
    .set('Authorization', `Bearer ${login.body.data.tokens.access_token}`);
  assert.equal(permissions.status, 200);
  assert.ok(permissions.body.data.permissions.length > 0);
  await cleanupUser(identity.email);
});

test('protected auth endpoints reject missing tokens', async () => {
  const response = await request(app).get('/api/v1/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

function uniqueIdentity(label) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return { email: `auth-${label}-${suffix}@example.test`, phone: `+57300${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}` };
}

async function cleanupUser(email) {
  await EmailVerificationCode.destroy({ where: { email } });
  const user = await User.findOne({ where: { email } });
  if (user) {
    await CustomerAddress.destroy({ where: { customer_id: user.id }, force: true });
    await AuthRefreshToken.destroy({ where: { user_id: user.id } });
    await user.destroy();
  }
}

test('customer account deletion deactivates access and preserves the user record', async () => {
  const identity = uniqueIdentity('deactivate');
  const role = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  const user = await User.create({
    role_id: role.id, name: 'Cliente', last_name: 'Prueba', email: identity.email,
    phone: identity.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'active'
  });
  try {
    const login = await request(app).post('/api/v1/auth/login').send({ email: identity.email, password: 'TestPassword123!' });
    assert.equal(login.status, 200);
    const { access_token, refresh_token } = login.body.data.tokens;

    const deleted = await request(app).delete('/api/v1/users/me').set('Authorization', `Bearer ${access_token}`);
    assert.equal(deleted.status, 200);
    assert.equal((await User.findByPk(user.id)).status, 'inactive');
    assert.equal(await AuthRefreshToken.count({ where: { user_id: user.id, revoked_at: null } }), 0);

    const reusedAccess = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access_token}`);
    assert.equal(reusedAccess.status, 401);
    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refresh_token });
    assert.equal(refreshed.status, 401);
    const loginAgain = await request(app).post('/api/v1/auth/login').send({ email: identity.email, password: 'TestPassword123!' });
    assert.equal(loginAgain.status, 403);
  } finally {
    await cleanupUser(identity.email);
  }
});

test('register requires the emailed code before creating a CUSTOMER session', async () => {
  const identity = uniqueIdentity('customer');
  try {
    const response = await request(app).post('/api/v1/auth/register').send({
      role_id: 1,
      name: 'Prueba',
      last_name: 'Cliente',
      email: identity.email,
      phone: identity.phone,
      password: 'TestPassword123!',
      password_confirmation: 'TestPassword123!', legal_acceptance: true
    });
    assert.equal(response.status, 202);
    assert.equal(response.body.data.expires_in, 60);
    assert.equal(await User.count({ where: { email: identity.email } }), 0);

    const invalid = await request(app).post('/api/v1/auth/register/verify').send({ email: identity.email, code: '000000' });
    assert.equal(invalid.status, 422);

    const verified = await request(app).post('/api/v1/auth/register/verify').send({ email: identity.email, code: '123456' });
    assert.equal(verified.status, 201);
    assert.equal(verified.body.data.user.role.name, 'CUSTOMER');
    assert.notEqual(verified.body.data.user.role.id, 1);
    assert.ok(verified.body.data.tokens.access_token);
    assert.ok((await User.findOne({ where: { email: identity.email } })).email_verified_at);

    const reused = await request(app).post('/api/v1/auth/register/verify').send({ email: identity.email, code: '123456' });
    assert.equal(reused.status, 422);
  } finally {
    await cleanupUser(identity.email);
  }
});

test('registration verification rejects a code after its 60-second expiry', async () => {
  const identity = uniqueIdentity('expired-code');
  try {
    const requested = await request(app).post('/api/v1/auth/register').send({
      name: 'Código', last_name: 'Vencido', email: identity.email, phone: identity.phone,
      password: 'TestPassword123!', password_confirmation: 'TestPassword123!', legal_acceptance: true
    });
    assert.equal(requested.status, 202);
    await EmailVerificationCode.update({ expires_at: new Date(Date.now() - 1000) }, { where: { email: identity.email, consumed_at: null } });
    const expired = await request(app).post('/api/v1/auth/register/verify').send({ email: identity.email, code: '123456' });
    assert.equal(expired.status, 422);
    assert.equal(expired.body.code, 'VERIFICATION_CODE_EXPIRED');
    assert.equal(await User.count({ where: { email: identity.email } }), 0);
  } finally {
    await cleanupUser(identity.email);
  }
});

test('a new customer can save an address with only address, neighborhood and map coordinates', async () => {
  const identity = uniqueIdentity('initial-address');
  try {
    const requested = await request(app).post('/api/v1/auth/register').send({
      name: 'Cliente', last_name: 'Nuevo', email: identity.email, phone: identity.phone,
      password: 'TestPassword123!', password_confirmation: 'TestPassword123!', legal_acceptance: true
    });
    assert.equal(requested.status, 202);

    const verified = await request(app).post('/api/v1/auth/register/verify').send({ email: identity.email, code: '123456' });
    assert.equal(verified.status, 201);

    const created = await request(app)
      .post('/api/v1/customer/addresses')
      .set('Authorization', `Bearer ${verified.body.data.tokens.access_token}`)
      .send({
        address_line: 'Calle 10 # 20-30',
        neighborhood: 'Centro',
        latitude: 3.3978953,
        longitude: -76.4465411,
        is_default: true
      });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.address.address_line, 'Calle 10 # 20-30');
    assert.equal(created.body.data.address.neighborhood, 'Centro');
    assert.equal(created.body.data.address.label, 'Casa');
    assert.equal(created.body.data.address.recipient_name, 'Cliente Nuevo');
    assert.equal(created.body.data.address.recipient_phone, identity.phone);
    assert.ok(created.body.data.address.city == null);
    assert.ok(created.body.data.address.additional_details == null);
  } finally {
    await cleanupUser(identity.email);
  }
});

test('register validates fields and returns 409 for verified duplicate email or phone', async () => {
  const identity = uniqueIdentity('duplicate');
  try {
    const created = await request(app).post('/api/v1/auth/register').send({
      name: 'Duplicado', last_name: 'Prueba', email: identity.email, phone: identity.phone,
      password: 'TestPassword123!', password_confirmation: 'TestPassword123!', legal_acceptance: true
    });
    assert.equal(created.status, 202);
    const verified = await request(app).post('/api/v1/auth/register/verify').send({ email: identity.email, code: '123456' });
    assert.equal(verified.status, 201);

    const duplicateEmail = await request(app).post('/api/v1/auth/register').send({
      name: 'Otro', last_name: 'Usuario', email: identity.email, phone: uniqueIdentity('email').phone,
      password: 'TestPassword123!', password_confirmation: 'TestPassword123!', legal_acceptance: true
    });
    assert.equal(duplicateEmail.status, 409);

    const duplicatePhone = await request(app).post('/api/v1/auth/register').send({
      name: 'Otro', last_name: 'Usuario', email: uniqueIdentity('phone').email, phone: identity.phone,
      password: 'TestPassword123!', password_confirmation: 'TestPassword123!', legal_acceptance: true
    });
    assert.equal(duplicatePhone.status, 409);

    const invalid = await request(app).post('/api/v1/auth/register').send({
      name: 12, last_name: '', email: 'not-an-email', phone: '123', password: 'short', password_confirmation: 'different', legal_acceptance: true
    });
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.errors.length > 0);
  } finally {
    await cleanupUser(identity.email);
  }
});

test('Google invalid token is rejected without exposing provider details', async () => {
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => { throw new Error('invalid fixture token'); };
  try {
    await assert.rejects(() => authService.loginWithGoogle('fixture-invalid-token'), (error) => error.statusCode === 401);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
  }
});

test('new Google user requires phone, creates CUSTOMER with google_sub, and reuses it by sub', async () => {
  const identity = uniqueIdentity('google');
  const googleSub = `google-sub-${Date.now()}-${Math.random()}`;
  const googlePicture = 'https://lh3.googleusercontent.com/a/test-photo';
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: googleSub, email: identity.email, email_verified: true, given_name: 'Google', family_name: 'Cliente', picture: googlePicture
  }) });
  try {
    await assert.rejects(
      () => authService.loginWithGoogle('fixture-google-token', undefined, true),
      (error) => error.statusCode === 422 && error.code === 'GOOGLE_PHONE_REQUIRED'
    );
    assert.equal(await User.count({ where: { email: identity.email } }), 0);

    const first = await authService.loginWithGoogle('fixture-google-token', identity.phone, true);
    assert.equal(first.user.role.name, 'CUSTOMER');
    assert.equal(first.user.profile_image, googlePicture);
    const created = await User.findOne({ where: { email: identity.email } });
    assert.equal(created.google_sub, googleSub);
    assert.equal(created.profile_image, googlePicture);

    const second = await authService.loginWithGoogle('fixture-google-token', '+57 300-000-0000');
    assert.equal(second.user.id, first.user.id);
    assert.equal(await User.count({ where: { google_sub: googleSub } }), 1);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await cleanupUser(identity.email);
  }
});

test('Google links an existing customer by email and stores the verified picture', async () => {
  const identity = uniqueIdentity('google-link');
  const googleSub = `google-link-sub-${Date.now()}-${Math.random()}`;
  const googlePicture = 'https://lh3.googleusercontent.com/a/linked-photo';
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  const user = await User.create({
    role_id: customerRole.id, name: 'Correo', last_name: 'Existente', email: identity.email,
    phone: identity.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'active',
    google_sub: null, profile_image: null
  });
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: googleSub, email: identity.email, email_verified: true, picture: googlePicture
  }) });
  try {
    const result = await authService.loginWithGoogle('fixture-google-link');
    assert.equal(result.user.id, user.id);
    const saved = await User.findByPk(user.id);
    assert.equal(saved.google_sub, googleSub);
    assert.equal(saved.profile_image, googlePicture);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await cleanupUser(identity.email);
  }
});

test('Google refreshes an existing external picture on re-entry', async () => {
  const identity = uniqueIdentity('google-refresh');
  const googleSub = `google-refresh-sub-${Date.now()}-${Math.random()}`;
  const nextPicture = 'https://lh3.googleusercontent.com/a/refreshed-photo';
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  const user = await User.create({
    role_id: customerRole.id, name: 'Foto', last_name: 'Externa', email: identity.email,
    phone: identity.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'active',
    google_sub: googleSub, profile_image: 'https://lh3.googleusercontent.com/a/old-photo'
  });
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: googleSub, email: identity.email, email_verified: true, picture: nextPicture
  }) });
  try {
    const result = await authService.loginWithGoogle('fixture-google-refresh');
    assert.equal(result.user.profile_image, nextPicture);
    assert.equal((await User.findByPk(user.id)).profile_image, nextPicture);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await cleanupUser(identity.email);
  }
});

test('Google does not overwrite a locally uploaded profile picture', async () => {
  const identity = uniqueIdentity('google-local-photo');
  const googleSub = `google-local-photo-sub-${Date.now()}-${Math.random()}`;
  const localPicture = '/uploads/profiles/custom.jpg';
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  const user = await User.create({
    role_id: customerRole.id, name: 'Foto', last_name: 'Local', email: identity.email,
    phone: identity.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'active',
    google_sub: googleSub, profile_image: localPicture
  });
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: googleSub, email: identity.email, email_verified: true,
    picture: 'https://lh3.googleusercontent.com/a/google-photo'
  }) });
  try {
    const result = await authService.loginWithGoogle('fixture-google-local-photo');
    assert.equal(result.user.profile_image, localPicture);
    assert.equal((await User.findByPk(user.id)).profile_image, localPicture);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await cleanupUser(identity.email);
  }
});

test('Missing or invalid Google pictures do not erase an existing picture', async () => {
  const identity = uniqueIdentity('google-invalid-photo');
  const googleSub = `google-invalid-photo-sub-${Date.now()}-${Math.random()}`;
  const existingPicture = 'https://lh3.googleusercontent.com/a/keep-photo';
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  const user = await User.create({
    role_id: customerRole.id, name: 'Foto', last_name: 'Valida', email: identity.email,
    phone: identity.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'active',
    google_sub: googleSub, profile_image: existingPicture
  });
  const original = OAuth2Client.prototype.verifyIdToken;
  try {
    for (const picture of [undefined, 'http://insecure.example/photo', `https://${'x'.repeat(501)}`]) {
      OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
        sub: googleSub, email: identity.email, email_verified: true, ...(picture === undefined ? {} : { picture })
      }) });
      const result = await authService.loginWithGoogle('fixture-google-invalid-photo');
      assert.equal(result.user.profile_image, existingPicture);
      assert.equal((await User.findByPk(user.id)).profile_image, existingPicture);
    }
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await cleanupUser(identity.email);
  }
});

test('auth/me keeps exposing profile_image after a Google login', async () => {
  const identity = uniqueIdentity('google-me-photo');
  const googleSub = `google-me-photo-sub-${Date.now()}-${Math.random()}`;
  const googlePicture = 'https://lh3.googleusercontent.com/a/me-photo';
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: googleSub, email: identity.email, email_verified: true, picture: googlePicture,
    given_name: 'Me', family_name: 'Photo'
  }) });
  try {
    const result = await authService.loginWithGoogle('fixture-google-me-photo', identity.phone, true);
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${result.tokens.access_token}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.profile_image, googlePicture);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    await cleanupUser(identity.email);
  }
});

test('Google requires verified email and blocks non-customer or suspended users', async () => {
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  const adminRole = await Role.findOne({ where: { name: 'SUPER_ADMIN', scope: 'platform' } });
  const suspended = uniqueIdentity('suspended');
  const admin = uniqueIdentity('admin');
  const original = OAuth2Client.prototype.verifyIdToken;
  const users = [];
  users.push(await User.create({ role_id: customerRole.id, name: 'Suspendido', last_name: 'Google', email: suspended.email, phone: suspended.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'suspended' }));
  users.push(await User.create({ role_id: adminRole.id, name: 'Admin', last_name: 'Google', email: admin.email, phone: admin.phone, password: await bcrypt.hash('TestPassword123!', 12), status: 'active' }));
  try {
    OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: 'unverified-sub', email: uniqueIdentity('unverified').email, email_verified: false }) });
    await assert.rejects(() => authService.loginWithGoogle('fixture-unverified'), (error) => error.statusCode === 422);

    OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: 'suspended-sub', email: suspended.email, email_verified: true }) });
    await assert.rejects(() => authService.loginWithGoogle('fixture-suspended'), (error) => error.statusCode === 403);

    OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: 'admin-sub', email: admin.email, email_verified: true }) });
    await assert.rejects(() => authService.loginWithGoogle('fixture-admin'), (error) => error.statusCode === 403);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    for (const user of users) {
      await AuthRefreshToken.destroy({ where: { user_id: user.id } });
      await user.destroy();
    }
  }
});

test.after(async () => {
  crypto.randomInt = originalRandomInt;
  await sequelize.close();
});
