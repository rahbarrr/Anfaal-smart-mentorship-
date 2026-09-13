import mongoose, { Schema } from 'mongoose';
import type { UserDocument, UserRole } from '../types/index.js';

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'MENTOR'], required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
);

export const User = mongoose.model<UserDocument>('User', userSchema);

export type UserRoleType = UserRole;
