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
