import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export interface LoginPayload {
  email: string;
  password: string;
}

export async function loginUser({ email, password }: LoginPayload) {
  const input = (email || '').trim();
  let user = null;

  if (input.includes('@')) {
    user = await User.findOne({ email: input.toLowerCase() });
  } else {
    const rawUpper = input.toUpperCase();
    const rawDigits = input.replace(/\D/g, '');
    const last10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

    // 1. Try finding User or Mentee by MACID
    user = await User.findOne({ macid: rawUpper });

    if (!user) {
      const { Mentee } = await import('../models/Mentee.js');
      const mentee = await Mentee.findOne({ macid: rawUpper });
      if (mentee && mentee.userId) {
        user = await User.findById(mentee.userId);
      }
    }

    // 2. Try finding Mentor by phone
    if (!user) {
      const { Mentor } = await import('../models/Mentor.js');
      const mentor = await Mentor.findOne({
        $or: [
          { phone: input },
          { phone: rawDigits },
          { phone: `+91${last10}` },
          { phone: last10 },
          { phone: { $regex: last10, $options: 'i' } },
        ],
      });

      if (mentor) {
        user = await User.findById(mentor.userId);
      }
    }

    // 3. Try finding Mentee by phone
    if (!user) {
      const { Mentee } = await import('../models/Mentee.js');
      const mentee = await Mentee.findOne({
        $or: [
          { phone: input },
          { phone: rawDigits },
          { phone: `+91${last10}` },
          { phone: last10 },
          { phone: { $regex: last10, $options: 'i' } },
        ],
      });
      if (mentee && mentee.userId) {
        user = await User.findById(mentee.userId);
      }
    }
  }

  if (!user) {
    throw new Error('Invalid MACID, email, phone number, or password');
  }

  let passwordMatches = await bcrypt.compare(password, user.passwordHash);

  // If password comparison failed and user is a mentee, check if password is MACID, phone, or Mentee@123
  if (!passwordMatches && user.role === 'MENTEE') {
    if (user.macid && password.toUpperCase() === user.macid) {
      passwordMatches = true;
    } else if (password === 'Mentee@123') {
      passwordMatches = true;
    }
  }

  // If password comparison failed and password looks like phone number, try alternate phone representations
  if (!passwordMatches && /\d{8,}/.test(password)) {
    const passDigits = password.replace(/\D/g, '');
    const passLast10 = passDigits.slice(-10);
    if (await bcrypt.compare(passLast10, user.passwordHash)) {
      passwordMatches = true;
    } else if (await bcrypt.compare(`+91${passLast10}`, user.passwordHash)) {
      passwordMatches = true;
    }
  }

  if (!passwordMatches) {
    throw new Error('Invalid MACID, email, phone number, or password');
  }

  let menteeId = user.menteeId;
  if (user.role === 'MENTEE' && !menteeId) {
    const { Mentee } = await import('../models/Mentee.js');
    const menteeDoc = await Mentee.findOne({ userId: String(user._id) });
    if (menteeDoc) {
      menteeId = String(menteeDoc._id);
    }
  }

  let mentorApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | undefined;
  if (user.role === 'MENTOR') {
    const { Mentor } = await import('../models/Mentor.js');
    const mentorDoc = await Mentor.findOne({ userId: String(user._id) }).lean();
    mentorApprovalStatus = mentorDoc?.mentorApprovalStatus ?? 'APPROVED';
  }

  const token = jwt.sign(
    {
      id: String(user._id),
      email: user.email,
      role: user.role,
      menteeId,
      mentorApprovalStatus,
    },
    process.env.JWT_SECRET ?? 'development-secret',
    { expiresIn: '7d' },
  );

  return {
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      menteeId,
      mentorApprovalStatus,
    },
  };
}
