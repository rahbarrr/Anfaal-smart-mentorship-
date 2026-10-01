import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from './config/db.js';
import { validateEnvironment } from './config/env.js';
import { startCallWorker } from './queue/callWorker.js';

async function runWorker() {
  console.log('[Worker Service] Initializing Anfaal background worker (Render Worker)...');

  try {
    // Validate all required environment variables for the worker service
    validateEnvironment(true);

    await connectDatabase();
    console.log('[Worker Service] Connected to MongoDB Atlas.');

    const worker = startCallWorker();
    console.log('[Worker Service] BullMQ call worker is active and listening to queue: call-processing');

    const shutdown = async (signal: string) => {
      console.log(`[Worker Service] Received ${signal}. Initiating graceful shutdown...`);
      try {
        console.log('[Worker Service] Closing BullMQ worker (finishing active jobs)...');
        await worker.close();
        console.log('[Worker Service] BullMQ worker closed.');

        console.log('[Worker Service] Disconnecting from MongoDB...');
        await mongoose.disconnect();
        console.log('[Worker Service] MongoDB disconnected. Graceful shutdown complete.');

        process.exit(0);
      } catch (err) {
        console.error('[Worker Service] Error during graceful shutdown:', err);
        process.exit(1);
      }
    };

    // Safety timeout: force exit if worker fails to stop within 15 seconds
    const setupTimeout = () => {
      setTimeout(() => {
        console.error('[Worker Service] Graceful shutdown timed out after 15 seconds, forcing exit.');
        process.exit(1);
      }, 15000).unref();
    };

    process.on('SIGINT', () => {
      setupTimeout();
      shutdown('SIGINT');
    });

    process.on('SIGTERM', () => {
      setupTimeout();
      shutdown('SIGTERM');
    });
  } catch (err) {
    console.error('[Worker Service] Fatal error during worker startup:', err);
    process.exit(1);
  }
}

runWorker();

