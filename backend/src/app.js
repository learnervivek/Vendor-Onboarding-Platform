import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import adminUsersRouter from './routes/admin-users.js';
import { ensureCsrfCookie, requireCsrf } from './middleware/csrf.js';
import vendorRouter from './routes/vendor.js';
import reviewsRouter from './routes/reviews.js';
import adminApplicationsRouter from './routes/admin-applications.js';
import adminQueueRouter from './routes/admin-queue.js';
import adminDashboardRouter from './routes/admin-dashboard.js';
import docsRouter from './routes/docs.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' }
  }));
  app.use(pinoHttp({
    level: env.logLevel,
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]'
    }
  }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 50 }));
  app.use(cookieParser(env.cookieSecret));
  app.use(ensureCsrfCookie);
  app.use(requireCsrf);

  const rateLimitOptions = { standardHeaders: 'draft-7', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' };
  const apiLimiter = rateLimit({ ...rateLimitOptions, windowMs: 15 * 60 * 1000, limit: 300, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } } });

  app.get('/api/v1', (_request, response) => {
    response.json({ data: { service: 'edvexa-api', version: 'v1' } });
  });
  app.use('/api/v1/docs', docsRouter);
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1', apiLimiter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin/users', adminUsersRouter);
  app.use('/api/v1/vendor', vendorRouter);
  app.use('/api/v1/reviews', reviewsRouter);
  app.use('/api/v1/admin/applications', adminApplicationsRouter);
  app.use('/api/v1/admin/queue', adminQueueRouter);
  app.use('/api/v1/admin/dashboard', adminDashboardRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
