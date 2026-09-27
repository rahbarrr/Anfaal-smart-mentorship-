import mongoose, { Schema, Document } from 'mongoose';

export type ImportType = 'MENTORS' | 'MENTEES' | 'ASSIGNMENTS';
export type ImportStatus = 'UPLOADED' | 'VALIDATING' | 'READY' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type DuplicateStrategy = 'skip' | 'update' | 'ask';

export interface ImportErrorItem {
  row: number;
  name?: string;
  email?: string;
  error: string;
  warning?: boolean;
}

export interface ParsedRowItem {
  row: number;
  status: 'valid' | 'warning' | 'error';
  data: Record<string, any>;
  message?: string;
  isExisting?: boolean;
}

export interface ImportJobDocument {
  _id: string;
  type: ImportType;
  fileName: string;
  fileSize: number;
  uploadedBy: string; // admin user id / email
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  duplicateAction: DuplicateStrategy;
  parsedRows: ParsedRowItem[];
  errors: ImportErrorItem[];
  rawCsvContent?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const importJobSchema = new Schema<ImportJobDocument>(
  {
    type: { type: String, enum: ['MENTORS', 'MENTEES', 'ASSIGNMENTS'], required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    uploadedBy: { type: String, required: true },
    status: {
      type: String,
      enum: ['UPLOADED', 'VALIDATING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'UPLOADED',
    },
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    invalidRows: { type: Number, default: 0 },
    warningRows: { type: Number, default: 0 },
    createdCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    duplicateAction: { type: String, enum: ['skip', 'update', 'ask'], default: 'skip' },
    parsedRows: { type: Schema.Types.Mixed, default: [] },
    errors: { type: Schema.Types.Mixed, default: [] },
    rawCsvContent: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

importJobSchema.index({ type: 1, createdAt: -1 });
importJobSchema.index({ status: 1 });
importJobSchema.index({ uploadedBy: 1 });

export const ImportJob = mongoose.model<ImportJobDocument>('ImportJob', importJobSchema);
