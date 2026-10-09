import mongoose, { Schema } from 'mongoose';
import type { DailyReminderSettingDocument } from '../types/index.js';

const reminderSlotSchema = new Schema(
  {
    slotIndex: { type: Number, required: true, min: 1, max: 3 },
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const dailyReminderSettingSchema = new Schema<DailyReminderSettingDocument>(
  {
    mentorId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true },
    slots: {
      type: [reminderSlotSchema],
      default: [
        { slotIndex: 1, time: '17:00', enabled: true },
        { slotIndex: 2, time: '19:00', enabled: true },
        { slotIndex: 3, time: '21:00', enabled: true },
      ],
    },
  },
  { timestamps: true },
);

export const DailyReminderSetting = mongoose.model<DailyReminderSettingDocument>(
  'DailyReminderSetting',
  dailyReminderSettingSchema,
);
