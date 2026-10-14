import mongoose from 'mongoose';
import { Mentorship } from '../models/Mentorship.js';
import { Mentee } from '../models/Mentee.js';
import { User } from '../models/User.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { DailyReminderSetting } from '../models/DailyReminderSetting.js';
import { createNotification } from './notificationService.js';
import type { ReminderSlot, DailyReminderSettingDocument } from '../types/index.js';

export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Kolkata';

export const DEFAULT_REMINDER_SLOTS: ReminderSlot[] = [
  { slotIndex: 1, time: '17:00', enabled: true },
  { slotIndex: 2, time: '19:00', enabled: true },
  { slotIndex: 3, time: '21:00', enabled: true },
];

/**
 * Validates timezone string using Intl.DateTimeFormat.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a 24h 'HH:mm' string to total minutes from midnight (0..1439).
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map((s) => parseInt(s, 10));
  return hours * 60 + minutes;
}

/**
 * Validates mentor reminder schedule settings.
 * Ensures:
 * - 1 to 3 reminder slots
 * - valid HH:mm format
 * - chronological ordering for enabled slots
 * - no duplicate times among enabled slots
 * - valid IANA timezone
 */
export function validateReminderSettings(input: {
  enabled?: boolean;
  timezone?: string;
  slots?: Array<{ slotIndex: number; time: string; enabled: boolean }>;
}): { valid: boolean; error?: string; normalized?: { enabled: boolean; timezone: string; slots: ReminderSlot[] } } {
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;
  const timezone = input.timezone ? input.timezone.trim() : DEFAULT_REMINDER_TIMEZONE;

  if (!isValidTimezone(timezone)) {
    return { valid: false, error: `Invalid timezone identifier: '${timezone}'. Please use a valid IANA timezone (e.g. 'Asia/Kolkata').` };
  }

  if (!input.slots || !Array.isArray(input.slots)) {
    return { valid: false, error: 'Reminder slots must be provided as an array.' };
  }

  if (input.slots.length === 0 || input.slots.length > 3) {
    return { valid: false, error: 'A mentor may configure between 1 and 3 reminder slots.' };
  }

  const normalizedSlots: ReminderSlot[] = [];
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  for (let i = 0; i < input.slots.length; i++) {
    const s = input.slots[i];
    const slotIndex = Number(s.slotIndex) || (i + 1);

    if (slotIndex < 1 || slotIndex > 3) {
      return { valid: false, error: `Invalid slotIndex ${slotIndex}. Slots must be numbered 1, 2, or 3.` };
    }

    if (!s.time || typeof s.time !== 'string' || !timeRegex.test(s.time)) {
      return { valid: false, error: `Slot ${slotIndex} has an invalid time format: '${s.time}'. Expected 24h format HH:mm (e.g. '17:00').` };
    }

    normalizedSlots.push({
      slotIndex,
      time: s.time,
      enabled: Boolean(s.enabled),
    });
  }

  // Ensure unique slotIndices
  const slotIndices = normalizedSlots.map((s) => s.slotIndex);
  if (new Set(slotIndices).size !== slotIndices.length) {
    return { valid: false, error: 'Duplicate slotIndex found in slots configuration.' };
  }

  // Sort slots by slotIndex ascending (1, 2, 3)
  normalizedSlots.sort((a, b) => a.slotIndex - b.slotIndex);

  // Check chronological order and uniqueness among enabled slots
  const enabledSlots = normalizedSlots.filter((s) => s.enabled);
  for (let i = 0; i < enabledSlots.length - 1; i++) {
    const current = enabledSlots[i];
    const next = enabledSlots[i + 1];
    const currentMinutes = timeToMinutes(current.time);
    const nextMinutes = timeToMinutes(next.time);

    if (currentMinutes === nextMinutes) {
      return {
        valid: false,
        error: `Reminder slot ${current.slotIndex} and slot ${next.slotIndex} have duplicate time '${current.time}'. Reminder times must be unique.`,
      };
    }

    if (nextMinutes <= currentMinutes) {
      return {
        valid: false,
        error: `Reminder slot ${next.slotIndex} (${next.time}) cannot be earlier than or equal to Reminder slot ${current.slotIndex} (${current.time}). Reminders must be in chronological order.`,
      };
    }
  }

  return {
    valid: true,
    normalized: {
      enabled,
      timezone,
      slots: normalizedSlots,
    },
  };
}

/**
 * Returns formatted local date and minutes for a given date in an IANA timezone.
 */
