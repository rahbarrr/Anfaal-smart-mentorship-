import 'server-only';
import { getFirebaseAdmin } from '../firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Kolkata';

export interface ReminderSlot {
  slotIndex: number;
  time: string; // 'HH:mm'
  enabled: boolean;
}

export interface MentorReminderSettings {
  mentorId: string;
  enabled: boolean;
  timezone: string;
  slots: ReminderSlot[];
}

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  return h * 60 + m;
}

export function isSlotWindowActive(slotTime: string, currentMinutes: number, windowMinutes = 15): boolean {
  const slotMinutes = timeToMinutes(slotTime);
  return currentMinutes >= slotMinutes && currentMinutes < slotMinutes + windowMinutes;
}

export function getLocalTimeInTimezone(now: Date, timeZone: string): { localDate: string; minutesTotal: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value || '';
    const m = parts.find((p) => p.type === 'month')?.value || '';
    const d = parts.find((p) => p.type === 'day')?.value || '';
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

    return {
      localDate: `${y}-${m}-${d}`,
      minutesTotal: hour * 60 + minute,
    };
  } catch {
    // Fallback to UTC/Kolkata
    return {
      localDate: now.toISOString().split('T')[0],
      minutesTotal: now.getUTCHours() * 60 + now.getUTCMinutes(),
    };
  }
}

export function getReminderContentForSlot(slotIndex: number): { title: string; body: string } {
  switch (slotIndex) {
    case 1:
      return {
        title: 'Daily Progress Reminder',
        body: "Don't forget to complete your daily progress report today.",
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
        body: 'Your daily progress for today is still pending. Please submit before the end of the day.',
      };
  }
}

export async function evaluateDailyProgressReminders(targetDateOverride?: Date): Promise<{
  evaluatedCount: number;
  sentCount: number;
  skippedSubmitted: number;
  skippedDuplicate: number;
  skippedInactive: number;
}> {
  const now = targetDateOverride || new Date();
  const { adminDb } = getFirebaseAdmin();

  let evaluatedCount = 0;
  let sentCount = 0;
  let skippedSubmitted = 0;
  let skippedDuplicate = 0;
  let skippedInactive = 0;

  // 1. Fetch all active mentorships
  const mentorshipsSnap = await adminDb
    .collection('mentorships')
    .where('status', '==', 'active')
    .get();

  if (mentorshipsSnap.empty) {
    return { evaluatedCount, sentCount, skippedSubmitted, skippedDuplicate, skippedInactive };
  }

  // Group by mentorId
  const menteesByMentor = new Map<string, string[]>();
  for (const doc of mentorshipsSnap.docs) {
    const data = doc.data();
    const mentorId = String(data.mentorId);
    const menteeId = String(data.menteeId);
    const list = menteesByMentor.get(mentorId) || [];
    list.push(menteeId);
    menteesByMentor.set(mentorId, list);
  }

  // 2. Evaluate each mentor schedule
  for (const [mentorId, menteeIds] of menteesByMentor.entries()) {
    const settingsDoc = await adminDb.collection('mentor_reminder_settings').doc(mentorId).get();
    const settings: MentorReminderSettings = settingsDoc.exists
      ? (settingsDoc.data() as any)
      : {
          mentorId,
          enabled: true,
          timezone: DEFAULT_REMINDER_TIMEZONE,
          slots: [
            { slotIndex: 1, time: '17:00', enabled: true },
            { slotIndex: 2, time: '19:00', enabled: true },
            { slotIndex: 3, time: '21:00', enabled: true },
          ],
        };

    if (!settings.enabled) continue;

    const timezone = settings.timezone || DEFAULT_REMINDER_TIMEZONE;
    const { localDate, minutesTotal } = getLocalTimeInTimezone(now, timezone);

    // Check which slot is active
    const activeSlot = settings.slots
      ?.filter((s) => s.enabled)
      .find((s) => isSlotWindowActive(s.time, minutesTotal));

    if (!activeSlot) continue;

    const { title, body } = getReminderContentForSlot(activeSlot.slotIndex);

    // 3. Evaluate each mentee
    for (const menteeId of menteeIds) {
      evaluatedCount++;

      // Verify mentee is active
      const menteeDoc = await adminDb.collection('mentees').doc(menteeId).get();
      if (!menteeDoc.exists || menteeDoc.data()?.status !== 'active') {
        skippedInactive++;
        continue;
      }

      const menteeData = menteeDoc.data()!;
      const menteeUserId = menteeData.userId || menteeId;

      // Check if already submitted today
      const submissionSnap = await adminDb
        .collection('daily_performances')
        .where('menteeId', '==', menteeId)
        .where('date', '==', localDate)
        .limit(1)
        .get();

      if (!submissionSnap.empty) {
        skippedSubmitted++;
        continue;
      }

      // Check idempotency: already sent this slot today?
      const idempotencyKey = `reminder:${menteeId}:${localDate}:slot${activeSlot.slotIndex}`;
      const existingNotifSnap = await adminDb
        .collection('notifications')
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();

      if (!existingNotifSnap.empty) {
        skippedDuplicate++;
        continue;
      }

      // Send in-app notification
      await adminDb.collection('notifications').add({
        userId: String(menteeUserId),
        menteeId,
        title,
        message: body,
        type: 'daily_reminder',
        category: 'reminder',
        link: '/mentee/daily',
        read: false,
        idempotencyKey,
        slotIndex: activeSlot.slotIndex,
        localDate,
        createdAt: Timestamp.now(),
      });

      sentCount++;
    }
  }

  console.info(
    `[ReminderScheduler] Evaluated: ${evaluatedCount}, Sent: ${sentCount}, SkippedSubmitted: ${skippedSubmitted}, SkippedDuplicate: ${skippedDuplicate}, SkippedInactive: ${skippedInactive}`,
  );

  return { evaluatedCount, sentCount, skippedSubmitted, skippedDuplicate, skippedInactive };
}
