const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const authService = require('../services/auth.service');

function required(body, fields) {
  const missing = fields.filter((field) => !body[field] || !String(body[field]).trim());
  if (missing.length) throw new AppError('Validation failed', 422, missing.map((field) => ({ field, message: 'This field is required.' })));
}
function passwordValid(password) { return typeof password === 'string' && password.length >= 8; }

const register = asyncHandler(async (req, res) => {
  required(req.body, ['name', 'last_name', 'email', 'phone', 'password', 'password_confirmation']);
  const result = await authService.register(req.body);
  return success(res, { statusCode: 202, message: 'Te enviamos un código de verificación.', data: result });
});

const verifyRegistration = asyncHandler(async (req, res) => {
  required(req.body, ['email', 'code']);
  const result = await authService.verifyRegistration(req.body.email, req.body.code);
  return success(res, { statusCode: 201, message: 'Correo verificado y cuenta creada correctamente.', data: result });
});

const login = asyncHandler(async (req, res) => {
  required(req.body, ['email', 'password']);
  const result = await authService.login(req.body.email, req.body.password);
  return success(res, { message: 'Login successful', data: result });
});

const googleMobileLogin = asyncHandler(async (req, res) => {
  required(req.body, ['id_token']);
  const result = await authService.loginWithGoogle(req.body.id_token, req.body.phone, req.body.legal_acceptance);
  return success(res, { message: 'Google login successful', data: result });
});

const refresh = asyncHandler(async (req, res) => {
  required(req.body, ['refresh_token']);
  return success(res, { message: 'Token refreshed successfully', data: await authService.refresh(req.body.refresh_token) });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refresh_token);
  return success(res, { message: 'Logout successful', data: {} });
});

const forgotPassword = asyncHandler(async (req, res) => {
  required(req.body, ['email']);
  const resetToken = await authService.requestPasswordReset(req.body.email);
  const data = process.env.NODE_ENV === 'production' || !resetToken ? {} : { reset_token: resetToken };
  return success(res, { message: 'If the account exists, reset instructions were created', data });
});

const resetPassword = asyncHandler(async (req, res) => {
  required(req.body, ['token', 'password', 'password_confirmation']);
  if (!passwordValid(req.body.password) || req.body.password !== req.body.password_confirmation) throw new AppError('Validation failed', 422);
  await authService.resetPassword(req.body.token, req.body.password);
  return success(res, { message: 'Password reset successfully', data: {} });
});

const me = asyncHandler(async (req, res) => success(res, { message: 'Authenticated user retrieved successfully', data: authService.publicUser(req.auth.user) }));

module.exports = { register, verifyRegistration, login, googleMobileLogin, refresh, logout, forgotPassword, resetPassword, me };
