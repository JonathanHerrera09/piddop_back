const AppError = require('../utils/app-error');
const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const { isExpoPushToken, registerPushToken, revokePushToken } = require('../services/push.service');

const register = asyncHandler(async (req, res) => {
  const { app_scope: appScope, device_name: deviceName, platform, token } = req.body;

  if (!isExpoPushToken(token) || !['android', 'ios'].includes(platform) || !['customer', 'driver'].includes(appScope)) {
    throw new AppError('token, platform and app_scope are required', 422);
  }

  const pushToken = await registerPushToken({
    appScope,
    deviceName,
    platform,
    token,
    userId: req.auth.user.id
  });

  console.log(
    '[push-token] registered',
    JSON.stringify({
      app_scope: appScope,
      platform,
      token_sha256: require('node:crypto').createHash('sha256').update(token).digest('hex').slice(0, 12),
      user_id: req.auth.user.id
    })
  );

  return success(res, {
    message: 'Push token registered successfully',
    data: { push_token: pushToken }
  });
});

const revoke = asyncHandler(async (req, res) => {
  if (!req.body.token) {
    throw new AppError('token is required', 422);
  }

  await revokePushToken({
    token: req.body.token,
    userId: req.auth.user.id
  });

  return success(res, {
    message: 'Push token revoked successfully',
    data: {}
  });
});

module.exports = { register, revoke };
