import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterEligibleMentees,
  getIsoWeekBoundaries,
  calculateWeeklyLeaderboardScore,
  getCalendarMonthBoundaries,
  calculateMonthlyLeaderboardScore,
  getAvailableHistoricalPeriods,
  rankLeaderboardEntries,
  type MenteeCandidate,
  type UserCandidate,
  type RawLeaderboardEntry,
} from '../services/menteeGrowthService.js';

test('LEADERBOARD ELIGIBILITY: only active mentees are included, excluding inactive/soft-deleted', () => {
  const mentees: MenteeCandidate[] = [
    { _id: 'm1', name: 'Zainab Ahmed', status: 'active', deletedAt: null },
    { _id: 'm2', name: 'Inactive User', status: 'inactive', deletedAt: null },
    { _id: 'm3', name: 'Deleted Mentee', status: 'active', deletedAt: new Date() },
    { _id: 'm4', name: 'Bilal Khan', status: 'active', deletedAt: null },
  ];
  const users: UserCandidate[] = [];

  const eligible = filterEligibleMentees(mentees, users);
  assert.equal(eligible.length, 2);
  assert.deepEqual(eligible.map((e) => e._id), ['m1', 'm4']);
});

test('LEADERBOARD ELIGIBILITY: mentors and administrators are strictly excluded from mentee rankings', () => {
  const mentees: MenteeCandidate[] = [
    { _id: 'm1', name: 'Aisha Mentee', userId: 'u1', status: 'active' },
    { _id: 'm2', name: 'Admin Linked', userId: 'u_admin', status: 'active' },
    { _id: 'm3', name: 'Mentor Linked', userId: 'u_mentor', status: 'active' },
    { _id: 'm4', name: 'Tariq Mentee', userId: 'u4', status: 'active' },
  ];
  const users: UserCandidate[] = [
    { _id: 'u1', role: 'MENTEE', status: 'active', deletedAt: null },
    { _id: 'u_admin', role: 'ADMIN', status: 'active', deletedAt: null },
    { _id: 'u_mentor', role: 'MENTOR', status: 'active', deletedAt: null },
    { _id: 'u4', role: 'MENTEE', status: 'active', deletedAt: null },
  ];

  const eligible = filterEligibleMentees(mentees, users);
  assert.equal(eligible.length, 2);
  assert.deepEqual(eligible.map((e) => e.name), ['Aisha Mentee', 'Tariq Mentee']);
});

test('LEADERBOARD ELIGIBILITY: disabled and soft-deleted user accounts are excluded', () => {
  const mentees: MenteeCandidate[] = [
    { _id: 'm1', name: 'Active User', userId: 'u1', status: 'active' },
    { _id: 'm2', name: 'Suspended User', userId: 'u2', status: 'active' },
    { _id: 'm3', name: 'Deleted User', userId: 'u3', status: 'active' },
  ];
  const users: UserCandidate[] = [
    { _id: 'u1', role: 'MENTEE', status: 'active', deletedAt: null },
    { _id: 'u2', role: 'MENTEE', status: 'disabled', deletedAt: null },
    { _id: 'u3', role: 'MENTEE', status: 'active', deletedAt: new Date() },
  ];

  const eligible = filterEligibleMentees(mentees, users);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].name, 'Active User');
});

test('LEADERBOARD ELIGIBILITY: deduplicates multiple records referencing the same mentee or user', () => {
  const mentees: MenteeCandidate[] = [
    { _id: 'm1', name: 'Fatima Noor', userId: 'u1', status: 'active' },
    { _id: 'm1', name: 'Fatima Noor (Duplicate ID)', userId: 'u1', status: 'active' },
    { _id: 'm2', name: 'Fatima Noor (Different ID, Same User)', userId: 'u1', status: 'active' },
    { _id: 'm3', name: 'Hamza Ali', userId: 'u3', status: 'active' },
  ];
  const users: UserCandidate[] = [
    { _id: 'u1', role: 'MENTEE', status: 'active' },
    { _id: 'u3', role: 'MENTEE', status: 'active' },
  ];

  const eligible = filterEligibleMentees(mentees, users);
  assert.equal(eligible.length, 2);
  assert.deepEqual(eligible.map((e) => e._id), ['m1', 'm3']);
});

