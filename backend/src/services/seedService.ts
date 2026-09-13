import bcrypt from 'bcryptjs';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Call } from '../models/Call.js';
import { User } from '../models/User.js';

export async function ensureDefaultAdmin() {
  const existing = await User.findOne({ email: 'admin@anfaalfoundation.com' });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'Admin@123', 10);
  return User.create({
    name: 'Anfaal Admin',
    email: 'admin@anfaalfoundation.com',
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

// ─── Full demo seed (10 mentors, 30 mentees, 50 calls) ───────────────────────

const MENTOR_DATA = [
  { name: 'Rahul Sharma', email: 'rahul.sharma@anfaalfoundation.com', phone: '+91-9800000001' },
  { name: 'Priya Nair', email: 'priya.nair@anfaalfoundation.com', phone: '+91-9800000002' },
  { name: 'Arjun Mehta', email: 'arjun.mehta@anfaalfoundation.com', phone: '+91-9800000003' },
  { name: 'Sunita Rao', email: 'sunita.rao@anfaalfoundation.com', phone: '+91-9800000004' },
  { name: 'Vikram Patel', email: 'vikram.patel@anfaalfoundation.com', phone: '+91-9800000005' },
  { name: 'Deepa Krishnan', email: 'deepa.krishnan@anfaalfoundation.com', phone: '+91-9800000006' },
  { name: 'Rohit Verma', email: 'rohit.verma@anfaalfoundation.com', phone: '+91-9800000007' },
  { name: 'Anita Desai', email: 'anita.desai@anfaalfoundation.com', phone: '+91-9800000008' },
  { name: 'Suresh Iyer', email: 'suresh.iyer@anfaalfoundation.com', phone: '+91-9800000009' },
  { name: 'Kavita Reddy', email: 'kavita.reddy@anfaalfoundation.com', phone: '+91-9800000010' },
];

const MENTEE_DATA = [
  { name: 'Aisha Khan', standard: 'Class 8', guardian: 'Fatima Khan', phone: '+91-7700000001' },
  { name: 'Nadia Hussain', standard: 'Class 9', guardian: 'Zara Hussain', phone: '+91-7700000002' },
  { name: 'Hassan Ali', standard: 'Class 7', guardian: 'Imran Ali', phone: '+91-7700000003' },
  { name: 'Riya Gupta', standard: 'Class 10', guardian: 'Mohan Gupta', phone: '+91-7700000004' },
  { name: 'Aryan Singh', standard: 'Class 6', guardian: 'Rajesh Singh', phone: '+91-7700000005' },
  { name: 'Meera Pillai', standard: 'Class 8', guardian: 'Suresh Pillai', phone: '+91-7700000006' },
  { name: 'Zaid Ahmed', standard: 'Class 9', guardian: 'Tariq Ahmed', phone: '+91-7700000007' },
  { name: 'Anjali Sharma', standard: 'Class 7', guardian: 'Kamal Sharma', phone: '+91-7700000008' },
  { name: 'Kabir Verma', standard: 'Class 10', guardian: 'Ashok Verma', phone: '+91-7700000009' },
  { name: 'Pooja Nair', standard: 'Class 6', guardian: 'Ravi Nair', phone: '+91-7700000010' },
  { name: 'Farhan Shaikh', standard: 'Class 8', guardian: 'Salim Shaikh', phone: '+91-7700000011' },
  { name: 'Divya Reddy', standard: 'Class 9', guardian: 'Venkat Reddy', phone: '+91-7700000012' },
  { name: 'Imran Qureshi', standard: 'Class 7', guardian: 'Bashir Qureshi', phone: '+91-7700000013' },
  { name: 'Sneha Desai', standard: 'Class 10', guardian: 'Harish Desai', phone: '+91-7700000014' },
  { name: 'Rohan Mehta', standard: 'Class 6', guardian: 'Vivek Mehta', phone: '+91-7700000015' },
  { name: 'Simran Kaur', standard: 'Class 8', guardian: 'Gurpreet Kaur', phone: '+91-7700000016' },
  { name: 'Ayesha Malik', standard: 'Class 9', guardian: 'Usman Malik', phone: '+91-7700000017' },
  { name: 'Rahul Kumar', standard: 'Class 7', guardian: 'Sunil Kumar', phone: '+91-7700000018' },
  { name: 'Lakshmi Iyer', standard: 'Class 10', guardian: 'Shiva Iyer', phone: '+91-7700000019' },
  { name: 'Aarav Patel', standard: 'Class 6', guardian: 'Dilip Patel', phone: '+91-7700000020' },
  { name: 'Fatima Syed', standard: 'Class 8', guardian: 'Hasan Syed', phone: '+91-7700000021' },
  { name: 'Vivaan Joshi', standard: 'Class 9', guardian: 'Pradeep Joshi', phone: '+91-7700000022' },
  { name: 'Ishaan Rao', standard: 'Class 7', guardian: 'Kiran Rao', phone: '+91-7700000023' },
  { name: 'Sara Ansari', standard: 'Class 10', guardian: 'Arif Ansari', phone: '+91-7700000024' },
  { name: 'Diya Krishnamurthy', standard: 'Class 6', guardian: 'Rajesh Krishnamurthy', phone: '+91-7700000025' },
  { name: 'Yusuf Siddiqui', standard: 'Class 8', guardian: 'Asif Siddiqui', phone: '+91-7700000026' },
  { name: 'Ananya Bose', standard: 'Class 9', guardian: 'Tapan Bose', phone: '+91-7700000027' },
  { name: 'Karan Walia', standard: 'Class 7', guardian: 'Narinder Walia', phone: '+91-7700000028' },
  { name: 'Rida Farooq', standard: 'Class 10', guardian: 'Azhar Farooq', phone: '+91-7700000029' },
  { name: 'Neha Tiwari', standard: 'Class 6', guardian: 'Anil Tiwari', phone: '+91-7700000030' },
];

const AI_SUMMARIES = [
  {
    shortSummary: 'The student showed steady improvement in reading habits and study consistency, with additional focus on presentation confidence and weekly goal tracking.',
    keyDiscussionPoints: ['Reviewed academic progress across core subjects', 'Discussed revision schedule and adherence', 'Identified weak areas needing targeted practice'],
    studentConcerns: ['Lower confidence during presentations', 'Difficulty maintaining consistent revision'],
    actionItems: ['Complete weekly reading goals before next session', 'Practice a short presentation each week'],
    followUpRecommendations: ['Share a revised timetable by next meeting', 'Check presentation progress in 7 days'],
    topicsDiscussed: ['Academic progress', 'Study habits', 'Confidence building'],
  },
  {
    shortSummary: 'A productive session focused on exam preparation strategies and managing academic stress. The student identified specific topics that need further review.',
    keyDiscussionPoints: ['Mapped upcoming exam schedule', 'Prioritized high-weightage chapters', 'Introduced spaced repetition techniques'],
    studentConcerns: ['Math problems with algebra', 'Stress around board exams'],
    actionItems: ['Complete algebra worksheets by Thursday', 'Maintain a daily revision log'],
    followUpRecommendations: ['Review math practice results in next session', 'Introduce mindfulness exercise for stress management'],
    topicsDiscussed: ['Exam preparation', 'Stress management', 'Math skills'],
  },
  {
    shortSummary: 'The student demonstrated strong enthusiasm for science topics. Career guidance discussion was productive — interest in engineering was explored.',
    keyDiscussionPoints: ['Discussed career options in STEM', 'Reviewed science project progress', 'Set monthly reading targets for science enrichment'],
    studentConcerns: ['Uncertainty about future stream selection', 'Balancing extracurriculars with academics'],
    actionItems: ['Research two engineering colleges and note key programs', 'Finish science project draft'],
    followUpRecommendations: ['Share college research findings next session', 'Review balance between activities and study'],
    topicsDiscussed: ['Career guidance', 'Science enrichment', 'Stream selection'],
  },
  {
    shortSummary: 'Session addressed the student\'s declining attendance at school. Root causes were explored — family obligations identified as a key factor.',
    keyDiscussionPoints: ['Discussed attendance challenges', 'Explored impact of absences on learning continuity', 'Created a priority plan for school days'],
    studentConcerns: ['Family responsibilities affecting attendance', 'Fear of falling behind peers'],
    actionItems: ['Maintain school attendance minimum 4 days per week', 'Catch up on missed notes with classmate support'],
    followUpRecommendations: ['Coordinate with school administration if needed', 'Follow up on attendance record in two weeks'],
    topicsDiscussed: ['School attendance', 'Family support', 'Catch-up plan'],
  },
  {
    shortSummary: 'The student shared significant progress on language skills. Reading fluency improved by measurable indicators since last session.',
    keyDiscussionPoints: ['Measured reading fluency improvement', 'Discussed vocabulary building strategies', 'Set targets for creative writing practice'],
    studentConcerns: ['Vocabulary gaps in English composition', 'Confidence in speaking during class discussions'],
    actionItems: ['Read one chapter from assigned book daily', 'Write one paragraph of journaling per day'],
    followUpRecommendations: ['Review journal entries next session', 'Practice verbal discussion of reading material'],
    topicsDiscussed: ['Language skills', 'Reading fluency', 'Creative writing'],
  },
];

const REVIEW_STATUSES: Array<'Draft' | 'Pending Review' | 'Approved' | 'Rejected'> = [
  'Approved', 'Approved', 'Approved', 'Pending Review', 'Pending Review',
  'Approved', 'Draft', 'Rejected', 'Approved', 'Pending Review',
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function seedDemoData() {
  // Check if demo data already seeded
  const mentorCount = await User.countDocuments({ role: 'MENTOR' });
  if (mentorCount >= 10) {
    console.log('[seed] Demo data already seeded, skipping.');
    return;
  }

  console.log('[seed] Seeding demo data: 10 mentors, 30 mentees, 50 calls…');

  const defaultPw = process.env.MENTOR_PASSWORD ?? 'Mentor@123';
  const passwordHash = await bcrypt.hash(defaultPw, 10);

  // Create mentor users + profiles
  const mentorIds: string[] = [];
  for (const m of MENTOR_DATA) {
    let user = await User.findOne({ email: m.email });
    if (!user) {
      user = await User.create({ name: m.name, email: m.email, passwordHash, role: 'MENTOR', status: 'active' });
    }
    let profile = await Mentor.findOne({ userId: String(user._id) });
    if (!profile) {
      profile = await Mentor.create({ userId: String(user._id), phone: m.phone, status: 'active' });
    }
    mentorIds.push(String(profile._id));
  }

  // Create mentees
  const menteeIds: string[] = [];
  for (const m of MENTEE_DATA) {
    let mentee = await Mentee.findOne({ name: m.name });
    if (!mentee) {
      mentee = await Mentee.create({
        name: m.name,
        standard: m.standard,
        contactInformation: { phone: m.phone, guardian: m.guardian },
        status: 'active',
      });
    }
    menteeIds.push(String(mentee._id));
  }

  // Assign ~3 mentees per mentor
  let menteeIndex = 0;
  for (let i = 0; i < mentorIds.length; i++) {
    const batchSize = i < 5 ? 3 : 3;
    for (let j = 0; j < batchSize && menteeIndex < menteeIds.length; j++, menteeIndex++) {
      const existing = await Mentorship.findOne({ mentorId: mentorIds[i], menteeId: menteeIds[menteeIndex] });
      if (!existing) {
        await Mentorship.create({ mentorId: mentorIds[i], menteeId: menteeIds[menteeIndex], status: 'active' });
      }
    }
  }

  // Create 50 calls distributed across mentors and mentees
  const callCount = await Call.countDocuments();
  if (callCount < 10) {
    let callIndex = 0;
    for (let i = 0; i < mentorIds.length && callIndex < 50; i++) {
      const callsForMentor = i < 5 ? 6 : 4;
      for (let c = 0; c < callsForMentor && callIndex < 50; c++, callIndex++) {
        const menteeForCall = menteeIds[Math.min(i * 3 + (c % 3), menteeIds.length - 1)];
        const summaryData = AI_SUMMARIES[callIndex % AI_SUMMARIES.length];
        const reviewStatus = REVIEW_STATUSES[callIndex % REVIEW_STATUSES.length];
        const duration = 25 + Math.floor(Math.random() * 35);
        const daysBack = callIndex * 3 + Math.floor(Math.random() * 3);

        await Call.create({
          mentorId: mentorIds[i],
          menteeId: menteeForCall,
          date: daysAgo(daysBack),
          duration,
          recordingStatus: reviewStatus === 'Draft' ? 'pending' : 'uploaded',
          recordingUrl: reviewStatus !== 'Draft' ? `https://storage.mock/recordings/call-${callIndex + 1}.mp3` : undefined,
          transcript: reviewStatus !== 'Draft' ? `[Mentor]: Hello, how are you doing today?\n[Mentee]: I'm doing okay, I've been working on the revision plan you gave me.\n[Mentor]: That's great! How did it go?\n[Mentee]: I managed to cover most chapters, but algebra is still tricky.\n[Mentor]: Let's focus on that today...` : undefined,
          summary: summaryData.shortSummary,
          keyDiscussionPoints: summaryData.keyDiscussionPoints,
          studentConcerns: summaryData.studentConcerns,
          actionItems: summaryData.actionItems,
          followUpRecommendations: summaryData.followUpRecommendations,
          topicsDiscussed: summaryData.topicsDiscussed,
          mentorNotes: c === 0 ? 'Student was more engaged than last session.' : '',
          aiStatus: reviewStatus === 'Draft' ? 'pending' : 'completed',
          reviewStatus,
        });
      }
    }
    console.log(`[seed] Created 50 demo calls.`);
  }

  console.log('[seed] Demo seeding complete.');
}
