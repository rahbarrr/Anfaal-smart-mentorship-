import mongoose, { Schema } from 'mongoose';
import type { MentorDocument } from '../types/index.js';

const mentorSchema = new Schema<MentorDocument>(
  {
    userId: { type: String, required: true, unique: true },
    phone: { type: String },
    bio: { type: String },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
);

export const Mentor = mongoose.model<MentorDocument>('Mentor', mentorSchema);
