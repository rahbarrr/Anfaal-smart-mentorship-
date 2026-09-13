import mongoose, { Schema } from 'mongoose';
import type { MenteeDocument } from '../types/index.js';

const menteeSchema = new Schema<MenteeDocument>(
  {
    name: { type: String, required: true, trim: true },
    standard: { type: String, required: true },
    contactInformation: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true },
);

menteeSchema.index({ status: 1 });
menteeSchema.index({ standard: 1 });

export const Mentee = mongoose.model<MenteeDocument>('Mentee', menteeSchema);
