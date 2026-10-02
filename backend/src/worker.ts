import 'dotenv/config';
import { Server } from 'node:http';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { connectDatabase } from './config/db.js';
import { validateEnvironment } from './config/env.js';
import { createRedisConnection } from './queue/callQueue.js';
import { startCallWorker } from './queue/callWorker.js';
import { createWorkerHealthServer } from './workerHealthServer.js';

let healthServer: Server | undefined;
let redisConnection: Redis | undefined;
let callWorker: Worker | undefined;
let shutdownPromise: Promise<void> | undefined;

async function closeHealthServer(): Promise<void> {
  if (!healthServer?.listening) return;
  await new Promise<void>((resolve, reject) => {
    healthServer!.close((error) => error ? reject(error) : resolve());
  });
}

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    console.log(`[Worker Service] Received ${signal}. Initiating graceful shutdown...`);
    const forceExitTimer = setTimeout(() => {
      console.error('[Worker Service] Graceful shutdown timed out after 280 seconds, forcing exit.');
      process.exit(1);
    }, 280000).unref();
    let failed = false;

    try {
      await closeHealthServer();
      console.log('[Worker Service] Health server closed.');
    } catch (error) {
      failed = true;
      console.error('[Worker Service] Failed to close health server:', error);
    }

    try {
      if (callWorker) await callWorker.close();
      console.log('[Worker Service] BullMQ worker closed.');
    } catch (error) {
      failed = true;
      console.error('[Worker Service] Failed to close BullMQ worker:', error);
    }

    try {
      if (redisConnection && redisConnection.status !== 'end') {
        if (redisConnection.status === 'ready') await redisConnection.quit();
        else redisConnection.disconnect();
      }
      console.log('[Worker Service] Redis connection closed.');
    } catch (error) {
      failed = true;
      redisConnection?.disconnect();
      console.error('[Worker Service] Failed to close Redis connection:', error);
    }

    try {
      await mongoose.disconnect();
      console.log('[Worker Service] MongoDB disconnected.');
    } catch (error) {
      failed = true;
      console.error('[Worker Service] Failed to disconnect MongoDB:', error);
    }

    clearTimeout(forceExitTimer);
    process.exitCode = failed ? 1 : 0;
    console.log('[Worker Service] Graceful shutdown complete.');
  })();

  return shutdownPromise;
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
async function runWorker() {
  console.log('[Worker Service] Initializing Anfaal BullMQ background worker...');

  try {
    // The current free Render worker is a legacy Web Service, which requires
    // an open HTTP port. A future native Background Worker can disable this.
    if (process.env.WORKER_HEALTHCHECK !== 'false') {
      healthServer = createWorkerHealthServer();
      const port = Number(process.env.PORT || 10000);
      await new Promise<void>((resolve, reject) => {
        healthServer!.once('error', reject);
        healthServer!.listen(port, '0.0.0.0', resolve);
      });
      console.log(`[Worker Service] Health server listening on 0.0.0.0:${port}.`);
    }

    validateEnvironment(true);
    await connectDatabase();
    console.log('[Worker Service] Connected to MongoDB Atlas.');

    redisConnection = createRedisConnection();
    callWorker = startCallWorker(redisConnection);
    console.log('[Worker Service] BullMQ call worker is active and listening to queue: call-processing');
  } catch (err) {
    console.error('[Worker Service] Fatal error during startup:', err);
    await shutdown('startup failure');
    process.exitCode = 1;
  }
}

void runWorker();
