import mongoose, { Schema } from 'mongoose';
import type { CallDocument, CallStatus } from '../types/index.js';

const callSchema = new Schema<CallDocument>(
  {
    mentorId: { type: String, required: true },
    menteeId: { type: String, required: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true, min: 0 },
    recordingUrl: { type: String },
    recordingStatus: {
      type: String,
      enum: ['pending', 'uploaded', 'processing', 'failed'],
      default: 'pending',
    },
    transcript: { type: String },
    summary: { type: String },
    keyDiscussionPoints: [{ type: String, default: [] }],
    studentConcerns: [{ type: String, default: [] }],
    actionItems: [{ type: String, default: [] }],
    followUpRecommendations: [{ type: String, default: [] }],
    topicsDiscussed: [{ type: String, default: [] }],
    mentorNotes: { type: String },
    aiStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    reviewStatus: {
      type: String,
      enum: ['Draft', 'Pending Review', 'Approved', 'Rejected'],
      default: 'Draft',
    },
  },
  { timestamps: true },
);

callSchema.index({ mentorId: 1 });
callSchema.index({ menteeId: 1 });
callSchema.index({ date: 1 });
callSchema.index({ reviewStatus: 1 });
callSchema.index({ mentorId: 1, date: -1 });

export const Call = mongoose.model<CallDocument>('Call', callSchema);

export type CallStatusType = CallStatus;
