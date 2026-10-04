const developmentOrigins = ['http://localhost:5174', 'http://localhost:5173'];

function allowedOrigins(environment = process.env) {
  const configured = environment.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || [];
  if (configured.length) return configured;
  if (environment.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN must be configured in production');
  }
  return developmentOrigins;
}

module.exports = { allowedOrigins };
