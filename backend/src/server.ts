import 'dotenv/config';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { validateEnvironment } from './config/env.js';
import { ensureDefaultAdmin, ensureDefaultMentor, ensureDefaultMenteeUser } from './services/seedService.js';
import { configureChatGateway } from './realtime/chatGateway.js';

const port = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    validateEnvironment(false);

    const server = createServer(app);
    const socketIo = new SocketIOServer(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          const cleanOrigin = origin.replace(/\/+$/, '');
          const configuredOrigins = (process.env.CLIENT_URL || '').split(',').map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean);
          const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin);
          const isVercel = /^https:\/\/([a-zA-Z0-9_-]+\.)?anfaal[a-zA-Z0-9_-]*\.vercel\.app$/.test(cleanOrigin);
          const allowed = configuredOrigins.includes(cleanOrigin) || cleanOrigin === 'https://anfaal-smart-mentorship.vercel.app' || isVercel || (process.env.NODE_ENV !== 'production' && isLocal);
          return callback(null, allowed);
        },
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });
    configureChatGateway(socketIo);
    server.listen(port, '0.0.0.0', () => {
      console.log(`[API Service] Anfaal API listening on 0.0.0.0:${port} (env: ${process.env.NODE_ENV || 'development'})`);
    });

    const initDatabaseAndWorker = async () => {
      let isConnected = false;
      while (!isConnected) {
        try {
          await connectDatabase();
          isConnected = true;

          const isProduction = process.env.NODE_ENV === 'production';
          if (!isProduction && process.env.SEED_DEMO_DATA === 'true') {
            await ensureDefaultAdmin();
            await ensureDefaultMentor();
            await ensureDefaultMenteeUser();
          } else if (isProduction && process.env.DISABLE_BOOTSTRAP_ADMIN !== 'true') {
            await ensureDefaultAdmin();
          }

          // Start backend-driven Daily Progress Reminder evaluation scheduler
          const { startReminderScheduler } = await import('./services/reminderSchedulerService.js');
          startReminderScheduler();
        } catch (dbErr: any) {
          console.error('[API Service] MongoDB connection attempt failed:', dbErr.message);
          console.log('[API Service] Will retry database connection in 5 seconds...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    initDatabaseAndWorker().catch((err) => {
      console.error('[API Service] Fatal error in database connection loop:', err);
    });

    // Graceful shutdown handling for Render deployments & restarts
    const shutdown = async (signal: string) => {
      console.log(`[API Service] Received ${signal}. Shutting down gracefully...`);
      const { stopReminderScheduler } = await import('./services/reminderSchedulerService.js');
      stopReminderScheduler();
      server.close(async () => {
        try {
          await mongoose.disconnect();
          console.log('[API Service] MongoDB connection closed.');
          process.exit(0);
        } catch (err) {
          console.error('[API Service] Error during graceful shutdown:', err);
          process.exit(1);
        }
      });

      // Force terminate after 10s if connections take too long to close
      setTimeout(() => {
        console.error('[API Service] Graceful shutdown timed out, forcing exit.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

