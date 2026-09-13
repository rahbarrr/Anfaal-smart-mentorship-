import mongoose, { Schema } from 'mongoose';
import type { MentorshipDocument } from '../types/index.js';

const mentorshipSchema = new Schema<MentorshipDocument>(
  {
    mentorId: { type: String, required: true },
    menteeId: { type: String, required: true },
    assignedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

mentorshipSchema.index({ mentorId: 1, menteeId: 1 });
mentorshipSchema.index({ assignedAt: 1 });

export const Mentorship = mongoose.model<MentorshipDocument>('Mentorship', mentorshipSchema);
