const { failure } = require('../utils/api-response');

function notFoundMiddleware(req, res) {
  return failure(res, {
    statusCode: 404,
    message: 'Route not found',
    errors: [{ path: req.originalUrl, message: 'The requested endpoint does not exist.' }]
  });
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);

  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message = isServerError && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message || 'Internal server error';

  if (isServerError) console.error(error);

  return failure(res, {
    statusCode,
    message,
    errors: isServerError && process.env.NODE_ENV === 'production' ? [] : error.errors || [],
    code: isServerError && process.env.NODE_ENV === 'production' ? undefined : error.code
  });
}

module.exports = { notFoundMiddleware, errorMiddleware };