export function getLocalTimeInTimezone(date: Date, timezone: string): {
  localDate: string; // 'YYYY-MM-DD'
  hours: number;
  minutes: number;
  timeStr: string; // 'HH:mm'
  minutesTotal: number;
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = parseInt(getPart('hour'), 10) % 24;
    const minute = parseInt(getPart('minute'), 10);
    const localDate = `${year}-${month}-${day}`;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
      localDate,
      hours: hour,
      minutes: minute,
      timeStr,
      minutesTotal: hour * 60 + minute,
    };
  } catch {
    // Fallback to Asia/Kolkata
    return getLocalTimeInTimezone(date, DEFAULT_REMINDER_TIMEZONE);
  }
}

/**
 * Checks whether current time matches a slot time within a 15-minute evaluation window.
 * Window: [slotMinutes, slotMinutes + 15)
 */
export function isSlotWindowActive(slotTimeStr: string, currentMinutesTotal: number): boolean {
  const slotMinutes = timeToMinutes(slotTimeStr);
  return currentMinutesTotal >= slotMinutes && currentMinutesTotal < slotMinutes + 15;
}

/**
 * Gets or initializes a mentor's reminder settings.
 */
export async function getMentorReminderSettings(mentorId: string): Promise<DailyReminderSettingDocument | {
  mentorId: string;
  enabled: boolean;
  timezone: string;
  slots: ReminderSlot[];
}> {
  if (mongoose.connection.readyState !== 1) {
    return {
      mentorId,
      enabled: true,
      timezone: DEFAULT_REMINDER_TIMEZONE,
      slots: [...DEFAULT_REMINDER_SLOTS],
    };
  }

  const found = await DailyReminderSetting.findOne({ mentorId }).lean();
  if (found) {
    return found;
  }

  return {
    mentorId,
    enabled: true,
    timezone: DEFAULT_REMINDER_TIMEZONE,
    slots: [...DEFAULT_REMINDER_SLOTS],
  };
}

/**
 * Saves a mentor's daily progress reminder settings.
 */
