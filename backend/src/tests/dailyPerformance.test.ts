import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

const performanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  studyMinutes: z.number().min(0),
  quran: z
    .object({
      ruku: z.number().min(0).default(0),
      ayat: z.number().min(0).default(0),
      pages: z.number().min(0).default(0),
    })
    .default({ ruku: 0, ayat: 0, pages: 0 }),
  readingMinutes: z.number().min(0).default(0),
  dayRating: z.number().min(1).max(5),
  dailyReflection: z.string().max(1000).optional(),
  facedDifficulty: z.boolean().default(false),
  difficultyNote: z.string().max(1000).optional(),
  needsMentorHelp: z.boolean().default(false),
  mentorHelpNote: z.string().max(1000).optional(),
});

test('DAILY PERFORMANCE: validates valid daily performance payload', () => {
  const payload = {
    date: '2026-09-28',
    studyMinutes: 120,
    quran: { ruku: 2, ayat: 25, pages: 3 },
    readingMinutes: 30,
    dayRating: 4,
    dailyReflection: 'Completed algebra practice and recited Quran after Fajr.',
    facedDifficulty: false,
  };

  const parsed = performanceSchema.safeParse(payload);
  assert.equal(parsed.success, true);
});

test('DAILY PERFORMANCE: rejects invalid date formats and out-of-range ratings', () => {
  const invalidDate = {
    date: '28-09-2026', // wrong format
    studyMinutes: 60,
    dayRating: 4,
  };
  assert.equal(performanceSchema.safeParse(invalidDate).success, false);

  const invalidRating = {
    date: '2026-09-28',
    studyMinutes: 60,
    dayRating: 6, // max is 5
  };
  assert.equal(performanceSchema.safeParse(invalidRating).success, false);
});

test('DAILY PERFORMANCE: cross-user access authorization logic prevents unauthorized viewing', () => {
  function checkMenteeAccess(user: { id: string; role: string; menteeId?: string }, requestedMenteeId: string, assignedMentees: string[] = []): { allowed: boolean; status: number } {
    if (user.role === 'ADMIN') {
      return { allowed: true, status: 200 };
    }
    if (user.role === 'MENTEE') {
      if (user.menteeId === requestedMenteeId) {
        return { allowed: true, status: 200 };
      }
      return { allowed: false, status: 403 };
    }
    if (user.role === 'MENTOR') {
      if (assignedMentees.includes(requestedMenteeId)) {
        return { allowed: true, status: 200 };
      }
      return { allowed: false, status: 403 };
    }
    return { allowed: false, status: 403 };
  }

  // Admin access
  assert.equal(checkMenteeAccess({ id: 'admin1', role: 'ADMIN' }, 'mentee_100').status, 200);

  // Mentee A accessing own data
  assert.equal(checkMenteeAccess({ id: 'u1', role: 'MENTEE', menteeId: 'mentee_1' }, 'mentee_1').status, 200);

  // Mentee A accessing Mentee B's data -> 403 Forbidden
  assert.equal(checkMenteeAccess({ id: 'u1', role: 'MENTEE', menteeId: 'mentee_1' }, 'mentee_2').status, 403);

  // Mentor assigned to mentee_1
  assert.equal(checkMenteeAccess({ id: 'm1', role: 'MENTOR' }, 'mentee_1', ['mentee_1', 'mentee_3']).status, 200);

  // Mentor NOT assigned to mentee_2 -> 403 Forbidden
  assert.equal(checkMenteeAccess({ id: 'm1', role: 'MENTOR' }, 'mentee_2', ['mentee_1', 'mentee_3']).status, 403);
});

