import dotenv from 'dotenv';
import { connectDatabase } from './config/db.js';
import { startCallWorker } from './queue/callWorker.js';

dotenv.config();

async function runWorker() {
  console.log('[Worker Service] Initializing Anfaal background worker...');

  try {
    await connectDatabase();
    console.log('[Worker Service] Connected to MongoDB database.');

    const worker = startCallWorker();
    console.log('[Worker Service] BullMQ call worker is active and awaiting jobs on queue: call-processing');

    const shutdown = async (signal: string) => {
      console.log(`[Worker Service] Received ${signal}. Closing worker gracefully...`);
      try {
        await worker.close();
        console.log('[Worker Service] Worker closed. Exiting process.');
        process.exit(0);
      } catch (err) {
        console.error('[Worker Service] Error during worker shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[Worker Service] Fatal error during worker startup:', err);
    process.exit(1);
  }
}

runWorker();
