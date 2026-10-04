const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error');
const { accessExpiresIn, webAccessExpiresIn, refreshExpiresIn } = require('../config/auth');
const { sequelize, Role, User, AuthRefreshToken, PasswordResetToken, EmailVerificationCode, UserLegalAcceptance } = require('../models');
const emailTemplateService = require('./email-template.service');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const LEGAL_DOCUMENT_VERSION = '2026-10-03';

function publicUser(user) {
  return {
    id: user.id, name: user.name, last_name: user.last_name, email: user.email,
    phone: user.phone, profile_image: user.profile_image, status: user.status, has_password: !user.google_sub,
    role: user.platformRole ? { id: user.platformRole.id, name: user.platformRole.name, scope: user.platformRole.scope } : undefined
  };
}

function createTokens(user) {
  const payload = { sub: String(user.id), type: 'access', role: user.platformRole.name };
  const isWebOperator = ['SUPER_ADMIN', 'COMPANY'].includes(user.platformRole.name);
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: isWebOperator ? webAccessExpiresIn : accessExpiresIn
  });
  // A unique jti prevents two rapid logins from producing the same refresh JWT
  // (the database intentionally enforces a unique token hash).
  const refreshToken = jwt.sign({ sub: String(user.id), type: 'refresh', jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, { expiresIn: refreshExpiresIn });
  const { exp } = jwt.decode(refreshToken);
  return { accessToken, refreshToken, refreshExpiresAt: new Date(exp * 1000) };
}

async function issueTokens(user, transaction) {
  const tokens = createTokens(user);
  await AuthRefreshToken.create({ user_id: user.id, token_hash: hashToken(tokens.refreshToken), expires_at: tokens.refreshExpiresAt }, transaction ? { transaction } : undefined);
  return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
}

async function findUserWithRoleByEmail(email) {
  return User.findOne({ where: { email: email.toLowerCase() }, include: [{ model: Role, as: 'platformRole' }] });
}

function googleAudiences() {
  return [process.env.GOOGLE_OAUTH_WEB_CLIENT_ID].filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const audiences = googleAudiences();

  if (!audiences.length) {
    throw new AppError('Google OAuth is not configured on the server', 500);
  }

  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: audiences
  });

  return ticket.getPayload();
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.trim().replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
}

