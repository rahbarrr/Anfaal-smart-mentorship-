import bcrypt from 'bcryptjs';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';

export async function ensureDefaultAdmin(
  email = 'admin@anfaalfoundation.com',
  password = process.env.ADMIN_PASSWORD ?? 'Admin@123',
) {
  const existing = await User.findOne({ email });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(password, 10);
  return User.create({
    name: 'Anfaal Admin',
    email,
    passwordHash,
    role: 'ADMIN',
    status: 'active',
  });
}

export async function ensureDefaultMentor() {
  const existingUser = await User.findOne({ email: 'mentor@anfaalfoundation.com' });
  if (existingUser) {
    const existingProfile = await Mentor.findOne({ userId: String(existingUser._id) });
    if (!existingProfile) {
      await Mentor.create({ userId: String(existingUser._id), status: 'active' });
    }
    return existingUser;
  }

  const passwordHash = await bcrypt.hash(process.env.MENTOR_PASSWORD ?? 'Mentor@123', 10);
  const user = await User.create({
    name: 'Anfaal Mentor',
    email: 'mentor@anfaalfoundation.com',
    passwordHash,
    role: 'MENTOR',
    status: 'active',
  });
  await Mentor.create({ userId: String(user._id), status: 'active' });
  return user;
}

export async function ensureDefaultMentee() {
  const existing = await Mentee.findOne({ name: 'Aisha Khan' });
  if (existing) return existing;

  return Mentee.create({
    name: 'Aisha Khan',
    standard: 'Class 8',
    contactInformation: { phone: '+966500000001', guardian: 'Fatima Khan' },
    status: 'active',
  });
}

export async function ensureDefaultMenteeUser() {
  const mentee = await ensureDefaultMentee();
  const menteeId = String(mentee._id);

  let user = await User.findOne({ email: 'mentee@anfaalfoundation.com' });
  if (!user) {
    const passwordHash = await bcrypt.hash(process.env.MENTEE_PASSWORD ?? 'Mentee@123', 10);
    user = await User.create({
      name: 'Aisha Khan',
      email: 'mentee@anfaalfoundation.com',
      passwordHash,
      role: 'MENTEE',
      status: 'active',
      menteeId,
    });
  } else if (!user.menteeId) {
    user.menteeId = menteeId;
    await user.save();
  }

  if (!mentee.userId) {
    mentee.userId = String(user._id);
    await mentee.save();
  }

  // Ensure mentorship assignment with default mentor
  const mentorUser = await ensureDefaultMentor();
  const mentorProfile = await Mentor.findOne({ userId: String(mentorUser._id) });
  if (mentorProfile) {
    const mentorId = String(mentorProfile._id);
    const existingAssignment = await Mentorship.findOne({ mentorId, menteeId, status: 'active' });
    if (!existingAssignment) {
      await Mentorship.create({ mentorId, menteeId, status: 'active' });
    }
  }

  // Seed initial sample performance records if none exist
  const { DailyPerformance } = await import('../models/DailyPerformance.js');
  const count = await DailyPerformance.countDocuments({ menteeId });
  if (count === 0) {
    const samples = [
      { daysAgo: 4, studyMin: 90, ruku: 1, ayat: 20, pages: 3, readingMin: 15, rating: 3, reflection: 'Reviewed algebra problems and read history chapter.' },
      { daysAgo: 3, studyMin: 120, ruku: 2, ayat: 30, pages: 4, readingMin: 20, rating: 4, reflection: 'Practiced science diagrams and vocabulary.' },
      { daysAgo: 2, studyMin: 150, ruku: 2, ayat: 35, pages: 5, readingMin: 30, rating: 5, reflection: 'Finished assignment early and helped younger sibling.' },
      { daysAgo: 1, studyMin: 120, ruku: 3, ayat: 40, pages: 5, readingMin: 25, rating: 4, reflection: 'Read Quran and completed biology revision notes.' },
      { daysAgo: 0, studyMin: 150, ruku: 3, ayat: 42, pages: 6, readingMin: 30, rating: 5, reflection: 'Completed mathematics assignment and felt confident during presentation practice.' },
    ];

    for (const s of samples) {
      const d = new Date();
      d.setDate(d.getDate() - s.daysAgo);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      await DailyPerformance.create({
        menteeId,
        date: dateStr,
        studyMinutes: s.studyMin,
        quran: { ruku: s.ruku, ayat: s.ayat, pages: s.pages },
        readingMinutes: s.readingMin,
        dayRating: s.rating,
        dailyReflection: s.reflection,
        facedDifficulty: s.daysAgo === 4,
        difficultyNote: s.daysAgo === 4 ? 'I had difficulty concentrating during my studies.' : undefined,
        needsMentorHelp: s.daysAgo === 4,
        mentorHelpNote: s.daysAgo === 4 ? 'Guidance on organizing my daily revision timetable.' : undefined,
      });
    }
  }

  return user;
}

