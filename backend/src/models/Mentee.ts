import mongoose, { Schema } from 'mongoose';
import type { MenteeDocument } from '../types/index.js';

const menteeSchema = new Schema<MenteeDocument>(
  {
    name: { type: String, required: true, trim: true },
    standard: { type: String, required: true },
    makid: { type: String, trim: true, uppercase: true },
    contactInformation: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    userId: { type: String },
    location: { type: String, trim: true, default: '' },
    academic: { type: Schema.Types.Mixed },
    goals: { type: Schema.Types.Mixed },
    routine: { type: Schema.Types.Mixed },
    careerInterests: { type: Schema.Types.Mixed },
    challenges: [{ type: Schema.Types.Mixed }],
    notes: [{ type: Schema.Types.Mixed }],
  },
  { timestamps: true },
);

menteeSchema.index({ status: 1 });
menteeSchema.index({ standard: 1 });
menteeSchema.index({ userId: 1 });
menteeSchema.index({ makid: 1 });

export const Mentee = mongoose.model<MenteeDocument>('Mentee', menteeSchema);
