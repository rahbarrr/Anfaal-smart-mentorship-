import dotenv from 'dotenv';
import { connectDatabase } from './config/db.js';
import { ensureDefaultAdmin } from './services/seedService.js';

dotenv.config();

async function seed() {
  await connectDatabase();
  const user = await ensureDefaultAdmin();
  console.log(`Seed admin ready: ${user.email}`);
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
