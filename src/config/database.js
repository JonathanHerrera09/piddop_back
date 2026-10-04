require('dotenv').config();

function buildDatabaseSsl(environment = process.env) {
  const required = environment.NODE_ENV === 'production';
  if (!required && environment.DB_SSL !== 'true') return undefined;

  const ssl = { rejectUnauthorized: environment.DB_SSL_REJECT_UNAUTHORIZED !== 'false', minVersion: 'TLSv1.2' };
  if (environment.DB_SSL_CA) ssl.ca = environment.DB_SSL_CA.replace(/\\n/g, '\n');
  return ssl;
}

const base = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'allorajd',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  dialect: 'mysql',
  dialectOptions: { ssl: buildDatabaseSsl() },
  logging: false,
  define: {
    underscored: true,
    freezeTableName: true
  }
};

module.exports = {
  development: base,
  test: { ...base, database: `${base.database}_test` },
  production: base,
  buildDatabaseSsl
};
