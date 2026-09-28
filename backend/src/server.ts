import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { validateEnvironment } from './config/env.js';
import { ensureDefaultAdmin, ensureDefaultMentor, ensureDefaultMenteeUser } from './services/seedService.js';

dotenv.config();

const port = Number(process.env.PORT ?? 5000);

async function startServer() {
  try {
    validateEnvironment(false);
    await connectDatabase();
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isProduction) {
      await ensureDefaultAdmin();
      await ensureDefaultMentor();
      await ensureDefaultMenteeUser();
    } else {
      const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
      const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (adminEmail && adminPassword) {
        await ensureDefaultAdmin(adminEmail, adminPassword);
      }
    }

    const server = app.listen(port, () => {
      console.log(`[API Service] Anfaal API running on port ${port} (env: ${process.env.NODE_ENV || 'development'})`);
    });

    // Start background worker in-process if enabled (allows 100% free hosting without paid Render worker)
    let callWorker: any = null;
    if (process.env.RUN_WORKER !== 'false') {
      try {
        const { startCallWorker } = await import('./queue/callWorker.js');
        callWorker = startCallWorker();
        console.log('[Worker Service] BullMQ background worker started in background process.');
      } catch (workerErr) {
        console.warn('[Worker Service] Note: BullMQ worker initialization:', workerErr instanceof Error ? workerErr.message : workerErr);
      }
    }

    // Graceful shutdown handling for Render deployments & restarts
    const shutdown = async (signal: string) => {
      console.log(`[API Service] Received ${signal}. Shutting down gracefully...`);
      if (callWorker) {
        try {
          await callWorker.close();
          console.log('[Worker Service] BullMQ worker closed.');
        } catch {
          // ignore
        }
      }
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

