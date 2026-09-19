import dotenv from 'dotenv';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { ensureDefaultAdmin, ensureDefaultMentor, ensureDefaultMenteeUser } from './services/seedService.js';

dotenv.config();

const port = Number(process.env.PORT ?? 5000);

async function startServer() {
  try {
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
    app.listen(port, () => {
      console.log(`Anfaal API running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