function normalizeGooglePicture(value) {
  if (typeof value !== 'string') return null;
  const picture = value.trim();
  if (!picture || picture.length > 500) return null;

  try {
    const url = new URL(picture);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function registrationInput(input = {}) {
  const fields = [];
  const values = {};
  for (const field of ['name', 'last_name', 'email', 'phone', 'password', 'password_confirmation']) {
    if (typeof input[field] !== 'string' || !input[field].trim()) fields.push({ field, message: 'Este campo es obligatorio.' });
  }
  if (fields.length) throw new AppError('Revisa los datos del registro.', 422, fields);
  values.name = input.name.trim();
  values.last_name = input.last_name.trim();
  values.email = input.email.trim().toLowerCase();
  values.phone = normalizePhone(input.phone);
  if (!/^\S+@\S+\.\S+$/.test(values.email)) fields.push({ field: 'email', message: 'Ingresa un correo valido.' });
  if (values.name.length > 100) fields.push({ field: 'name', message: 'El nombre es demasiado largo.' });
  if (values.last_name.length > 100) fields.push({ field: 'last_name', message: 'El apellido es demasiado largo.' });
  if (!values.phone) fields.push({ field: 'phone', message: 'Ingresa un telefono valido (7 a 15 digitos).' });
  if (input.password.length < 8) fields.push({ field: 'password', message: 'La contrasena debe tener al menos 8 caracteres.' });
  if (input.password !== input.password_confirmation) fields.push({ field: 'password_confirmation', message: 'Las contrasenas no coinciden.' });
  if (input.legal_acceptance !== true) fields.push({ field: 'legal_acceptance', message: 'Debes aceptar los Términos y autorizar el tratamiento de datos para crear tu cuenta.' });
  if (fields.length) throw new AppError('Revisa los datos del registro.', 422, fields);
  values.password = input.password;
  values.legal_acceptance = true;
  return values;
}

function isUniqueError(error) {
  return error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === 'ER_DUP_ENTRY';
}

async function register(input) {
  const values = registrationInput(input);
  if (await User.findOne({ where: { [Op.or]: [{ email: values.email }, { phone: values.phone }] } })) {
    throw new AppError('El correo o telefono ya esta registrado.', 409);
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = crypto.createHash('sha256').update(`${values.email}:${code}:${process.env.JWT_ACCESS_SECRET}`).digest('hex');
  const registration = {
    name: values.name,
    last_name: values.last_name,
    email: values.email,
    phone: values.phone,
    password_hash: await bcrypt.hash(values.password, 12),
    legal_acceptance: values.legal_acceptance
  };

  await EmailVerificationCode.update({ consumed_at: new Date() }, { where: { email: values.email, consumed_at: null } });
  const verification = await EmailVerificationCode.create({
    email: values.email,
    code_hash: codeHash,
    registration_json: registration,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0
  });

  try {
    await emailTemplateService.sendTemplate('email_verification', values.email, {
      name: values.name,
      code,
      expires_in: 60
    });
    const expiresAt = new Date(Date.now() + 60 * 1000);
    await verification.update({ expires_at: expiresAt });
    return { email: values.email, expires_in: 60, expires_at: expiresAt.toISOString() };
  } catch (error) {
    await verification.destroy().catch(() => undefined);
    throw error;
  }
}

async function verifyRegistration(emailInput, codeInput) {
  const email = String(emailInput || '').trim().toLowerCase();
  const code = String(codeInput || '').trim();
  if (!/^\d{6}$/.test(code) || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new AppError('Ingresa el código de seis dígitos enviado a tu correo.', 422, [], 'VERIFICATION_CODE_INVALID');
  }

  const verification = await EmailVerificationCode.findOne({
    where: { email, consumed_at: null },
    order: [['id', 'DESC']]
  });
  if (!verification || verification.expires_at <= new Date()) {
    throw new AppError('El código venció. Solicita uno nuevo.', 422, [], 'VERIFICATION_CODE_EXPIRED');
  }
  if (verification.attempts >= 5) {
    throw new AppError('Superaste el número de intentos. Solicita un código nuevo.', 429, [], 'VERIFICATION_ATTEMPTS_EXCEEDED');
  }

  const candidateHash = crypto.createHash('sha256').update(`${email}:${code}:${process.env.JWT_ACCESS_SECRET}`).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(verification.code_hash))) {
    await verification.increment('attempts');
    throw new AppError('El código no es correcto.', 422, [], 'VERIFICATION_CODE_INVALID');
  }

  const registration = verification.registration_json;
  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  if (!customerRole) throw new AppError('Customer role is not configured', 500);

  let result;
  try {
    result = await sequelize.transaction(async (transaction) => {
      const locked = await EmailVerificationCode.findByPk(verification.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked || locked.consumed_at || locked.expires_at <= new Date()) {
        throw new AppError('El código venció. Solicita uno nuevo.', 422, [], 'VERIFICATION_CODE_EXPIRED');
      }
      if (await User.findOne({ where: { [Op.or]: [{ email }, { phone: registration.phone }] }, transaction })) {
        throw new AppError('El correo o telefono ya esta registrado.', 409);
      }
      const user = await User.create({
        role_id: customerRole.id,
        name: registration.name,
        last_name: registration.last_name,
        email,
        phone: registration.phone,
        password: registration.password_hash,
        email_verified_at: new Date(),
        status: 'active'
      }, { transaction });
      await UserLegalAcceptance.create({ user_id: user.id, document_key: 'terms_and_data_authorization', document_version: LEGAL_DOCUMENT_VERSION, accepted_at: new Date(), source: 'mobile_email_registration' }, { transaction });
      await locked.update({ consumed_at: new Date() }, { transaction });
      user.platformRole = customerRole;
      return { user: publicUser(user), tokens: await issueTokens(user, transaction) };
    });
  } catch (error) {
    if (isUniqueError(error)) throw new AppError('El correo o telefono ya esta registrado.', 409);
    throw error;
  }

  emailTemplateService.sendTemplate('welcome', email, {
    name: registration.name,
    app_url: process.env.CUSTOMER_APP_URL || 'https://allora.app'
  }).catch((error) => console.error('Welcome email failed:', error.message));
  return result;
}

async function login(email, password) {
  const user = await findUserWithRoleByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) throw new AppError('Invalid email or password', 401);
  if (user.status !== 'active') throw new AppError('This user is not active', 403);
  return { user: publicUser(user), tokens: await issueTokens(user) };
}

