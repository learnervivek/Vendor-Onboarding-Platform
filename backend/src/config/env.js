import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? (process.env.NODE_ENV === 'production' ? undefined : fallback);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  clientUrl: required('CLIENT_URL', 'http://localhost:5173'),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/edvexa_vendor_onboarding'),
  cookieSecret: required('COOKIE_SECRET', 'development-only-cookie-secret'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'development-only-access-secret'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'development-only-refresh-secret'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
  storageProvider: process.env.STORAGE_PROVIDER ?? 'local',
  localStoragePath: process.env.LOCAL_STORAGE_PATH ?? './storage/private',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  queueAdapter: process.env.QUEUE_ADAPTER ?? 'redis',
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  queueMaxAttempts: Number(process.env.QUEUE_MAX_ATTEMPTS ?? 3),
  queueBackoffMs: Number(process.env.QUEUE_BACKOFF_MS ?? 1000),
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 5000),
  emailPreviewPath: process.env.EMAIL_PREVIEW_PATH ?? './backend/.data/email-previews',
  logLevel: process.env.LOG_LEVEL ?? 'info'
};