test('LEADERBOARD SCORING: calculates weekly points with consistency milestone', () => {
  // 0 submissions: 0 pts
  assert.deepEqual(calculateWeeklyLeaderboardScore([]), {
    weeklyPoints: 0,
    weeklySubmissions: 0,
    hasConsistencyBonus: false,
  });

  // 3 submissions: 3 * 10 = 30 pts
  assert.deepEqual(calculateWeeklyLeaderboardScore(['2026-10-26', '2026-10-27', '2026-10-28']), {
    weeklyPoints: 30,
    weeklySubmissions: 3,
    hasConsistencyBonus: false,
  });

  // 5 submissions: 5 * 10 + 50 bonus = 100 pts
  assert.deepEqual(
    calculateWeeklyLeaderboardScore(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']),
    {
      weeklyPoints: 100,
      weeklySubmissions: 5,
      hasConsistencyBonus: true,
    },
  );

  // 7 submissions (perfect week): 7 * 10 + 50 = 120 pts
  assert.deepEqual(
    calculateWeeklyLeaderboardScore([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]),
    {
      weeklyPoints: 120,
      weeklySubmissions: 7,
      hasConsistencyBonus: true,
    },
  );
});

test('LEADERBOARD PERIOD: calculates Monday–Sunday week boundaries accurately', () => {
  // Monday Oct 26, 2026
  const boundariesCurrent = getIsoWeekBoundaries('2026-10-26', 0);
  assert.equal(boundariesCurrent.startDate, '2026-10-26');
  assert.equal(boundariesCurrent.endDate, '2026-11-01');
  assert.ok(boundariesCurrent.weekLabel.includes('This Week'));

  // Wednesday Oct 28, 2026 (same week)
  const boundariesWed = getIsoWeekBoundaries('2026-10-28', 0);
  assert.equal(boundariesWed.startDate, '2026-10-26');
  assert.equal(boundariesWed.endDate, '2026-11-01');

  // Sunday Nov 1, 2026 (last day of the week)
  const boundariesSun = getIsoWeekBoundaries('2026-11-01', 0);
  assert.equal(boundariesSun.startDate, '2026-10-26');
  assert.equal(boundariesSun.endDate, '2026-11-01');

  // Previous week offset (-1)
  const boundariesPrev = getIsoWeekBoundaries('2026-10-26', -1);
  assert.equal(boundariesPrev.startDate, '2026-10-19');
  assert.equal(boundariesPrev.endDate, '2026-10-25');
});

test('LEADERBOARD RANKING: sorts by weekly points, break ties, and assigns ranks', () => {
  const entries: RawLeaderboardEntry[] = [
    {
      menteeId: 'm1',
      name: 'Aisha',
      isMe: false,
      currentStreak: 3,
      weeklyPoints: 40,
      weeklySubmissions: 4,
      totalSubmissions: 10,
      totalXp: 180,
    },
    {
      menteeId: 'm2',
      name: 'Bilal',
      isMe: false,
      currentStreak: 7,
      weeklyPoints: 100, // 1st
      weeklySubmissions: 5,
      totalSubmissions: 25,
      totalXp: 450,
    },
    {
      menteeId: 'm3',
      name: 'Dawood',
      isMe: false,
      currentStreak: 0,
      weeklyPoints: 0, // 4th
      weeklySubmissions: 0,
      totalSubmissions: 2,
      totalXp: 40,
    },
    {
      menteeId: 'm4',
      name: 'Chishti',
      isMe: true, // Signed-in mentee
      currentStreak: 4,
      weeklyPoints: 40, // Tied with Aisha on points, but higher streak (4 vs 3) -> 2nd
      weeklySubmissions: 4,
      totalSubmissions: 12,
      totalXp: 210,
    },
  ];

  const ranked = rankLeaderboardEntries(entries, 'weekly');
  assert.equal(ranked.length, 4);

  // Bilal should be rank 1 (100 pts)
  assert.equal(ranked[0].menteeId, 'm2');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].isTopThree, true);

  // Chishti (m4) has 40 pts, 4 submissions, streak 4 -> rank 2
  assert.equal(ranked[1].menteeId, 'm4');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[1].isMe, true);
  assert.equal(ranked[1].isTopThree, true);

  // Aisha (m1) has 40 pts, 4 submissions, streak 3 -> rank 3
  assert.equal(ranked[2].menteeId, 'm1');
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[2].isTopThree, true);

  // Dawood (m3) has 0 pts -> rank 4
  assert.equal(ranked[3].menteeId, 'm3');
  assert.equal(ranked[3].rank, 4);
  assert.equal(ranked[3].isTopThree, false);
});

test('LEADERBOARD RANKING: handles true ties by assigning identical rank numbers', () => {
  const entries: RawLeaderboardEntry[] = [
    {
      menteeId: 'm1',
      name: 'Kareem',
      isMe: false,
      currentStreak: 5,
      weeklyPoints: 50,
      weeklySubmissions: 5,
      totalSubmissions: 15,
      totalXp: 300,
    },
    {
      menteeId: 'm2',
      name: 'Nadia',
      isMe: false,
      currentStreak: 5,
      weeklyPoints: 50, // True tie with Kareem on pts, submissions, and streak
      weeklySubmissions: 5,
      totalSubmissions: 15,
      totalXp: 300,
    },
    {
      menteeId: 'm3',
      name: 'Omar',
      isMe: false,
      currentStreak: 2,
      weeklyPoints: 20,
      weeklySubmissions: 2,
      totalSubmissions: 8,
      totalXp: 120,
    },
  ];

  const ranked = rankLeaderboardEntries(entries, 'weekly');
  // Both Kareem and Nadia share rank 1
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 1);
  // Omar gets rank 3 (standard competition ranking: 1, 1, 3)
  assert.equal(ranked[2].rank, 3);
});

