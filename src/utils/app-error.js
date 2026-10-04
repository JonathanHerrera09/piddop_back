class AppError extends Error {
  constructor(message, statusCode = 500, errors = [], code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
  }
}

module.exports = AppError;
