const rateLimit = require('express-rate-limit');
const { failure } = require('../utils/api-response');

function buildHandler(message) {
  return (req, res) => failure(res, {
    statusCode: 429,
    message,
    errors: []
  });
}

const apiRateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_MAX || 600),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/v1/push-tokens'),
  handler: buildHandler('Too many requests. Please try again later.')
});

const authRateLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 25),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: buildHandler('Too many authentication attempts. Please try again later.')
});

module.exports = { apiRateLimiter, authRateLimiter };
