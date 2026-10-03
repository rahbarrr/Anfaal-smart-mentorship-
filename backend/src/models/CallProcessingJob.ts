import mongoose, { Schema } from 'mongoose';
import type { ProcessingErrorCode } from '../services/processingErrorService.js';

export type JobStage = 'UPLOAD' | 'TRANSCRIPTION' | 'SUMMARY' | 'COMPLETE';
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CallProcessingJobDocument {
  _id: string;
  callId: string;
  stage: JobStage;
  status: JobStatus;
  progress: number;
  stageStatus: {
    upload: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    audioProcessing: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    transcription: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    summary: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    mentorReview: 'PENDING' | 'READY' | 'APPROVED';
  };
  error?: string;
  errorCode?: ProcessingErrorCode;
  heartbeatAt?: Date;
  chunkProgress?: {
    total: number;
    completed: number;
    failed: number;
    lastChunkAt?: Date;
  };
  timings?: {
    audioLoadMs?: number;
    audioPreparationMs?: number;
    audioDurationSeconds?: number;
    chunkCount?: number;
    chunkSeconds?: number;
    transcriptionConcurrency?: number;
    queueWaitMs?: number;
    transcriptionMs?: number;
    summaryMs?: number;
    totalMs?: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const callProcessingJobSchema = new Schema<CallProcessingJobDocument>(
  {
    callId: { type: String, required: true, ref: 'Call', index: true },
    stage: {
      type: String,
      enum: ['UPLOAD', 'TRANSCRIPTION', 'SUMMARY', 'COMPLETE'],
      default: 'UPLOAD',
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    stageStatus: {
      upload: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'COMPLETED' },
      audioProcessing: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
      transcription: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
      summary: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
      mentorReview: { type: String, enum: ['PENDING', 'READY', 'APPROVED'], default: 'PENDING' },
    },
    error: { type: String },
    errorCode: {
      type: String,
      enum: ['INVALID_INPUT', 'STORAGE_FAILED', 'TRANSCRIPTION_FAILED', 'SUMMARY_FAILED', 'QUEUE_FAILED', 'UNKNOWN'],
    },
    heartbeatAt: { type: Date },
    chunkProgress: {
      total: { type: Number, min: 0 },
      completed: { type: Number, min: 0 },
      failed: { type: Number, min: 0 },
      lastChunkAt: { type: Date },
    },
    timings: {
      audioLoadMs: { type: Number, min: 0 },
      audioPreparationMs: { type: Number, min: 0 },
      audioDurationSeconds: { type: Number, min: 0 },
      chunkCount: { type: Number, min: 0 },
      chunkSeconds: { type: Number, min: 0 },
      transcriptionConcurrency: { type: Number, min: 1 },
      queueWaitMs: { type: Number, min: 0 },
      transcriptionMs: { type: Number, min: 0 },
      summaryMs: { type: Number, min: 0 },
      totalMs: { type: Number, min: 0 },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

callProcessingJobSchema.index({ callId: 1, createdAt: -1 });

export const CallProcessingJob = mongoose.model<CallProcessingJobDocument>('CallProcessingJob', callProcessingJobSchema);
