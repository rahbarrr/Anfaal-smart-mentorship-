import mongoose from 'mongoose';

export async function connectDatabase(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  // In production MONGODB_URI must be set as an environment variable (enforced by validateEnvironment).
  const mongoUri = process.env.MONGODB_URI || (isProd ? '' : 'mongodb://localhost:27017/anfaal');

  if (isProd && !mongoUri) {
    throw new Error('[Database] MONGODB_URI environment variable is required in production.');
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
