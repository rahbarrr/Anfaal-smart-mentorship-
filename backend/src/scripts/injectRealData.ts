import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';

dotenv.config();

interface VerifiedRecord {
  mentorName: string;
  mentorEmail: string;
  menteeName: string;
  standard: string;
  makId: string;
  status: string;
  notes?: string;
  provisionalEmail?: boolean;
}

const verifiedData: VerifiedRecord[] = [
  {
    mentorName: 'S. Ariza Fatima Imran Ali',
    mentorEmail: 'arizafatima@anfaalfoundation.com',
    menteeName: 'Sayyed Zehra',
    standard: '7th',
    makId: 'MAK7108',
    status: 'Verified',
    provisionalEmail: true,
  },
  {
    mentorName: 'Saudagar Shifa Zehra',
    mentorEmail: 'shifazehra@anfaalfoundation.com',
    menteeName: 'Riza',
    standard: '9th',
    makId: 'MAK7128',
    status: 'Verified',
    provisionalEmail: true,
  },
  {
    mentorName: 'Shaikh Alisha Bano',
    mentorEmail: 'shaikhalishaaa313@gmail.com',
    menteeName: 'Khan Binte Farwa',
    standard: '9th',
    makId: 'MAK7213',
    status: 'Verified',
  },
  {
    mentorName: 'Kaneez Mehdi',
    mentorEmail: 'skanizfatima405@gmail.com',
    menteeName: 'S. Sukaina Fatema Ambar',
    standard: '8th',
    makId: 'MAK8159',
    status: 'Verified',
  },
  {
    mentorName: 'Kaneez Mehdi',
    mentorEmail: 'skanizfatima405@gmail.com',
    menteeName: 'Fizza Fatima',
    standard: '8th',
    makId: 'MAK7155',
    status: 'Verified',
    notes: 'She can do much better',
  },
  {
    mentorName: 'Umme Abiha',
    mentorEmail: 'abiha3291@gmail.com',
    menteeName: 'Batul Zehra Mehdi Abbas S.',
    standard: '9th',
    makId: 'MAK7165',
    status: 'Verified',
  },
  {
    mentorName: 'Umme Abiha',
    mentorEmail: 'abiha3291@gmail.com',
    menteeName: 'Aliza Zehra',
    standard: '9th',
    makId: 'MAK7022',
    status: 'Verified',
  },
  {
    mentorName: 'Bushra Javed Ali Mirza',
    mentorEmail: 'mirzabushra462@gmail.com',
    menteeName: 'Sanober Fatema',
    standard: '10th',
    makId: 'MAK7020',
    status: 'Verified',
  },
  {
    mentorName: 'Bushra Javed Ali Mirza',
    mentorEmail: 'mirzabushra462@gmail.com',
    menteeName: 'Maryam Fatima Sayyed',
    standard: '10th',
    makId: 'MAK7132',
    status: 'Verified',
  },
  {
    mentorName: 'Liza Fatima',
    mentorEmail: 'lizafatima052@gmail.com',
    menteeName: 'Sayed Wahiba Muzammil',
    standard: '9th',
    makId: 'MAK7010',
    status: 'Verified',
  },
  {
    mentorName: 'Kaif Mirza',
    mentorEmail: 'mirzakaif21@gmail.com',
    menteeName: 'Ali Abrar Jafferi',
    standard: '10th',
    makId: 'MAK7141',
    status: 'Verified',
    notes: 'Topper',
  },
  {
    mentorName: 'Kaif Mirza',
    mentorEmail: 'mirzakaif21@gmail.com',
    menteeName: 'Mohammed Rahib Shaikh',
    standard: '10th',
    makId: 'MAK7144',
    status: 'Verified',
  },
  {
    mentorName: 'Sayed Rehbar Raza',
    mentorEmail: 'rahbarraza360@gmail.com',
    menteeName: 'Sayyed Rahil Abbas',
    standard: '9th',
    makId: 'MAK7219',
    status: 'Verified',
  },
  {
    mentorName: 'Sayed Rehbar Raza',
    mentorEmail: 'rahbarraza360@gmail.com',
    menteeName: 'M Mujtaba A Sayyed',
    standard: '10th',
    makId: 'MAK8160',
    status: 'Verified',
  },
  {
    mentorName: 'Sayed Rehbar Raza',
    mentorEmail: 'rahbarraza360@gmail.com',
    menteeName: 'Ayaz Abbas Sayyed',
    standard: '10th',
    makId: 'MAK7136',
    status: 'Verified',
  },
  {
    mentorName: 'S. Mohammed Hussain',
    mentorEmail: 'mhsayed0306@gmail.com',
    menteeName: 'Sayyed Mohammad Kazim',
    standard: '9th',
    makId: 'MAK8280',
    status: 'Verified',
  },
  {
    mentorName: 'S. Mohammed Hussain',
    mentorEmail: 'mhsayed0306@gmail.com',
    menteeName: 'Mohd.Hassan R Mugal',
    standard: '10th',
    makId: 'MAK7162',
    status: 'Verified',
  },
  {
    mentorName: 'S. Mohammed Hussain',
    mentorEmail: 'mhsayed0306@gmail.com',
    menteeName: 'Mohd.Hasnain K Sayyed',
    standard: '10th',
    makId: 'MAK7229',
    status: 'Verified',
  },
];

