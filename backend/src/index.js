import { buildApp } from './app.js';
import { config } from './env.js';

const app = buildApp();

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Servidor escuchando en el puerto ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
