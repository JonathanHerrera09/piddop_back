function success(res, { statusCode = 200, message, data = {} }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function failure(res, { statusCode = 500, message, errors = [], code }) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(code ? { code } : {})
  });
}

module.exports = { success, failure };
