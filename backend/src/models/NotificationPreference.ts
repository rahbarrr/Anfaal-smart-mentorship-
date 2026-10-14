import mongoose, { Schema } from 'mongoose';
import type { NotificationPreferenceDocument } from '../types/index.js';

const notificationPreferenceSchema = new Schema<NotificationPreferenceDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    pushEnabled: { type: Boolean, default: true },
    dailyReminders: { type: Boolean, default: true },
    mentorshipActivity: { type: Boolean, default: true },
    callUpdates: { type: Boolean, default: true },
    systemNotifications: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const NotificationPreference = mongoose.model<NotificationPreferenceDocument>(
  'NotificationPreference',
  notificationPreferenceSchema,
);
