import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';

type InputRow = {
  mentorName: string;
  menteeName: string;
  contact: string;
  standard: string;
  makid: string;
};

const csvPath = process.argv[2] || path.resolve(process.cwd(), 'data/mentees-2026-10-03.csv');

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(text: string): InputRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift()?.split(',');
  if (headers?.join(',') !== 'mentorName,menteeName,contact,standard,makid') {
    throw new Error('CSV headers must be mentorName,menteeName,contact,standard,makid');
  }
  return lines.map((line, index) => {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length !== 5 || fields.some((field) => !field)) {
      throw new Error(`Invalid CSV row ${index + 2}`);
    }
    const [mentorName, menteeName, contact, standard, makid] = fields;
    return { mentorName, menteeName, contact, standard, makid: makid.toUpperCase() };
  });
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const makids = new Set(rows.map((row) => row.makid));
  if (rows.length !== 22) throw new Error(`Expected 22 mentees, found ${rows.length}.`);
  if (makids.size !== rows.length) throw new Error('Duplicate MAKID found in input CSV.');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const mentorUsers = await User.find({ role: 'MENTOR' }).lean();
  const mentorUserByName = new Map(mentorUsers.map((user) => [normalize(user.name), user]));
  const mentorProfiles = await Mentor.find({}).lean();
  const mentorByName = new Map<string, (typeof mentorProfiles)[number]>();
  for (const mentor of mentorProfiles) {
    const mentorUser = mentorUserByName.get(normalize(mentorUsers.find((user) => String(user._id) === mentor.userId)?.name || ''));
    if (mentorUser) mentorByName.set(normalize(mentorUser.name), mentor);
  }

  const missingMentors = [...new Set(rows.map((row) => row.mentorName).filter((name) => !mentorByName.has(normalize(name))))];
  const passwordHashes = new Map(rows.map((row) => [row.makid, bcrypt.hash(row.makid, 12)]));
  let created = 0;
  let updated = 0;
  let assigned = 0;
  let unassigned = 0;

  for (const row of rows) {
    const makid = row.makid;
    let mentee = await Mentee.findOne({
      $or: [{ makid }, { 'contactInformation.makId': makid }, { name: new RegExp(`^${row.menteeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }],
    });
    if (!mentee) {
      mentee = await Mentee.create({ name: row.menteeName, standard: row.standard, makid, status: 'active', contactInformation: { phone: row.contact, makId: makid } });
      created += 1;
    } else {
      mentee.name = row.menteeName;
      mentee.standard = row.standard;
      mentee.makid = makid;
      mentee.status = 'active';
      mentee.contactInformation = { ...((mentee.contactInformation as Record<string, unknown>) || {}), phone: row.contact, makId: makid };
      await mentee.save();
      updated += 1;
    }

    const email = `${makid.toLowerCase()}@anfaal.org`;
    let user = mentee.userId ? await User.findById(mentee.userId) : null;
    if (!user) user = await User.findOne({ $or: [{ makid }, { email }], role: 'MENTEE' });
    if (!user) user = await User.create({ name: row.menteeName, email, makid, passwordHash: await passwordHashes.get(makid)!, role: 'MENTEE', menteeId: String(mentee._id), status: 'active' });
    else {
      user.name = row.menteeName;
      user.makid = makid;
      user.passwordHash = await passwordHashes.get(makid)!;
      user.role = 'MENTEE';
      user.menteeId = String(mentee._id);
      user.status = 'active';
      await user.save();
    }
    mentee.userId = String(user._id);
    await mentee.save();

    const mentor = mentorByName.get(normalize(row.mentorName));
    if (!mentor) { unassigned += 1; continue; }
    await Mentorship.updateMany({ menteeId: String(mentee._id), status: 'active', mentorId: { $ne: String(mentor._id) } }, { $set: { status: 'archived' } });
    await Mentorship.updateOne({ mentorId: String(mentor._id), menteeId: String(mentee._id) }, { $set: { status: 'active' }, $setOnInsert: { assignedAt: new Date() } }, { upsert: true });
    assigned += 1;
  }

  const summary = { inputMentees: rows.length, created, updated, assigned, unassigned, missingMentors, finalMentees: await Mentee.countDocuments(), finalActiveMentees: await Mentee.countDocuments({ status: 'active' }), finalActiveAssignments: await Mentorship.countDocuments({ status: 'active' }) };
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => { console.error(error); await mongoose.disconnect().catch(() => undefined); process.exitCode = 1; });
