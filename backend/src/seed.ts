import dotenv from 'dotenv';
import { connectDatabase } from './config/db.js';
import { ensureDefaultAdmin, ensureDefaultMentor, ensureDefaultMenteeUser } from './services/seedService.js';

dotenv.config();

async function seed() {
  await connectDatabase();
  const admin = await ensureDefaultAdmin();
  console.log(`Seed admin ready: ${admin.email}`);
  const mentor = await ensureDefaultMentor();
  console.log(`Seed mentor ready: ${mentor.email}`);
  const mentee = await ensureDefaultMenteeUser();
  console.log(`Seed mentee ready: ${mentee.email}`);
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
