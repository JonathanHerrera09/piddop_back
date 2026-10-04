const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { configureSwagger } = require('./config/swagger');
const { apiRateLimiter } = require('./middlewares/rate-limit.middleware');
const { notFoundMiddleware, errorMiddleware } = require('./middlewares/error.middleware');
const { allowedOrigins } = require('./config/cors');

function createApp() {
  const app = express();
  const origins = allowedOrigins();
  const trustProxy = process.env.TRUST_PROXY;

  app.disable('x-powered-by');
  if (trustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (trustProxy && !Number.isNaN(Number(trustProxy))) {
    app.set('trust proxy', Number(trustProxy));
  } else {
    app.set('trust proxy', 1);
  }
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use('/uploads', express.static('uploads', {
    setHeaders(res) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  configureSwagger(app);
  app.use('/api/v1', apiRateLimiter, routes);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };
