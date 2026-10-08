import 'dotenv/config';
import cors from 'cors';
import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import callRoutes from './routes/callRoutes.js';
import mentorRoutes from './routes/mentorRoutes.js';
import menteeRoutes from './routes/menteeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import dailyPerformanceRoutes from './routes/dailyPerformanceRoutes.js';
import bulkImportRoutes from './routes/bulkImportRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { checkRedisHealth } from './queue/callQueue.js';

const app = express();

// Enable trust proxy for Render / Cloudflare environment
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';
const allowLocalOrigins = process.env.ALLOW_LOCAL_ORIGINS === 'true' || !isProduction;
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '2mb';
const urlEncodedBodyLimit = process.env.URLENCODED_BODY_LIMIT || '2mb';
const rawOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Always allow the canonical Anfaal Vercel deployment regardless of CLIENT_URL config
const ALWAYS_ALLOWED_ORIGINS = new Set([
  'https://anfaal-smart-mentorship.vercel.app',
]);

const allowedOrigins = new Set([...ALWAYS_ALLOWED_ORIGINS, ...rawOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const cleanOrigin = origin.replace(/\/+$/, '');

      // Allow if explicit in allowedOrigins
      if (allowedOrigins.has(cleanOrigin)) {
        return callback(null, true);
      }

      // Allow any Vercel preview or production deployment URL for this project
      if (/^https:\/\/([a-zA-Z0-9_-]+-)?anfaal[a-zA-Z0-9_-]*\.vercel\.app$/.test(cleanOrigin)
        || /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(cleanOrigin)) {
        return callback(null, true);
      }

      // Allow local development
      if (allowLocalOrigins && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
        return callback(null, true);
      }

      console.warn(`[CORS] Origin rejected: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
  }),
);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header('X-Request-ID')?.slice(0, 128) || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  res.locals.requestId = requestId;
  next();
});
app.use(express.json({ limit: jsonBodyLimit, strict: true }));
app.use(express.urlencoded({ extended: false, limit: urlEncodedBodyLimit }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || (isProduction ? 300 : 1000)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});
app.use(limiter);


// ─── Render Health Check Endpoints ──────────────────────────────────────────
const healthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'anfaal-api',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

const readinessHandler = async (_req: Request, res: Response) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  const isRedisConnected = await checkRedisHealth();

  const isReady = isMongoConnected && (process.env.NODE_ENV !== 'production' || isRedisConnected);

  const payload = {
    status: isReady ? 'ready' : 'degraded',
    service: 'anfaal-api',
    database: isMongoConnected ? 'connected' : 'disconnected',
    queue: isRedisConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  };

  return res.status(isReady ? 200 : 503).json(payload);
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/health/ready', readinessHandler);
app.get('/api/health/ready', readinessHandler);


app.use('/api/auth', authRoutes);
app.use('/api/mentors', mentorRoutes);
app.use('/api/mentees', menteeRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/daily-performance', dailyPerformanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/import', bulkImportRoutes);
app.use('/api', bulkImportRoutes);
app.use('/api', dailyPerformanceRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;
