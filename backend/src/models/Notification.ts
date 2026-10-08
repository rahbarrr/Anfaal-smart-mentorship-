import mongoose, { Schema } from 'mongoose';
import type { NotificationDocument } from '../types/index.js';

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'MENTEE_DAILY_SUBMITTED',
        'MENTOR_REGISTERED',
        'MENTOR_APPROVAL_REQUIRED',
        'CALL_PROCESSING_COMPLETED',
        'CALL_PROCESSING_FAILED',
        'CALL_SUMMARY_AVAILABLE',
        'MENTOR_ASSIGNED',
        'MENTEE_ASSIGNED',
        'DAILY_REMINDER',
        'SYSTEM_ALERT',
      ],
    },
    category: {
      type: String,
      required: true,
      enum: ['dailyReminders', 'mentorshipActivity', 'callUpdates', 'systemNotifications'],
      default: 'systemNotifications',
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Indexes for fast lookup of user notifications, unread counts, and sorting
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

export const Notification = mongoose.model<NotificationDocument>('Notification', notificationSchema);
