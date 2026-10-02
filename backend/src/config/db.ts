import mongoose from 'mongoose';

export async function connectDatabase(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const mongoUri = process.env.MONGODB_URI || (!isProd ? 'mongodb://localhost:27017/anfaal' : undefined);

  if (!mongoUri) {
    throw new Error('[Database] MONGODB_URI is required in production.');
  }

  if (mongoose.connection.readyState === 1) return;

  const maskedUri = mongoUri.replace(/:([^@]+)@/, ':***@');
  console.log(`[Database] Connecting to MongoDB: ${maskedUri}`);

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  console.log('[Database] MongoDB connected successfully.');
}
