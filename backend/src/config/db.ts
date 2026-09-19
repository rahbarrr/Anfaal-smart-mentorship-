import mongoose from 'mongoose';

export async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/anfaal';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
  }

  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');
}
