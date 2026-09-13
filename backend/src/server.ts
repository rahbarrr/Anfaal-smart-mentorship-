import dotenv from 'dotenv';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { ensureDefaultAdmin, ensureDefaultMentee, ensureDefaultMentor, seedDemoData } from './services/seedService.js';

dotenv.config();

const port = Number(process.env.PORT ?? 5000);

async function startServer() {
  try {
    await connectDatabase();
    await ensureDefaultAdmin();
    await ensureDefaultMentor();
    await ensureDefaultMentee();
    await seedDemoData();
    app.listen(port, () => {
      console.log(`Anfaal API running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