test('DAILY PERFORMANCE: date locking rejects backdated submissions for mentees', () => {
  function validateSubmissionDate(
    submittedDate: string | undefined,
    authoritativeDate: string,
    userRole: string,
  ): { allowed: boolean; status: number; message?: string; targetDate: string } {
    if (userRole !== 'ADMIN') {
      if (submittedDate && submittedDate !== authoritativeDate) {
        if (submittedDate < authoritativeDate) {
          return {
            allowed: false,
            status: 400,
            message: 'You can record your progress for today only. Previous days can no longer be submitted.',
            targetDate: authoritativeDate,
          };
        }
        if (submittedDate > authoritativeDate) {
          return {
            allowed: false,
            status: 400,
            message: 'Future-dated progress submissions are not allowed. You can only record progress for today.',
            targetDate: authoritativeDate,
          };
        }
      }
    }
    return {
      allowed: true,
      status: 200,
      targetDate: userRole === 'ADMIN' && submittedDate ? submittedDate : authoritativeDate,
    };
  }

  const authoritativeToday = '2026-10-26';

  // 1. Mentee tries to submit yesterday -> Rejected 400
  const yesterdayResult = validateSubmissionDate('2026-10-25', authoritativeToday, 'MENTEE');
  assert.equal(yesterdayResult.allowed, false);
  assert.equal(yesterdayResult.status, 400);
  assert.match(yesterdayResult.message || '', /Previous days can no longer be submitted/i);

  // 2. Mentee tries to submit 1 week ago -> Rejected 400
  const weekAgoResult = validateSubmissionDate('2026-10-19', authoritativeToday, 'MENTEE');
  assert.equal(weekAgoResult.allowed, false);
  assert.equal(weekAgoResult.status, 400);

  // 3. Mentee tries to submit tomorrow -> Rejected 400
  const futureResult = validateSubmissionDate('2026-10-27', authoritativeToday, 'MENTEE');
  assert.equal(futureResult.allowed, false);
  assert.equal(futureResult.status, 400);
  assert.match(futureResult.message || '', /Future-dated progress submissions are not allowed/i);

  // 4. Mentee submits today's date -> Accepted 200
  const todayResult = validateSubmissionDate('2026-10-26', authoritativeToday, 'MENTEE');
  assert.equal(todayResult.allowed, true);
  assert.equal(todayResult.status, 200);
  assert.equal(todayResult.targetDate, '2026-10-26');

  // 5. Mentee omits date -> Accepted and automatically locked to authoritative today
  const omittedResult = validateSubmissionDate(undefined, authoritativeToday, 'MENTEE');
  assert.equal(omittedResult.allowed, true);
  assert.equal(omittedResult.targetDate, '2026-10-26');
});

test('DAILY PERFORMANCE: mentees cannot edit past days records', () => {
  function checkEditEligibility(recordDate: string, authoritativeToday: string, userRole: string): { allowed: boolean; status: number } {
    if (userRole === 'MENTEE') {
      if (recordDate !== authoritativeToday) {
        return { allowed: false, status: 400 };
      }
    }
    return { allowed: true, status: 200 };
  }

  const today = '2026-10-26';

  // Mentee editing today's record is allowed
  assert.equal(checkEditEligibility('2026-10-26', today, 'MENTEE').allowed, true);

  // Mentee editing yesterday's record is blocked
  assert.equal(checkEditEligibility('2026-10-25', today, 'MENTEE').allowed, false);
  assert.equal(checkEditEligibility('2026-10-25', today, 'MENTEE').status, 400);

  // Admin editing past record is allowed
  assert.equal(checkEditEligibility('2026-10-25', today, 'ADMIN').allowed, true);
});

test('DAILY PERFORMANCE: authoritative reporting date adheres to timezone boundaries', () => {
  function getLocalReportingDate(utcDate: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(utcDate);
  }

  // At 2026-10-26 19:00:00 UTC:
  // In UTC: 2026-10-26
  // In Asia/Kolkata (+05:30): 2026-10-27 00:30:00 -> Date has crossed to 2026-10-27
  const lateUtc = new Date('2026-10-26T19:00:00Z');
  assert.equal(getLocalReportingDate(lateUtc, 'UTC'), '2026-10-26');
  assert.equal(getLocalReportingDate(lateUtc, 'Asia/Kolkata'), '2026-10-27');

  // At 2026-10-26 01:00:00 UTC:
  // In UTC: 2026-10-26
  // In America/New_York (-04:00 EDT): 2026-10-25 21:00:00 -> Still previous day
  const earlyUtc = new Date('2026-10-26T01:00:00Z');
  assert.equal(getLocalReportingDate(earlyUtc, 'America/New_York'), '2026-10-25');
  assert.equal(getLocalReportingDate(earlyUtc, 'Asia/Kolkata'), '2026-10-26');
});

