require('dotenv').config();

const base = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'allorajd',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  dialect: 'mysql',
  logging: false,
  define: {
    underscored: true,
    freezeTableName: true
  }
};

module.exports = {
  development: base,
  test: { ...base, database: `${base.database}_test` },
  production: base
};