test('LEADERBOARD MONTHLY PERIOD: calculates calendar month boundaries accurately', () => {
  // Current month: October 2026
  const boundsCurrent = getCalendarMonthBoundaries('2026-10-26', 0);
  assert.equal(boundsCurrent.startDate, '2026-10-01');
  assert.equal(boundsCurrent.endDate, '2026-10-31');
  assert.equal(boundsCurrent.monthYear, 'October 2026');
  assert.ok(boundsCurrent.monthLabel.includes('This Month'));

  // Previous month offset (-1): September 2026
  const boundsPrev = getCalendarMonthBoundaries('2026-10-26', -1);
  assert.equal(boundsPrev.startDate, '2026-09-01');
  assert.equal(boundsPrev.endDate, '2026-09-30');
  assert.equal(boundsPrev.monthYear, 'September 2026');

  // Month offset (-2): August 2026
  const boundsAug = getCalendarMonthBoundaries('2026-10-26', -2);
  assert.equal(boundsAug.startDate, '2026-08-01');
  assert.equal(boundsAug.endDate, '2026-08-31');
  assert.equal(boundsAug.monthYear, 'August 2026');
});

test('LEADERBOARD MONTHLY SCORING: calculates monthly points with weekly consistency milestones', () => {
  // 4 submissions in a single week -> 4 * 10 = 40 pts (no consistency bonus)
  const score1 = calculateMonthlyLeaderboardScore([
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
  ]);
  assert.equal(score1.monthlyPoints, 40);
  assert.equal(score1.monthlySubmissions, 4);
  assert.equal(score1.weeklyMilestonesEarned, 0);

  // 5 submissions in one week -> 5 * 10 + 50 = 100 pts (1 weekly milestone)
  const score2 = calculateMonthlyLeaderboardScore([
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
  ]);
  assert.equal(score2.monthlyPoints, 100);
  assert.equal(score2.monthlySubmissions, 5);
  assert.equal(score2.weeklyMilestonesEarned, 1);

  // 12 submissions across 2 qualifying weeks -> 12 * 10 + (2 * 50) = 220 pts
  const score3 = calculateMonthlyLeaderboardScore([
    // Week 1: 5 submissions
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
    // Week 2: 7 submissions
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
    '2026-10-18',
  ]);
  assert.equal(score3.monthlyPoints, 220);
  assert.equal(score3.monthlySubmissions, 12);
  assert.equal(score3.weeklyMilestonesEarned, 2);
});

test('LEADERBOARD MONTHLY RANKING: sorts and breaks ties for monthly period', () => {
  const entries: RawLeaderboardEntry[] = [
    {
      menteeId: 'm1',
      name: 'Yusuf',
      isMe: false,
      currentStreak: 10,
      weeklyPoints: 20,
      weeklySubmissions: 2,
      monthlyPoints: 140,
      monthlySubmissions: 9,
      totalSubmissions: 30,
      totalXp: 500,
    },
    {
      menteeId: 'm2',
      name: 'Fatima',
      isMe: false,
      currentStreak: 12,
      weeklyPoints: 70,
      weeklySubmissions: 7,
      monthlyPoints: 220,
      monthlySubmissions: 12,
      totalSubmissions: 45,
      totalXp: 850,
    },
    {
      menteeId: 'm3',
      name: 'Hamza',
      isMe: true,
      currentStreak: 5,
      weeklyPoints: 30,
      weeklySubmissions: 3,
      monthlyPoints: 140, // Tied with Yusuf on points, but fewer submissions (7 vs 9)
      monthlySubmissions: 7,
      totalSubmissions: 20,
      totalXp: 350,
    },
  ];

  const ranked = rankLeaderboardEntries(entries, 'monthly');
  assert.equal(ranked[0].menteeId, 'm2'); // Fatima 220 pts -> Rank 1
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].menteeId, 'm1'); // Yusuf 140 pts, 9 submissions -> Rank 2
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].menteeId, 'm3'); // Hamza 140 pts, 7 submissions -> Rank 3
  assert.equal(ranked[2].rank, 3);
});

test('LEADERBOARD HISTORICAL PERIODS: generates completed past weekly and monthly options', () => {
  const { weekly, monthly } = getAvailableHistoricalPeriods('2026-10-26');
  assert.ok(weekly.length >= 2);
  assert.ok(monthly.length >= 2);

  // Past week #1 should be Oct 19-25, 2026 (offset -1)
  assert.equal(weekly[0].offset, -1);
  assert.equal(weekly[0].startDate, '2026-10-19');
  assert.equal(weekly[0].endDate, '2026-10-25');
  assert.equal(weekly[0].type, 'weekly');

  // Past month #1 should be September 2026 (offset -1)
  assert.equal(monthly[0].offset, -1);
  assert.equal(monthly[0].startDate, '2026-09-01');
  assert.equal(monthly[0].endDate, '2026-09-30');
  assert.equal(monthly[0].label, 'September 2026');
  assert.equal(monthly[0].type, 'monthly');
});

