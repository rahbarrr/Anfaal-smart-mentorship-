import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export interface LoginPayload {
  email: string;
  password: string;
}

export async function loginUser({ email, password }: LoginPayload) {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new Error('Invalid email or password');
  }

  let menteeId = user.menteeId;
  if (user.role === 'MENTEE' && !menteeId) {
    const { Mentee } = await import('../models/Mentee.js');
    const menteeDoc = await Mentee.findOne({ userId: String(user._id) });
    if (menteeDoc) {
      menteeId = String(menteeDoc._id);
    }
  }

  const token = jwt.sign(
    {
      id: String(user._id),
      email: user.email,
      role: user.role,
      menteeId,
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
    },
  };
}
