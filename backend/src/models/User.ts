import mongoose, { Schema } from 'mongoose';
import type { UserDocument, UserRole } from '../types/index.js';

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    makid: { type: String, trim: true, uppercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'MENTOR', 'MENTEE'], required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    menteeId: { type: String },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 });
userSchema.index({ menteeId: 1 });
userSchema.index({ makid: 1 }, { sparse: true });

export const User = mongoose.model<UserDocument>('User', userSchema);

export type UserRoleType = UserRole;
