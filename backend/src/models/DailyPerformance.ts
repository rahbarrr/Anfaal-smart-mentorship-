import mongoose, { Schema } from 'mongoose';
import type { DailyPerformanceDocument } from '../types/index.js';

const dailyPerformanceSchema = new Schema<DailyPerformanceDocument>(
  {
    menteeId: { type: String, required: true, ref: 'Mentee' },
    date: { type: String, required: true }, // Format: 'YYYY-MM-DD'
    studyMinutes: { type: Number, required: true, min: 0 },
    quran: {
      ruku: { type: Number, default: 0, min: 0 },
      ayat: { type: Number, default: 0, min: 0 },
      pages: { type: Number, default: 0, min: 0 },
    },
    readingMinutes: { type: Number, required: true, min: 0 },
    dayRating: { type: Number, required: true, min: 1, max: 5 },
    dailyReflection: { type: String, maxlength: 1000 },
    facedDifficulty: { type: Boolean, default: false },
    difficultyNote: { type: String, maxlength: 1000 },
    needsMentorHelp: { type: Boolean, default: false },
    mentorHelpNote: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);

// Compound unique index prevents multiple daily submissions for the same mentee/date
dailyPerformanceSchema.index({ menteeId: 1, date: 1 }, { unique: true });
dailyPerformanceSchema.index({ menteeId: 1, createdAt: -1 });
dailyPerformanceSchema.index({ date: 1 });

export const DailyPerformance = mongoose.model<DailyPerformanceDocument>('DailyPerformance', dailyPerformanceSchema);
