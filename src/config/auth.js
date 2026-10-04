const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const webAccessExpiresIn = process.env.JWT_WEB_ACCESS_EXPIRES_IN || '8h';
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

module.exports = { accessExpiresIn, webAccessExpiresIn, refreshExpiresIn };
