import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './env.js';
import authPlugin from './plugins/auth.js';
import registerRoutes from './routes/index.js';

export function buildApp() {
  const fastify = Fastify({
    logger: {
      transport: config.env === 'development' ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } : undefined
    }
  });

  fastify.register(fastifySensible);
  fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Origen no permitido'), false);
      }
    },
    credentials: false
  });

  fastify.register(fastifyRateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow
  });

  fastify.register(authPlugin);
  fastify.register(registerRoutes);

  return fastify;
}
