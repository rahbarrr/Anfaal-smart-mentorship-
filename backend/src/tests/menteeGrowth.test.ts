import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStreaks,
  calculateTotalXp,
  getLevelInfo,
  buildWeeklyCalendar,
  getDaysDifference,
  addDays,
} from '../services/menteeGrowthService.js';

test('STREAK CALCULATION: empty submissions returns zero streaks', () => {
  const result = calculateStreaks([], '2026-10-10');
  assert.equal(result.currentStreak, 0);
  assert.equal(result.bestStreak, 0);
});

test('STREAK CALCULATION: current streak active when submitted today', () => {
  const today = '2026-10-10';
  const dates = ['2026-10-08', '2026-10-09', '2026-10-10'];
  const result = calculateStreaks(dates, today);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.bestStreak, 3);
});

test('STREAK CALCULATION: streak remains alive when submitted yesterday but pending today', () => {
  const today = '2026-10-10';
  // User submitted up to yesterday (2026-10-09)
  const dates = ['2026-10-07', '2026-10-08', '2026-10-09'];
  const result = calculateStreaks(dates, today);
  assert.equal(result.currentStreak, 3, 'Streak must stay alive until today has ended');
  assert.equal(result.bestStreak, 3);
});

test('STREAK CALCULATION: broken streak when missed both today and yesterday', () => {
  const today = '2026-10-10';
  // Last submission was 3 days ago (2026-10-07)
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07'];
  const result = calculateStreaks(dates, today);
  assert.equal(result.currentStreak, 0, 'Current streak should reset to 0 after missed day');
  assert.equal(result.bestStreak, 3, 'Historical best streak must be preserved');
});

test('STREAK CALCULATION: preserves historical best streak across gaps', () => {
  const today = '2026-10-10';
  const dates = [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-05', // 5-day best streak in past
    '2026-10-09',
    '2026-10-10', // 2-day current streak
  ];
  const result = calculateStreaks(dates, today);
  assert.equal(result.currentStreak, 2);
  assert.equal(result.bestStreak, 5);
});

test('XP CALCULATION: calculates base check-in XP, first-step bonus, and streak milestones', () => {
  // Case A: 0 submissions
  assert.equal(calculateTotalXp({ submissionCount: 0, uniqueSortedDates: [], bestStreak: 0, hasGoalSet: false }), 0);

  // Case B: 1 submission (10 base + 20 first-step) = 30 XP
  const xp1 = calculateTotalXp({
    submissionCount: 1,
    uniqueSortedDates: ['2026-10-10'],
    bestStreak: 1,
    hasGoalSet: false,
  });
  assert.equal(xp1, 30);

  // Case C: 5 submissions in one week (+50 consistency bonus) + 3-day streak bonus (+25) + goal set (+25)
  // 5 * 10 (50) + 20 (first) + 50 (weekly 5) + 25 (streak 3) + 25 (goal) = 170 XP
  const weekDates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const xpWeek = calculateTotalXp({
    submissionCount: 5,
    uniqueSortedDates: weekDates,
    bestStreak: 5,
    hasGoalSet: true,
  });
  assert.equal(xpWeek, 170);
});

test('LEVEL PROGRESSION: scales levels and bounds progress percentage', () => {
  const lvl1 = getLevelInfo(50);
  assert.equal(lvl1.level, 1);
  assert.equal(lvl1.levelName, 'Explorer');
  assert.equal(lvl1.progressPercent, 50);

  const lvl2 = getLevelInfo(150);
  assert.equal(lvl2.level, 2);
  assert.equal(lvl2.levelName, 'Dedicated Learner');
  assert.equal(lvl2.currentLevelFloor, 100);
  assert.equal(lvl2.nextLevelThreshold, 250);

  const lvl5 = getLevelInfo(1200);
  assert.equal(lvl5.level, 5);
  assert.equal(lvl5.levelName, 'Master Mentee');
});

test('WEEKLY CALENDAR: accurately segments days of the week and flags today', () => {
  const todayStr = '2026-10-10'; // Saturday
  const recordsMap = new Map([
    ['2026-10-06', { studyMinutes: 60 }],
    ['2026-10-10', { studyMinutes: 90 }],
  ]);

  const calendar = buildWeeklyCalendar({
    todayStr,
    weekOffset: 0,
    recordsMap,
  });

  assert.equal(calendar.days.length, 7);
  assert.equal(calendar.completedCount, 2);

  const sat = calendar.days.find((d) => d.date === '2026-10-10');
  assert.ok(sat);
  assert.equal(sat.isToday, true);
  assert.equal(sat.submitted, true);
  assert.equal(sat.studyMinutes, 90);

  const sun = calendar.days.find((d) => d.dayName === 'Sun');
  assert.ok(sun);
  assert.equal(sun.isFuture, true);
  assert.equal(sun.submitted, false);
});
