const { sequelize } = require('../models');
const { success } = require('../utils/api-response');

async function getHealth(req, res, next) {
  try {
    await sequelize.authenticate();

    return success(res, {
      message: 'API is healthy',
      data: {
        api: 'up',
        database: 'connected',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    error.statusCode = 503;
    error.message = 'Database is unavailable';
    return next(error);
  }
}

module.exports = { getHealth };
