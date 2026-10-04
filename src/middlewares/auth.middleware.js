const jwt = require('jsonwebtoken');
const AppError = require('../utils/app-error');
const { User, Role } = require('../models');

async function authMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new AppError('Authentication token is required', 401);
    }

    const payload = jwt.verify(authorization.slice(7), process.env.JWT_ACCESS_SECRET);
    if (payload.type !== 'access') throw new AppError('Invalid authentication token', 401);

    const user = await User.findByPk(payload.sub, { include: [{ model: Role, as: 'platformRole' }] });
    if (!user || user.status !== 'active') throw new AppError('User is not allowed to access this resource', 401);

    req.auth = { user, tokenPayload: payload };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired authentication token', 401));
    }
    return next(error);
  }
}

function platformRoleMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.user.platformRole.name)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    return next();
  };
}

module.exports = { authMiddleware, platformRoleMiddleware };
