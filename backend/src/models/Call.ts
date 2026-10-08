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
    uploadedAt: { type: Date },
    processingStatus: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    recording: {
      storageKey: { type: String },
      fileName: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String },
      url: { type: String },
    },
    transcript: { type: String },
    transcription: {
      status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
      text: { type: String, default: '' },
      language: { type: String },
      duration: { type: Number },
      segments: [
        {
          start: { type: Number, required: true },
          end: { type: Number, required: true },
          text: { type: String, required: true },
          speaker: { type: String },
        },
      ],
      provider: { type: String },
      createdAt: { type: Date },
    },
    summary: { type: String },
    aiSummary: {
      status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
      shortSummary: { type: String, default: '' },
      keyDiscussionPoints: [{ type: String, default: [] }],
      academicProgress: { type: String },
      personalDevelopment: { type: String },
      challenges: [{ type: String, default: [] }],
      achievements: [{ type: String, default: [] }],
      actionItems: [{ type: String, default: [] }],
      mentorCommitments: [{ type: String, default: [] }],
      menteeCommitments: [{ type: String, default: [] }],
      followUpTopics: [{ type: String, default: [] }],
      topicsDiscussed: [{ type: String, default: [] }],
      generatedAt: { type: Date },
    },
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
    mentorReview: {
      status: { type: String, enum: ['Draft', 'Pending Review', 'Approved', 'Rejected'], default: 'Draft' },
      reviewedAt: { type: Date },
      reviewedBy: { type: String },
    },
    summaryVersions: [
      {
        version: { type: Number, required: true },
        type: { type: String, enum: ['AI', 'MENTOR_EDIT', 'APPROVED'], required: true },
        content: { type: Schema.Types.Mixed, required: true },
        timestamp: { type: Date, default: Date.now },
        author: { type: String },
      },
    ],
  },
  { timestamps: true },
);

callSchema.index({ mentorId: 1 });
callSchema.index({ menteeId: 1 });
callSchema.index({ date: 1 });
callSchema.index({ reviewStatus: 1 });
callSchema.index({ recordingStatus: 1 });
callSchema.index({ aiStatus: 1 });
callSchema.index({ 'recording.storageKey': 1 });
callSchema.index({ mentorId: 1, date: -1 });
callSchema.index({ menteeId: 1, date: -1 });
callSchema.index({ date: -1, _id: -1 });
callSchema.index({ createdAt: -1 });
// Full-text search index across transcripts and summaries
callSchema.index({
  transcript: 'text',
  summary: 'text',
  'aiSummary.shortSummary': 'text',
  'aiSummary.academicProgress': 'text',
  'aiSummary.personalDevelopment': 'text',
  'aiSummary.keyDiscussionPoints': 'text',
  'aiSummary.topicsDiscussed': 'text',
});

export const Call = mongoose.model<CallDocument>('Call', callSchema);

export type CallStatusType = CallStatus;
