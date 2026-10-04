const MIN_SECRET_LENGTH = 32;

function swaggerEnabled(environment = process.env) {
  return environment.SWAGGER_ENABLED === 'true' || (
    environment.SWAGGER_ENABLED !== 'false' && environment.NODE_ENV !== 'production'
  );
}

function validateSecurityConfiguration(environment = process.env) {
  if (environment.NODE_ENV !== 'production') return;

  const missing = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CORS_ORIGIN']
    .filter((key) => !environment[key] || !String(environment[key]).trim());
  if (missing.length) throw new Error(`Missing required production security configuration: ${missing.join(', ')}`);

  const weakSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']
    .filter((key) => String(environment[key]).trim().length < MIN_SECRET_LENGTH);
  if (weakSecrets.length) throw new Error(`Production secrets must be at least ${MIN_SECRET_LENGTH} characters: ${weakSecrets.join(', ')}`);
}

module.exports = { MIN_SECRET_LENGTH, swaggerEnabled, validateSecurityConfiguration };
