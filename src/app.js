const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { configureSwagger } = require('./config/swagger');
const { apiRateLimiter } = require('./middlewares/rate-limit.middleware');
const { notFoundMiddleware, errorMiddleware } = require('./middlewares/error.middleware');
const { allowedOrigins } = require('./config/cors');
const { swaggerEnabled } = require('./config/security');

function createApp() {
  // The API authenticates exclusively with Authorization: Bearer tokens, never cookies.
  // Browser cross-site requests therefore cannot carry credentials; CORS remains restricted.
  // nosemgrep: javascript.express.security.audit.express-check-csurf-middleware-usage
  const app = express();
  const origins = allowedOrigins();
  const trustProxy = process.env.TRUST_PROXY;

  app.disable('x-powered-by');
  if (trustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (trustProxy && !Number.isNaN(Number(trustProxy))) {
    app.set('trust proxy', Number(trustProxy));
  } else {
    // Trusting an unspecified proxy lets clients spoof their IP through X-Forwarded-For,
    // which defeats IP based rate limiting. Enable it explicitly when a trusted proxy exists.
    app.set('trust proxy', false);
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

  if (swaggerEnabled()) configureSwagger(app);
  app.use('/api/v1', apiRateLimiter, routes);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };
