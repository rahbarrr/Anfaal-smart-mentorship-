import cors from 'cors';
import dotenv from 'dotenv';
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
import { checkRedisHealth } from './queue/callQueue.js';

dotenv.config();

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((u) => u.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, tests)
      if (!origin) return callback(null, true);

      if (!isProduction) {
        return callback(null, true);
      }

      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy violation: origin ${origin} is not allowed.`));
    },
    credentials: true,
  }),
);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
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
