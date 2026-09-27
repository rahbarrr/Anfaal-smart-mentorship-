import mongoose, { Schema } from 'mongoose';

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
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

callProcessingJobSchema.index({ callId: 1, createdAt: -1 });

export const CallProcessingJob = mongoose.model<CallProcessingJobDocument>('CallProcessingJob', callProcessingJobSchema);
