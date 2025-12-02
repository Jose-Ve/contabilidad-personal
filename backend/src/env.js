import 'dotenv/config';

const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET'];

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Variable de entorno faltante: ${key}`);
  }
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET,
  siteUrl: process.env.SITE_URL ?? 'http://localhost:5173',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  rateLimit: {
    max: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute'
  }
};
