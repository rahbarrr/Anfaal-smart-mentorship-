import mongoose, { Schema } from 'mongoose';

export type ProfileSuggestionCategory = 'basic' | 'academic' | 'goals' | 'routine' | 'career' | 'challenges';
export type ProfileSuggestionStatus = 'pending' | 'approved' | 'rejected' | 'modified';
export type ProfileSuggestionSourceType = 'transcript' | 'summary';

export interface ProfileSuggestionDocument {
  _id: string;
  menteeId: string;
  sourceCallId: string;
  callDate?: Date;
  fieldKey: string;
  category: ProfileSuggestionCategory;
  label: string;
  currentValue?: any;
  extractedValue: any;
  evidence: string;
  sourceType: ProfileSuggestionSourceType;
  confidence: number;
  status: ProfileSuggestionStatus;
  conflictFlag: boolean;
  conflictDetails?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const profileSuggestionSchema = new Schema<ProfileSuggestionDocument>(
  {
    menteeId: { type: String, required: true, ref: 'Mentee', index: true },
    sourceCallId: { type: String, required: true, ref: 'Call', index: true },
    callDate: { type: Date },
    fieldKey: { type: String, required: true },
    category: {
      type: String,
      enum: ['basic', 'academic', 'goals', 'routine', 'career', 'challenges'],
      required: true,
    },
    label: { type: String, required: true },
    currentValue: { type: Schema.Types.Mixed },
    extractedValue: { type: Schema.Types.Mixed, required: true },
    evidence: { type: String, default: '', trim: true },
    sourceType: { type: String, enum: ['transcript', 'summary'], default: 'transcript' },
    confidence: { type: Number, default: 0.85, min: 0, max: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'modified'],
      default: 'pending',
      index: true,
    },
    conflictFlag: { type: Boolean, default: false },
    conflictDetails: { type: String },
    reviewedBy: { type: String },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

// Fast lookups by mentee + status, and call + field idempotency
profileSuggestionSchema.index({ menteeId: 1, status: 1 });
profileSuggestionSchema.index({ sourceCallId: 1, fieldKey: 1 });
profileSuggestionSchema.index({ menteeId: 1, fieldKey: 1 });
profileSuggestionSchema.index({ createdAt: -1 });

export const ProfileSuggestion = mongoose.model<ProfileSuggestionDocument>(
  'ProfileSuggestion',
  profileSuggestionSchema,
);
