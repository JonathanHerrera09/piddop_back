const http = require('node:http');
const { createApp } = require('./app');
const { sequelize } = require('./models');
const { configureSocket } = require('./websocket');

const port = Number(process.env.PORT || 3000);

async function startServer() {
  await sequelize.authenticate();

  const app = createApp();
  const server = http.createServer(app);
  configureSocket(server);

  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
    console.log(`Swagger available at http://localhost:${port}/api/docs`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch((error) => {
  const causes = error.parent?.errors || error.original?.errors;
  const detail = error.message || causes?.map((cause) => cause.message).join('; ') || error.parent?.message || error.original?.message || String(error);
  console.error('API startup failed:', detail);
  process.exit(1);
});