async function loginWithGoogle(idToken, phone, legalAcceptance) {
  let payload;

  try {
    payload = await verifyGoogleIdToken(idToken);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('No pudimos validar tu cuenta de Google.', 401);
  }

  if (!payload?.sub || !payload?.email || payload.email_verified !== true) {
    throw new AppError('Tu cuenta de Google no tiene un correo verificado.', 422);
  }

  const googlePicture = normalizeGooglePicture(payload.picture);

  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' } });
  if (!customerRole) throw new AppError('Customer role is not configured', 500);

  let user = await User.findOne({ where: { google_sub: String(payload.sub) }, include: [{ model: Role, as: 'platformRole' }] });
  const email = String(payload.email).trim().toLowerCase();
  const emailUser = await findUserWithRoleByEmail(email);

  if (user && emailUser && user.id !== emailUser.id) {
    throw new AppError('El correo de Google ya pertenece a otro perfil.', 409);
  }
  if (!user) user = emailUser;

  if (user) {
    if (user.platformRole?.name !== 'CUSTOMER') {
      throw new AppError('Esta cuenta no puede iniciar sesion en la app de cliente.', 403);
    }

    if (user.status !== 'active') {
      throw new AppError('This user is not active', 403);
    }

    if (user.google_sub && user.google_sub !== String(payload.sub)) {
      throw new AppError('Esta cuenta ya esta vinculada a otro perfil de Google.', 409);
    }
    const changes = {};
    if (!user.google_sub) {
      changes.google_sub = String(payload.sub);
    }
    if (!user.email_verified_at) {
      changes.email_verified_at = new Date();
    }

    const hasLocalUploadedPhoto =
      typeof user.profile_image === 'string' &&
      user.profile_image.startsWith('/uploads/profiles/');

    if (googlePicture && !hasLocalUploadedPhoto && user.profile_image !== googlePicture) {
      changes.profile_image = googlePicture;
    }

    if (Object.keys(changes).length) {
      try {
        await user.update(changes);
      } catch (error) {
        if (isUniqueError(error)) throw new AppError('Esta cuenta de Google ya esta vinculada.', 409);
        throw error;
      }
    }
    return { user: publicUser(user), tokens: await issueTokens(user) };
  }

  const firstName = String(payload.given_name || payload.name || 'Usuario').trim();
  const lastName = String(payload.family_name || 'Google').trim();
  const normalizedPhone = normalizePhone(phone);
  if (legalAcceptance !== true) throw new AppError('Debes aceptar los Términos y autorizar el tratamiento de datos para crear tu cuenta.', 422, [], 'LEGAL_ACCEPTANCE_REQUIRED');
  if (!normalizedPhone) throw new AppError('Necesitamos tu telefono para crear tu cuenta.', 422, [], 'GOOGLE_PHONE_REQUIRED');
  if (await User.findOne({ where: { phone: normalizedPhone } })) {
    throw new AppError('Ese telefono ya esta registrado.', 409);
  }

  try {
    return await sequelize.transaction(async (transaction) => {
      user = await User.create({
        role_id: customerRole.id,
        name: firstName.slice(0, 100),
        last_name: (lastName || 'Google').slice(0, 100),
        email,
        phone: normalizedPhone,
        google_sub: String(payload.sub),
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
        profile_image: googlePicture,
        email_verified_at: new Date(),
        status: 'active'
      }, { transaction });
      await UserLegalAcceptance.create({ user_id: user.id, document_key: 'terms_and_data_authorization', document_version: LEGAL_DOCUMENT_VERSION, accepted_at: new Date(), source: 'mobile_google_registration' }, { transaction });
      user.platformRole = customerRole;
      return { user: publicUser(user), tokens: await issueTokens(user, transaction) };
    });
  } catch (error) {
    if (isUniqueError(error)) throw new AppError('El correo, telefono o cuenta de Google ya esta registrado.', 409);
    throw error;
  }
}

async function refresh(refreshToken) {
  let payload;
  try { payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET); } catch { throw new AppError('Invalid or expired refresh token', 401); }
  if (payload.type !== 'refresh') throw new AppError('Invalid refresh token', 401);
  const stored = await AuthRefreshToken.findOne({ where: { token_hash: hashToken(refreshToken), revoked_at: null, expires_at: { [Op.gt]: new Date() } } });
  if (!stored) throw new AppError('Invalid or revoked refresh token', 401);
  const user = await User.findByPk(payload.sub, { include: [{ model: Role, as: 'platformRole' }] });
  if (!user || user.status !== 'active') throw new AppError('User is not allowed to access this resource', 401);
  await stored.update({ revoked_at: new Date() });
  return issueTokens(user);
}

async function logout(refreshToken) {
  if (refreshToken) await AuthRefreshToken.update({ revoked_at: new Date() }, { where: { token_hash: hashToken(refreshToken), revoked_at: null } });
}

async function requestPasswordReset(email) {
  const user = await findUserWithRoleByEmail(email);
  if (!user) return null;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES || 30);
  await PasswordResetToken.update({ used_at: new Date() }, { where: { user_id: user.id, used_at: null } });
  await PasswordResetToken.create({ user_id: user.id, token_hash: hashToken(rawToken), expires_at: new Date(Date.now() + minutes * 60 * 1000) });
  return rawToken;
}

async function resetPassword(token, password) {
  const reset = await PasswordResetToken.findOne({ where: { token_hash: hashToken(token), used_at: null, expires_at: { [Op.gt]: new Date() } } });
  if (!reset) throw new AppError('Invalid or expired reset token', 422);
  await sequelize.transaction(async (transaction) => {
    await User.update({ password: await bcrypt.hash(password, 12) }, { where: { id: reset.user_id }, transaction });
    await PasswordResetToken.update({ used_at: new Date() }, { where: { user_id: reset.user_id, used_at: null }, transaction });
    await AuthRefreshToken.update({ revoked_at: new Date() }, { where: { user_id: reset.user_id, revoked_at: null }, transaction });
  });
}

module.exports = { publicUser, register, verifyRegistration, login, loginWithGoogle, refresh, logout, requestPasswordReset, resetPassword };
