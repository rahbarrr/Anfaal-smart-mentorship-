import mongoose, { Schema } from 'mongoose';
import type { AttendanceDocument } from '../types/index.js';
import { softDeletePlugin } from './plugins/softDelete.js';

const attendanceSchema = new Schema<AttendanceDocument>(
  {
    menteeId: { type: String, required: true, ref: 'Mentee', index: true },
    date: { type: String, required: true, index: true }, // Format: 'YYYY-MM-DD'
    month: { type: String, required: true, index: true }, // Format: 'YYYY-MM'
    status: { type: String, required: true, enum: ['PRESENT', 'ABSENT'] },
    source: { type: String, required: true, default: 'MANUAL' },
    notes: { type: String, maxlength: 1000 },
    isManual: { type: Boolean, default: false },
    manuallyCorrectedAt: { type: Date },
    manuallyCorrectedBy: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true, collection: 'attendance' },
);

// Compound unique index enforces strictly 1 attendance record per mentee per reporting date
attendanceSchema.index({ menteeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ menteeId: 1, month: 1 });
attendanceSchema.index({ month: 1, status: 1 });
attendanceSchema.plugin(softDeletePlugin);

export const Attendance = mongoose.model<AttendanceDocument>('Attendance', attendanceSchema);

