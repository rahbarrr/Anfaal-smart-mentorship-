import mongoose, { Schema } from 'mongoose';

export interface AuditLogDocument {
  _id: string;
  userId: string;
  userName: string;
  userRole: 'ADMIN' | 'MENTOR' | 'MENTEE';
  action:
    | 'UPLOAD_RECORDING'
    | 'PLAY_RECORDING'
    | 'VIEW_TRANSCRIPT'
    | 'EDIT_SUMMARY'
    | 'APPROVE_SUMMARY'
    | 'CHANGE_ASSIGNMENT'
    | 'DELETE_RECORD';
  targetType: 'CALL' | 'MENTORSHIP' | 'MENTEE' | 'MENTOR' | 'DAILY_PERFORMANCE';
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
        'UPLOAD_RECORDING',
        'PLAY_RECORDING',
        'VIEW_TRANSCRIPT',
        'EDIT_SUMMARY',
        'APPROVE_SUMMARY',
        'CHANGE_ASSIGNMENT',
        'DELETE_RECORD',
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: ['CALL', 'MENTORSHIP', 'MENTEE', 'MENTOR', 'DAILY_PERFORMANCE'],
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
