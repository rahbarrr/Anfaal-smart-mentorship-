import mongoose, { Schema, Document } from 'mongoose';

export interface LeaderboardSnapshotEntry {
  menteeId: string;
  name: string;
  rank: number;
  points: number; // weekly points or monthly points
  checkInDays: number;
  streak: number;
  totalXp: number;
  isTopThree: boolean;
  isAnonymous: boolean;
}

export interface LeaderboardSnapshotDocument extends Document {
  periodType: 'weekly' | 'monthly';
  periodKey: string; // e.g. "2026-10-19_2026-10-25" or "2026-09"
  label: string; // e.g. "October 19–25, 2026" or "September 2026"
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  totalEligibleMentees: number;
  totalSubmissions: number;
  entries: LeaderboardSnapshotEntry[];
  finalizedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const leaderboardSnapshotSchema = new Schema<LeaderboardSnapshotDocument>(
  {
    periodType: { type: String, required: true, enum: ['weekly', 'monthly'] },
    periodKey: { type: String, required: true },
    label: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    totalEligibleMentees: { type: Number, required: true, default: 0 },
    totalSubmissions: { type: Number, required: true, default: 0 },
    entries: [
      {
        menteeId: { type: String, required: true },
        name: { type: String, required: true },
        rank: { type: Number, required: true },
        points: { type: Number, required: true, default: 0 },
        checkInDays: { type: Number, required: true, default: 0 },
        streak: { type: Number, required: true, default: 0 },
        totalXp: { type: Number, required: true, default: 0 },
        isTopThree: { type: Boolean, default: false },
        isAnonymous: { type: Boolean, default: false },
      },
    ],
    finalizedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

leaderboardSnapshotSchema.index({ periodType: 1, periodKey: 1 }, { unique: true });
leaderboardSnapshotSchema.index({ periodType: 1, startDate: -1 });

export const LeaderboardSnapshot = mongoose.model<LeaderboardSnapshotDocument>(
  'LeaderboardSnapshot',
  leaderboardSnapshotSchema,
);
