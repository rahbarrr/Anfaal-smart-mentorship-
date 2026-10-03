import mongoose, { Schema } from 'mongoose';

export interface AuditLogDocument {
  _id: string;
  userId: string;
  userName: string;
  userRole: 'ADMIN' | 'MENTOR' | 'MENTEE';
  action:
    | 'CALL_CREATED'
    | 'RECORDING_UPLOADED'
    | 'UPLOAD_RECORDING'
    | 'PLAY_RECORDING'
    | 'VIEW_TRANSCRIPT'
    | 'SUMMARY_EDITED'
    | 'EDIT_SUMMARY'
    | 'SUMMARY_APPROVED'
    | 'APPROVE_SUMMARY'
    | 'PROCESSING_FAILED'
    | 'PROCESSING_RETRIED'
    | 'CALL_DELETED'
    | 'DELETE_RECORD'
    | 'ASSIGNMENT_CHANGED'
    | 'CHANGE_ASSIGNMENT'
    | 'PASSWORD_RESET';
  targetType: 'CALL' | 'MENTORSHIP' | 'MENTEE' | 'MENTOR' | 'DAILY_PERFORMANCE' | 'USER';
  targetId: string;
  menteeName?: string;
  mentorName?: string;
  details: string;
  ipAddress?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, enum: ['ADMIN', 'MENTOR', 'MENTEE'], required: true },
    action: {
      type: String,
      enum: [
        'CALL_CREATED',
        'RECORDING_UPLOADED',
        'UPLOAD_RECORDING',
        'PLAY_RECORDING',
        'VIEW_TRANSCRIPT',
        'SUMMARY_EDITED',
        'EDIT_SUMMARY',
        'SUMMARY_APPROVED',
        'APPROVE_SUMMARY',
        'PROCESSING_FAILED',
        'PROCESSING_RETRIED',
        'CALL_DELETED',
        'DELETE_RECORD',
        'ASSIGNMENT_CHANGED',
        'CHANGE_ASSIGNMENT',
        'PASSWORD_RESET',
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: ['CALL', 'MENTORSHIP', 'MENTEE', 'MENTOR', 'DAILY_PERFORMANCE', 'USER'],
      required: true,
    },
    targetId: { type: String, required: true },
    menteeName: { type: String },
    mentorName: { type: String },
    details: { type: String, required: true },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ targetId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<AuditLogDocument>('AuditLog', auditLogSchema);
