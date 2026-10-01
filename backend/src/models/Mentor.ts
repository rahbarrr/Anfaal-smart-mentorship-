import mongoose, { Schema } from 'mongoose';
import type { MentorDocument } from '../types/index.js';

const mentorSchema = new Schema<MentorDocument>(
  {
    userId: { type: String, required: true, unique: true },
    phone: { type: String },
    bio: { type: String },
    gender: { type: String },
    expertise: { type: String },
    availability: { type: String },
    location: { type: String },
    preferredSubjects: { type: [String], default: [] },
    mentorApprovalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
);

mentorSchema.index({ status: 1 });
mentorSchema.index({ mentorApprovalStatus: 1 });

export const Mentor = mongoose.model<MentorDocument>('Mentor', mentorSchema);
