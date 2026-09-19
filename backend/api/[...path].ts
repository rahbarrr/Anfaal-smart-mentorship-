import app from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';

let databaseConnection: Promise<void> | undefined;

/**
 * Vercel serverless entry point. The Express app owns all /api routes while
 * the shared promise keeps warm function invocations on one Mongo connection.
 */
export default async function handler(request: any, response: any) {
  try {
    databaseConnection ??= connectDatabase();
    await databaseConnection;
    return app(request, response);
  } catch (error) {
    databaseConnection = undefined;
    console.error('Database connection failed:', error);
    return response.status(503).json({ message: 'Database temporarily unavailable' });
  }
}