export async function saveMentorReminderSettings(
  mentorId: string,
  input: {
    enabled?: boolean;
    timezone?: string;
    slots?: Array<{ slotIndex: number; time: string; enabled: boolean }>;
  },
): Promise<DailyReminderSettingDocument> {
  const validation = validateReminderSettings(input);
  if (!validation.valid || !validation.normalized) {
    throw new Error(validation.error || 'Invalid reminder settings.');
  }

  const updated = await DailyReminderSetting.findOneAndUpdate(
    { mentorId },
    {
      $set: {
        enabled: validation.normalized.enabled,
        timezone: validation.normalized.timezone,
        slots: validation.normalized.slots,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return updated as DailyReminderSettingDocument;
}

/**
 * Returns user-friendly reminder message content based on the slot index.
 */
export function getReminderContentForSlot(slotIndex: number): { title: string; body: string } {
  switch (slotIndex) {
    case 1:
      return {
        title: 'Daily Progress Reminder',
        body: "Don't forget to complete your daily progress today.",
      };
    case 2:
      return {
        title: 'Daily Progress Still Pending',
        body: "You haven't submitted today's daily progress yet.",
      };
    case 3:
    default:
      return {
        title: 'Final Daily Progress Reminder',
        body: 'Your daily progress for today is still pending.',
      };
  }
}

/**
 * Evaluates active reminder schedules and dispatches Web Push notifications
 * to mentees who have not submitted today's daily progress.
 *
 * Rules:
 * - Mentee must be active
 * - Mentor reminder system must be enabled
 * - Mentee has not submitted today's daily progress
 * - Matches an active slot window
 * - Only 1 reminder sent per (menteeId, localDate, slotIndex) via idempotencyKey
 * - If mentee has already submitted today, NO reminders are sent.
 */
export async function evaluateDailyProgressReminders(targetDateOverride?: Date): Promise<{
  evaluatedCount: number;
  sentCount: number;
  skippedSubmitted: number;
  skippedDuplicate: number;
  skippedInactive: number;
}> {
  if (mongoose.connection.readyState !== 1 && process.env.NODE_ENV !== 'test' && !targetDateOverride) {
    return {
      evaluatedCount: 0,
      sentCount: 0,
      skippedSubmitted: 0,
      skippedDuplicate: 0,
      skippedInactive: 0,
    };
  }

  const now = targetDateOverride || new Date();
  let evaluatedCount = 0;
  let sentCount = 0;
  let skippedSubmitted = 0;
  let skippedDuplicate = 0;
  let skippedInactive = 0;

  try {
    // 1. Fetch all active mentorships
    const activeMentorships = await Mentorship.find({ status: 'active' }).lean();
    if (!activeMentorships || activeMentorships.length === 0) {
      return { evaluatedCount, sentCount, skippedSubmitted, skippedDuplicate, skippedInactive };
    }

    // 2. Group by mentorId
    const mentorshipsByMentor = new Map<string, string[]>();
    for (const ms of activeMentorships) {
      const list = mentorshipsByMentor.get(ms.mentorId) || [];
      list.push(ms.menteeId);
      mentorshipsByMentor.set(ms.mentorId, list);
    }

    // 3. Evaluate each mentor's schedule
    for (const [mentorId, menteeIds] of mentorshipsByMentor.entries()) {
      const settings = await getMentorReminderSettings(mentorId);

      // If mentor disabled reminders, skip all their mentees
      if (!settings.enabled) {
        continue;
      }

      const timezone = settings.timezone || DEFAULT_REMINDER_TIMEZONE;
      const { localDate, minutesTotal } = getLocalTimeInTimezone(now, timezone);

      // Check which enabled slot is currently active in this timezone
      const activeSlot = settings.slots
        .filter((s) => s.enabled)
        .find((s) => isSlotWindowActive(s.time, minutesTotal));

      if (!activeSlot) {
        // No reminder slot is currently active in this mentor's timezone
        continue;
      }

      const { title, body } = getReminderContentForSlot(activeSlot.slotIndex);

      // 4. Evaluate each mentee individually
      for (const menteeId of menteeIds) {
        evaluatedCount++;

        // A. Verify mentee is active
        const menteeDoc = await Mentee.findById(menteeId).lean();
        if (!menteeDoc || menteeDoc.status !== 'active' || !menteeDoc.userId) {
          skippedInactive++;
          continue;
        }

        const menteeUser = await User.findById(menteeDoc.userId).lean();
        if (!menteeUser || menteeUser.status !== 'active') {
          skippedInactive++;
          continue;
        }

        // B. Check if mentee has ALREADY submitted today's daily progress
        const existingSubmission = await DailyPerformance.findOne({
          menteeId,
          date: localDate,
        }).lean();

        if (existingSubmission) {
          // If submitted today, DO NOT send any remaining reminders for today!
          skippedSubmitted++;
          continue;
        }

        // C. Check Idempotency Key
        const idempotencyKey = `daily-reminder:${menteeId}:${localDate}:slot${activeSlot.slotIndex}`;

        // D. Create notification & dispatch Web Push
        const notification = await createNotification({
          userId: menteeDoc.userId,
          type: 'DAILY_REMINDER',
          category: 'dailyReminders',
          title,
          message: body,
          link: '/mentee/daily',
          metadata: {
            menteeId,
            date: localDate,
            slotIndex: activeSlot.slotIndex,
            scheduledTime: activeSlot.time,
            timezone,
          },
          idempotencyKey,
        });

        if (notification) {
          sentCount++;
        } else {
          skippedDuplicate++;
        }
      }
    }
  } catch (err) {
    console.error('[ReminderScheduler] Error evaluating daily reminders:', err);
  }

  return {
    evaluatedCount,
    sentCount,
    skippedSubmitted,
    skippedDuplicate,
    skippedInactive,
  };
}

let schedulerTimer: NodeJS.Timeout | null = null;

/**
 * Starts the periodic background evaluation interval (every 5 minutes).
 */
export function startReminderScheduler(): void {
  if (schedulerTimer) return;

  console.log('[ReminderScheduler] Starting Daily Progress Reminder scheduler (evaluates every 5 minutes)...');

  // Run initial evaluation after 10 seconds to allow services to initialize
  setTimeout(() => {
    void evaluateDailyProgressReminders().catch((err) =>
      console.warn('[ReminderScheduler] Initial evaluation error:', err),
    );
  }, 10_000).unref();

  // Run every 5 minutes
  schedulerTimer = setInterval(() => {
    void evaluateDailyProgressReminders().catch((err) =>
      console.warn('[ReminderScheduler] Periodic evaluation error:', err),
    );
  }, 5 * 60 * 1000);

  schedulerTimer.unref();
}

/**
 * Stops the periodic scheduler (for graceful shutdown or tests).
 */
export function stopReminderScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[ReminderScheduler] Daily Progress Reminder scheduler stopped.');
  }
}
