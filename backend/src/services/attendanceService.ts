import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';
import { Mentee } from '../models/Mentee.js';
import type { AttendanceDocument, AttendanceStatus } from '../types/index.js';

export interface RecordAutomaticAttendanceResult {
  record: AttendanceDocument | null;
  created: boolean;
  updated: boolean;
  preservedManual: boolean;
  preservedPresent: boolean;
}

/**
 * Automatically marks a mentee as PRESENT in the Attendance module upon successful Daily Progress submission.
 *
 * Rules:
 * 1. Checks that the mentee exists (never creates attendance for admins or mentors).
 * 2. Idempotent: strictly 1 attendance record per mentee per reporting date (enforced by DB unique index).
 * 3. If an existing record was manually entered/corrected by a mentor or admin (isManual: true), it is PRESERVED.
 * 4. If an existing record is already PRESENT, it is PRESERVED.
 * 5. Handles concurrent submissions safely without throwing duplicate key errors.
 */
export async function recordAutomaticDailyAttendance(
  menteeId: string,
  date: string,
  createdByUserId?: string,
): Promise<RecordAutomaticAttendanceResult> {
  if (!menteeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      record: null,
      created: false,
      updated: false,
      preservedManual: false,
      preservedPresent: false,
    };
  }

  // 1. Verify that menteeId corresponds to a real mentee record (never create attendance for mentors/admins)
  const mentee = await Mentee.findById(menteeId).select('_id').lean();
  if (!mentee) {
    console.warn(`[AttendanceService] Skipped automatic attendance: ${menteeId} is not a valid mentee.`);
    return {
      record: null,
      created: false,
      updated: false,
      preservedManual: false,
      preservedPresent: false,
    };
  }

  const month = date.slice(0, 7);

  // 2. Check for existing record for this mentee on this date
  const existing = await Attendance.findOne({ menteeId, date });

  if (existing) {
    // Rule 5: Manual mentor/admin corrections must not be overwritten automatically
    if (existing.isManual) {
      console.info(
        `[AttendanceService] Preserving manual attendance correction for mentee ${menteeId} on ${date} (Status: ${existing.status}, Source: ${existing.source})`,
      );
      return {
        record: existing.toObject ? existing.toObject() : existing,
        created: false,
        updated: false,
        preservedManual: true,
        preservedPresent: existing.status === 'PRESENT',
      };
    }

    // Rule 4: If already marked Present, preserve it
    if (existing.status === 'PRESENT') {
      return {
        record: existing.toObject ? existing.toObject() : existing,
        created: false,
        updated: false,
        preservedManual: false,
        preservedPresent: true,
      };
    }

    // If existing record was non-manual ABSENT, update to PRESENT from Daily Progress
    existing.status = 'PRESENT';
    existing.source = 'Daily Progress';
    existing.updatedBy = createdByUserId || menteeId;
    existing.updatedAt = new Date();
    await existing.save();

    console.info(`[AttendanceService] Updated attendance to PRESENT for mentee ${menteeId} on ${date} via Daily Progress.`);
    return {
      record: existing.toObject ? existing.toObject() : existing,
      created: false,
      updated: true,
      preservedManual: false,
      preservedPresent: false,
    };
  }

  // 3. Create fresh attendance record for Daily Progress
  try {
    const created = await Attendance.create({
      menteeId,
      date,
      month,
      status: 'PRESENT',
      source: 'Daily Progress',
      isManual: false,
      createdBy: createdByUserId || menteeId,
      updatedBy: createdByUserId || menteeId,
    });

    console.info(`[AttendanceService] Automatically recorded attendance (PRESENT) for mentee ${menteeId} on ${date}.`);
    return {
      record: created.toObject ? created.toObject() : created,
      created: true,
      updated: false,
      preservedManual: false,
      preservedPresent: false,
    };
  } catch (err: any) {
    // Handle concurrent submission race condition safely
    if (err?.code === 11000) {
      console.info(`[AttendanceService] Concurrent attendance insert handled for mentee ${menteeId} on ${date}.`);
      const existingAfterRace = await Attendance.findOne({ menteeId, date });
      return {
        record: existingAfterRace ? (existingAfterRace.toObject ? existingAfterRace.toObject() : existingAfterRace) : null,
        created: false,
        updated: false,
        preservedManual: Boolean(existingAfterRace?.isManual),
        preservedPresent: existingAfterRace?.status === 'PRESENT',
      };
    }
    throw err;
  }
}

/**
 * Records or manually corrects an attendance entry for a mentee.
 * Marks isManual: true so automatic progress submissions will not overwrite it.
 */
export async function recordManualAttendance(params: {
  menteeId: string;
  date: string;
  status: AttendanceStatus;
  source?: string;
  notes?: string;
  userId: string;
}): Promise<AttendanceDocument> {
  const { menteeId, date, status, notes, userId } = params;
  const month = date.slice(0, 7);

  const existing = await Attendance.findOne({ menteeId, date });
  const isCorrection = Boolean(existing);
  const source = params.source || (isCorrection ? 'MANUAL_CORRECTION' : 'MANUAL');

  const recordData = {
    menteeId,
    date,
    month,
    status,
    source,
    notes: typeof notes === 'string' ? notes.trim() : '',
    isManual: true,
    manuallyCorrectedAt: new Date(),
    manuallyCorrectedBy: userId,
    updatedBy: userId,
    updatedAt: new Date(),
    ...(existing ? {} : { createdBy: userId, createdAt: new Date() }),
  };

  const result = await Attendance.findOneAndUpdate(
    { menteeId, date },
    { $set: recordData },
    { upsert: true, returnDocument: 'after', new: true },
  );

  return result.toObject ? result.toObject() : (result as unknown as AttendanceDocument);
}

/**
 * Calculates attendance summary statistics from a list of records.
 */
export function calculateAttendanceStats(records: Array<{ status: AttendanceStatus }>) {
  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const total = present + absent;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  return {
    present,
    absent,
    total,
    percentage,
  };
}

