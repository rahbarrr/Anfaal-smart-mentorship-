import mongoose from 'mongoose';

const DEFAULT_PROD_URI = 'mongodb+srv://sayedrahbarraza110_db_user:xphOrSAS25aeY59K@cluster1.yztincx.mongodb.net/anfaal_production?retryWrites=true&w=majority&appName=Cluster1';

export async function connectDatabase(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const mongoUri = process.env.MONGODB_URI || (isProd ? DEFAULT_PROD_URI : 'mongodb://localhost:27017/anfaal');

  if (mongoose.connection.readyState === 1) return;

  const maskedUri = mongoUri.replace(/:([^@]+)@/, ':***@');
  console.log(`[Database] Connecting to MongoDB: ${maskedUri}`);

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  console.log('[Database] MongoDB connected successfully.');
}