async function run() {
  const uri = process.env.MONGODB_URI;
  const initialPassword = process.env.INJECT_INITIAL_PASSWORD;
  if (!uri || !initialPassword) {
    throw new Error('MONGODB_URI and INJECT_INITIAL_PASSWORD are required for this data-injection script.');
  }
  console.log('Connecting to configured MongoDB instance.');
  await mongoose.connect(uri);

  const passwordHash = await bcrypt.hash(initialPassword, 12);

  // Group verified entries by mentor
  const mentorsMap = new Map<string, { name: string; email: string; records: VerifiedRecord[] }>();
  for (const item of verifiedData) {
    const key = item.mentorEmail.toLowerCase();
    if (!mentorsMap.has(key)) {
      mentorsMap.set(key, { name: item.mentorName, email: key, records: [] });
    }
    mentorsMap.get(key)!.records.push(item);
  }

  console.log(`\nFound ${mentorsMap.size} unique mentors with ${verifiedData.length} verified mentee records.`);

  for (const [email, { name, records }] of mentorsMap) {
    // 1. Find or create User for Mentor
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        passwordHash,
        role: 'MENTOR',
        status: 'active',
      });
      console.log(`✓ Created Mentor User: ${name} (${email})`);
    } else {
      user.name = name;
      user.role = 'MENTOR';
      user.status = 'active';
      await user.save();
      console.log(`• Updated Mentor User: ${name} (${email})`);
    }

    // 2. Find or create Mentor profile
    let mentorProfile = await Mentor.findOne({ userId: String(user._id) });
    if (!mentorProfile) {
      mentorProfile = await Mentor.create({
        userId: String(user._id),
        status: 'active',
      });
      console.log(`  ✓ Created Mentor Profile for ${name}`);
    }

    // 3. Process each mentee assigned to this mentor
    for (const rec of records) {
      // Find mentee by name or MAK ID in contactInformation
      let mentee = await Mentee.findOne({
        $or: [
          { 'contactInformation.makId': rec.makId },
          { name: new RegExp(`^${rec.menteeName.trim()}$`, 'i') },
        ],
      });

      const contactInfo = {
        makId: rec.makId,
        status: rec.status,
        notes: rec.notes || undefined,
        verified: true,
      };

      if (!mentee) {
        mentee = await Mentee.create({
          name: rec.menteeName.trim(),
          standard: rec.standard.trim(),
          status: 'active',
          contactInformation: contactInfo,
        });
        console.log(`    ✓ Created Mentee: ${rec.menteeName} (${rec.standard}, ${rec.makId})`);
      } else {
        mentee.name = rec.menteeName.trim();
        mentee.standard = rec.standard.trim();
        mentee.status = 'active';
        mentee.contactInformation = {
          ...((mentee.contactInformation as Record<string, unknown>) || {}),
          ...contactInfo,
        };
        await mentee.save();
        console.log(`    • Updated Mentee: ${rec.menteeName} (${rec.makId})`);
      }

      // Also ensure Mentee has a User account so they can log in to Mentee Portal
      const menteeEmail = `${rec.makId.toLowerCase()}@anfaal.org`;
      let menteeUser = await User.findOne({ email: menteeEmail });
      if (!menteeUser) {
        menteeUser = await User.create({
          name: rec.menteeName.trim(),
          email: menteeEmail,
          passwordHash,
          role: 'MENTEE',
          menteeId: String(mentee._id),
          status: 'active',
        });
      } else {
        menteeUser.menteeId = String(mentee._id);
        menteeUser.name = rec.menteeName.trim();
        await menteeUser.save();
      }

      if (!mentee.userId) {
        mentee.userId = String(menteeUser._id);
        await mentee.save();
      }

      // 4. Create or update Mentorship assignment
      let mentorship = await Mentorship.findOne({
        mentorId: String(mentorProfile._id),
        menteeId: String(mentee._id),
      });

      if (!mentorship) {
        mentorship = await Mentorship.create({
          mentorId: String(mentorProfile._id),
          menteeId: String(mentee._id),
          status: 'active',
          assignedAt: new Date(),
        });
        console.log(`      ✓ Assigned ${rec.menteeName} → ${name}`);
      } else {
        mentorship.status = 'active';
        await mentorship.save();
        console.log(`      • Refreshed Assignment ${rec.menteeName} → ${name}`);
      }

      // Special helper for Sayed Rehbar Raza:
      // If the developer account "sayedrahbarraza110@gmail.com" exists, also assign to that mentor profile
      if (email === 'rahbarraza360@gmail.com') {
        const devUser = await User.findOne({ email: 'sayedrahbarraza110@gmail.com' });
        if (devUser) {
          const devMentor = await Mentor.findOne({ userId: String(devUser._id) });
          if (devMentor) {
            const devAssignment = await Mentorship.findOne({
              mentorId: String(devMentor._id),
              menteeId: String(mentee._id),
            });
            if (!devAssignment) {
              await Mentorship.create({
                mentorId: String(devMentor._id),
                menteeId: String(mentee._id),
                status: 'active',
                assignedAt: new Date(),
              });
              console.log(`      ✓ Also linked to dev account ${devUser.email}`);
            }
          }
        }
      }
    }
  }

  // Summary counts
  const totalUsers = await User.countDocuments();
  const totalMentors = await Mentor.countDocuments();
  const totalMentees = await Mentee.countDocuments();
  const totalAssignments = await Mentorship.countDocuments({ status: 'active' });

  console.log(`\n==========================================`);
  console.log(`✅ Data Injection Completed Successfully!`);
  console.log(`Total Users in DB: ${totalUsers}`);
  console.log(`Total Mentors: ${totalMentors}`);
  console.log(`Total Mentees: ${totalMentees}`);
  console.log(`Active Assignments: ${totalAssignments}`);
  console.log(`==========================================\n`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal injection error:', err);
  process.exit(1);
});
