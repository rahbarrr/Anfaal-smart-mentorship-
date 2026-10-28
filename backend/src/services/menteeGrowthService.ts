import { DailyPerformance } from '../models/DailyPerformance.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';
import { User } from '../models/User.js';
import { Call } from '../models/Call.js';
import { LeaderboardSnapshot } from '../models/LeaderboardSnapshot.js';

// ─── Gamification Rules Constants ─────────────────────────────────────────────
export const XP_RULES = {
  PER_CHECKIN: 10,
  FIRST_CHECKIN_BONUS: 20,
  WEEKLY_CONSISTENCY_BONUS: 50, // 5+ checkins in a Monday-Sunday week
  STREAK_3_BONUS: 25,
  STREAK_7_BONUS: 50,
  STREAK_14_BONUS: 100,
  STREAK_30_BONUS: 250,
  GOAL_SET_BONUS: 25,
};

export interface LevelInfo {
  level: number;
  levelName: string;
  totalXp: number;
  currentLevelFloor: number;
  nextLevelThreshold: number;
  progressPercent: number;
}

export function getLevelInfo(totalXp: number): LevelInfo {
  const levels = [
    { level: 1, name: 'Explorer', min: 0, max: 100 },
    { level: 2, name: 'Dedicated Learner', min: 100, max: 250 },
    { level: 3, name: 'Consistent Scholar', min: 250, max: 500 },
    { level: 4, name: 'Growth Champion', min: 500, max: 1000 },
    { level: 5, name: 'Master Mentee', min: 1000, max: 2500 },
  ];

  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    if (totalXp < l.max || i === levels.length - 1) {
      const range = l.max - l.min;
      const progressInLevel = Math.max(0, totalXp - l.min);
      const progressPercent = Math.min(100, Math.round((progressInLevel / range) * 100));
      return {
        level: l.level,
        levelName: l.name,
        totalXp,
        currentLevelFloor: l.min,
        nextLevelThreshold: l.max,
        progressPercent,
      };
    }
  }

  return {
    level: 5,
    levelName: 'Master Mentee',
    totalXp,
    currentLevelFloor: 1000,
    nextLevelThreshold: 2500,
    progressPercent: 100,
  };
}

// ─── Date Utility Helpers ─────────────────────────────────────────────────────

export function getLocalTodayString(timezone = 'Asia/Kolkata'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export function getDaysDifference(dateStrA: string, dateStrB: string): number {
  const msA = Date.parse(dateStrA + 'T00:00:00Z');
  const msB = Date.parse(dateStrB + 'T00:00:00Z');
  return Math.round((msA - msB) / (1000 * 60 * 60 * 24));
}

// ─── Streaks Calculation ──────────────────────────────────────────────────────

export function calculateStreaks(
  uniqueSortedDates: string[],
  todayStr: string,
): { currentStreak: number; bestStreak: number } {
  if (!uniqueSortedDates.length) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  const dateSet = new Set(uniqueSortedDates);
  const yesterdayStr = addDays(todayStr, -1);

  // 1. Current Streak: Must connect to today or yesterday
  let currentStreak = 0;
  let checkCursor = dateSet.has(todayStr)
    ? todayStr
    : dateSet.has(yesterdayStr)
      ? yesterdayStr
      : null;

  if (checkCursor) {
    while (dateSet.has(checkCursor)) {
      currentStreak++;
      checkCursor = addDays(checkCursor, -1);
    }
  }

  // 2. Best Streak: Max consecutive calendar days ever
  let bestStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < uniqueSortedDates.length; i++) {
    const diff = getDaysDifference(uniqueSortedDates[i], uniqueSortedDates[i - 1]);
    if (diff === 1) {
      currentRun++;
      if (currentRun > bestStreak) {
        bestStreak = currentRun;
      }
    } else if (diff > 1) {
      currentRun = 1;
    }
  }

  return {
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
  };
}

// ─── Group by ISO Week for Consistency Bonus ──────────────────────────────────

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  // Monday as first day of week (1), Sunday as last (7)
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diffToMonday);
  return monday.toISOString().split('T')[0];
}

export function calculateTotalXp(params: {
  submissionCount: number;
  uniqueSortedDates: string[];
  bestStreak: number;
  hasGoalSet: boolean;
}): number {
  const { submissionCount, uniqueSortedDates, bestStreak, hasGoalSet } = params;
  if (submissionCount === 0) return 0;

  let totalXp = 0;

  // Base XP per check-in
  totalXp += submissionCount * XP_RULES.PER_CHECKIN;

  // First check-in milestone
  if (submissionCount > 0) {
    totalXp += XP_RULES.FIRST_CHECKIN_BONUS;
  }

  // Weekly consistency bonuses: 5+ days in a week
  const weekCounts = new Map<string, number>();
  for (const date of uniqueSortedDates) {
    const wk = getWeekKey(date);
    weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1);
  }

  for (const count of weekCounts.values()) {
    if (count >= 5) {
      totalXp += XP_RULES.WEEKLY_CONSISTENCY_BONUS;
    }
  }

  // Streak bonuses (awarded once when milestone reached)
  if (bestStreak >= 3) totalXp += XP_RULES.STREAK_3_BONUS;
  if (bestStreak >= 7) totalXp += XP_RULES.STREAK_7_BONUS;
  if (bestStreak >= 14) totalXp += XP_RULES.STREAK_14_BONUS;
  if (bestStreak >= 30) totalXp += XP_RULES.STREAK_30_BONUS;

  // Goal defined bonus
  if (hasGoalSet) totalXp += XP_RULES.GOAL_SET_BONUS;

  return totalXp;
}

// ─── Weekly Calendar Builder ──────────────────────────────────────────────────

export interface CalendarDay {
  date: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
  submitted: boolean;
  studyMinutes: number;
  dayRating?: number;
}

export function buildWeeklyCalendar(params: {
  todayStr: string;
  weekOffset: number;
  recordsMap: Map<string, any>;
}): {
  weekLabel: string;
  startDate: string;
  endDate: string;
  days: CalendarDay[];
  completedCount: number;
} {
  const { todayStr, weekOffset, recordsMap } = params;

  // Compute Monday of the requested week
  const today = new Date(todayStr + 'T12:00:00Z');
  const dayOfWeek = today.getUTCDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const targetMonday = new Date(today);
  targetMonday.setUTCDate(today.getUTCDate() - diffToMonday + weekOffset * 7);

  const days: CalendarDay[] = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let completedCount = 0;

  for (let i = 0; i < 7; i++) {
    const cur = new Date(targetMonday);
    cur.setUTCDate(targetMonday.getUTCDate() + i);
    const dateStr = cur.toISOString().split('T')[0];

    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const isPast = dateStr < todayStr;
    const record = recordsMap.get(dateStr);
    const submitted = Boolean(record);

    if (submitted) {
      completedCount++;
    }

    days.push({
      date: dateStr,
      dayName: dayNames[i],
      dayNumber: cur.getUTCDate(),
      isToday,
      isFuture,
      isPast,
      submitted,
      studyMinutes: record?.studyMinutes ?? 0,
      dayRating: record?.dayRating,
    });
  }

  const startDate = days[0].date;
  const endDate = days[6].date;
  const startMonth = new Date(startDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short' });
  const endMonth = new Date(endDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short' });
  const weekLabel = startMonth === endMonth
    ? `${startMonth} ${days[0].dayNumber} – ${days[6].dayNumber}`
    : `${startMonth} ${days[0].dayNumber} – ${endMonth} ${days[6].dayNumber}`;

  return {
    weekLabel,
    startDate,
    endDate,
    days,
    completedCount,
  };
}

// ─── System-Wide Leaderboard Types & Logic ────────────────────────────────────

export interface MenteeCandidate {
  _id: any;
  name: string;
  standard?: string;
  makid?: string;
  userId?: string;
  status?: string;
  deletedAt?: Date | null;
  preferences?: { optOutLeaderboard?: boolean };
  goals?: { careerGoal?: string; semesterGoal?: string };
}

export interface UserCandidate {
  _id: any;
  role: string;
  status: string;
  deletedAt?: Date | null;
}

export function filterEligibleMentees<T extends MenteeCandidate>(
  mentees: T[],
  users: UserCandidate[],
): T[] {
  const userMap = new Map<string, UserCandidate>();
  for (const u of users) {
    userMap.set(String(u._id), u);
  }

  const seenMenteeIds = new Set<string>();
  const seenUserIds = new Set<string>();
  const eligible: T[] = [];

  for (const m of mentees) {
    const menteeId = String(m._id);
    if (seenMenteeIds.has(menteeId)) continue;
    if (m.status !== 'active') continue;
    if (m.deletedAt) continue;

    if (m.userId) {
      const uId = String(m.userId);
      if (seenUserIds.has(uId)) continue;

      const user = userMap.get(uId);
      if (user) {
        if (user.role === 'ADMIN' || user.role === 'MENTOR') continue;
        if (user.status === 'disabled' || user.deletedAt) continue;
      }
      seenUserIds.add(uId);
    }

    seenMenteeIds.add(menteeId);
    eligible.push(m);
  }

  return eligible;
}

export function getIsoWeekBoundaries(
  todayStr: string,
  weekOffset = 0,
): { startDate: string; endDate: string; weekLabel: string } {
  const today = new Date(todayStr + 'T12:00:00Z');
  const dayOfWeek = today.getUTCDay();
  // Monday is 1, Sunday is 0
  const diffToMonday = (dayOfWeek + 6) % 7;
  const targetMonday = new Date(today);
  targetMonday.setUTCDate(today.getUTCDate() - diffToMonday + weekOffset * 7);

  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);

  const startDate = targetMonday.toISOString().split('T')[0];
  const endDate = targetSunday.toISOString().split('T')[0];

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startMonth = monthNames[targetMonday.getUTCMonth()];
  const startDay = targetMonday.getUTCDate();
  const endMonth = monthNames[targetSunday.getUTCMonth()];
  const endDay = targetSunday.getUTCDate();

  const labelSuffix =
    startMonth === endMonth
      ? `${startMonth} ${startDay} – ${endDay}`
      : `${startMonth} ${startDay} – ${endMonth} ${endDay}`;

  const weekLabel = weekOffset === 0 ? `This Week (${labelSuffix})` : `Week of ${labelSuffix}`;

  return { startDate, endDate, weekLabel };
}

export function getCalendarMonthBoundaries(
  referenceDateStr: string,
  monthOffset = 0,
): { startDate: string; endDate: string; monthLabel: string; monthYear: string } {
  const parts = referenceDateStr.split('-');
  const refYear = parseInt(parts[0], 10) || new Date().getFullYear();
  const refMonth = (parseInt(parts[1], 10) || new Date().getMonth() + 1) - 1;

  const targetDate = new Date(Date.UTC(refYear, refMonth + monthOffset, 1));
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthName = monthNames[month];
  const monthYear = `${monthName} ${year}`;

  const startMonthStr = String(month + 1).padStart(2, '0');
  const startDate = `${year}-${startMonthStr}-01`;

  const lastDayDate = new Date(Date.UTC(year, month + 1, 0));
  const endDay = String(lastDayDate.getUTCDate()).padStart(2, '0');
  const endDate = `${year}-${startMonthStr}-${endDay}`;

  const monthLabel = monthOffset === 0 ? `This Month (${monthYear})` : monthYear;

  return { startDate, endDate, monthLabel, monthYear };
}

export function calculateWeeklyLeaderboardScore(weeklyUniqueDates: string[]): {
  weeklyPoints: number;
  weeklySubmissions: number;
  hasConsistencyBonus: boolean;
} {
  const weeklySubmissions = weeklyUniqueDates.length;
  const hasConsistencyBonus = weeklySubmissions >= 5;
  const weeklyPoints =
    weeklySubmissions * XP_RULES.PER_CHECKIN +
    (hasConsistencyBonus ? XP_RULES.WEEKLY_CONSISTENCY_BONUS : 0);

  return {
    weeklyPoints,
    weeklySubmissions,
    hasConsistencyBonus,
  };
}

export function calculateMonthlyLeaderboardScore(monthlyUniqueDates: string[]): {
  monthlyPoints: number;
  monthlySubmissions: number;
  weeklyMilestonesEarned: number;
} {
  const monthlySubmissions = monthlyUniqueDates.length;
  const weekMap = new Map<string, number>();
  for (const date of monthlyUniqueDates) {
    const weekKey = getWeekKey(date);
    weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
  }

  let weeklyMilestonesEarned = 0;
  for (const count of weekMap.values()) {
    if (count >= 5) {
      weeklyMilestonesEarned++;
    }
  }

  const monthlyPoints =
    monthlySubmissions * XP_RULES.PER_CHECKIN +
    weeklyMilestonesEarned * XP_RULES.WEEKLY_CONSISTENCY_BONUS;

  return {
    monthlyPoints,
    monthlySubmissions,
    weeklyMilestonesEarned,
  };
}

export interface HistoricalPeriodOption {
  type: 'weekly' | 'monthly';
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  offset: number;
}

export function getAvailableHistoricalPeriods(
  todayStr: string,
  earliestDateStr?: string,
): { weekly: HistoricalPeriodOption[]; monthly: HistoricalPeriodOption[] } {
  const weekly: HistoricalPeriodOption[] = [];
  for (let offset = -1; offset >= -12; offset--) {
    const bounds = getIsoWeekBoundaries(todayStr, offset);
    if (earliestDateStr && bounds.endDate < earliestDateStr && weekly.length >= 2) {
      break;
    }
    const label = bounds.weekLabel.replace(/^Week of /, '');
    weekly.push({
      type: 'weekly',
      key: `${bounds.startDate}_${bounds.endDate}`,
      label,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      offset,
    });
  }

  const monthly: HistoricalPeriodOption[] = [];
  for (let offset = -1; offset >= -12; offset--) {
    const bounds = getCalendarMonthBoundaries(todayStr, offset);
    if (earliestDateStr && bounds.endDate < earliestDateStr && monthly.length >= 2) {
      break;
    }
    monthly.push({
      type: 'monthly',
      key: `${bounds.startDate.slice(0, 7)}`,
      label: bounds.monthYear,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      offset,
    });
  }

  return { weekly, monthly };
}

export async function getHistoricalPeriodsSummary(timezone = 'Asia/Kolkata') {
  const todayStr = getLocalTodayString(timezone);
  const earliestRecord = await DailyPerformance.findOne({}, { date: 1 })
    .sort({ date: 1 })
    .lean();
  const earliestDateStr = earliestRecord?.date;
  return getAvailableHistoricalPeriods(todayStr, earliestDateStr);
}

export interface RawLeaderboardEntry {
  menteeId: string;
  name: string;
  isMe: boolean;
  currentStreak: number;
  weeklyPoints: number;
  weeklySubmissions: number;
  monthlyPoints?: number;
  monthlySubmissions?: number;
  totalSubmissions: number;
  totalXp: number;
  isAnonymous?: boolean;
}

export interface LeaderboardEntry extends RawLeaderboardEntry {
  rank: number;
  isTopThree: boolean;
}

export function rankLeaderboardEntries(
  entries: RawLeaderboardEntry[],
  period: 'weekly' | 'monthly' | 'alltime' = 'weekly',
): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (period === 'weekly') {
      if (b.weeklyPoints !== a.weeklyPoints) return b.weeklyPoints - a.weeklyPoints;
      if (b.weeklySubmissions !== a.weeklySubmissions) return b.weeklySubmissions - a.weeklySubmissions;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      return a.name.localeCompare(b.name);
    } else if (period === 'monthly') {
      const bPts = b.monthlyPoints ?? 0;
      const aPts = a.monthlyPoints ?? 0;
      if (bPts !== aPts) return bPts - aPts;
      const bSubs = b.monthlySubmissions ?? 0;
      const aSubs = a.monthlySubmissions ?? 0;
      if (bSubs !== aSubs) return bSubs - aSubs;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      return a.name.localeCompare(b.name);
    } else {
      if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      if (b.totalSubmissions !== a.totalSubmissions) return b.totalSubmissions - a.totalSubmissions;
      return a.name.localeCompare(b.name);
    }
  });

  let currentRank = 1;
  const ranked: LeaderboardEntry[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      let isTie = false;
      if (period === 'weekly') {
        isTie =
          prev.weeklyPoints === curr.weeklyPoints &&
          prev.weeklySubmissions === curr.weeklySubmissions &&
          prev.currentStreak === curr.currentStreak;
      } else if (period === 'monthly') {
        isTie =
          (prev.monthlyPoints ?? 0) === (curr.monthlyPoints ?? 0) &&
          (prev.monthlySubmissions ?? 0) === (curr.monthlySubmissions ?? 0) &&
          prev.currentStreak === curr.currentStreak;
      } else {
        isTie =
          prev.totalXp === curr.totalXp &&
          prev.currentStreak === curr.currentStreak &&
          prev.totalSubmissions === curr.totalSubmissions;
      }

      if (!isTie) {
        currentRank = i + 1;
      }
    }

    ranked.push({
      ...sorted[i],
      rank: currentRank,
      isTopThree: currentRank <= 3,
    });
  }

  return ranked;
}

export interface SystemLeaderboard {
  period: {
    type: 'weekly' | 'monthly' | 'alltime';
    label: string;
    startDate: string;
    endDate: string;
    timezone: string;
    isHistorical?: boolean;
    isFinalized?: boolean;
    weekOffset?: number;
    monthOffset?: number;
  };
  myRank: number;
  myWeeklyPoints: number;
  myMonthlyPoints?: number;
  myLifetimeXp: number;
  totalEligibleMentees: number;
  entries: LeaderboardEntry[];
  topThree: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
  optedOut: boolean;
  hasData?: boolean;
  scoringRules: Array<{ rule: string; points: string; description: string }>;
}

export async function getSystemLeaderboard(
  viewerMenteeId: string,
  options: {
    period?: 'weekly' | 'monthly' | 'alltime';
    weekOffset?: number;
    monthOffset?: number;
    timezone?: string;
  } = {},
): Promise<SystemLeaderboard> {
  const period = options.period || 'weekly';
  const timezone = options.timezone || 'Asia/Kolkata';
  const weekOffset = options.weekOffset || 0;
  const monthOffset = options.monthOffset || 0;
  const todayStr = getLocalTodayString(timezone);

  const isHistorical =
    (period === 'weekly' && weekOffset < 0) ||
    (period === 'monthly' && monthOffset < 0);

  let startDate = '';
  let endDate = '';
  let periodLabel = '';
  let periodKey = '';

  if (period === 'weekly') {
    const boundaries = getIsoWeekBoundaries(todayStr, weekOffset);
    startDate = boundaries.startDate;
    endDate = boundaries.endDate;
    periodLabel = weekOffset === 0 ? boundaries.weekLabel : boundaries.weekLabel.replace(/^Week of /, 'Week: ');
    periodKey = `${startDate}_${endDate}`;
  } else if (period === 'monthly') {
    const boundaries = getCalendarMonthBoundaries(todayStr, monthOffset);
    startDate = boundaries.startDate;
    endDate = boundaries.endDate;
    periodLabel = monthOffset === 0 ? boundaries.monthLabel : boundaries.monthYear;
    periodKey = startDate.slice(0, 7);
  } else {
    startDate = '2026-01-01';
    endDate = todayStr;
    periodLabel = 'All-Time XP Rankings';
    periodKey = 'alltime';
  }

  // Check if historical finalized snapshot exists in DB
  if (isHistorical && (period === 'weekly' || period === 'monthly')) {
    const existingSnapshot = await LeaderboardSnapshot.findOne({
      periodType: period,
      periodKey,
    }).lean();

    if (existingSnapshot) {
      const viewerMentee = await Mentee.findById(viewerMenteeId, { preferences: 1 }).lean();
      const viewerOptedOut = Boolean(viewerMentee?.preferences?.optOutLeaderboard);

      const ranked: LeaderboardEntry[] = existingSnapshot.entries.map((entry) => {
        const isMe = entry.menteeId === viewerMenteeId;
        let displayName = entry.name;
        if (entry.isAnonymous) {
          displayName = isMe ? `${entry.name} (Private)` : 'Anonymous Learner';
        }
        return {
          menteeId: entry.menteeId,
          name: displayName,
          isMe,
          currentStreak: entry.streak,
          weeklyPoints: period === 'weekly' ? entry.points : 0,
          weeklySubmissions: period === 'weekly' ? entry.checkInDays : 0,
          monthlyPoints: period === 'monthly' ? entry.points : 0,
          monthlySubmissions: period === 'monthly' ? entry.checkInDays : 0,
          totalSubmissions: entry.checkInDays,
          totalXp: entry.totalXp,
          rank: entry.rank,
          isTopThree: entry.isTopThree,
          isAnonymous: entry.isAnonymous,
        };
      });

      const myEntry = ranked.find((e) => e.isMe) || null;
      const topThree = ranked.slice(0, 3);
      const hasData = existingSnapshot.totalSubmissions > 0;

      const scoringRules = [
        {
          rule: 'Daily Check-in',
          points: '+10 pts',
          description: `Awarded for each verified daily performance submission during ${periodLabel}.`,
        },
        {
          rule: 'Consistency Milestone',
          points: '+50 pts',
          description: 'Awarded for maintaining 5+ daily check-ins during qualifying calendar weeks.',
        },
        {
          rule: 'Habit Streak',
          points: 'Bonus Multiplier',
          description: 'Preserved streaks broke ties and scaled final rankings.',
        },
      ];

      return {
        period: {
          type: period,
          label: periodLabel,
          startDate,
          endDate,
          timezone,
          isHistorical: true,
          isFinalized: true,
          weekOffset: period === 'weekly' ? weekOffset : undefined,
          monthOffset: period === 'monthly' ? monthOffset : undefined,
        },
        myRank: myEntry?.rank ?? 0,
        myWeeklyPoints: myEntry?.weeklyPoints ?? 0,
        myMonthlyPoints: myEntry?.monthlyPoints ?? 0,
        myLifetimeXp: myEntry?.totalXp ?? 0,
        totalEligibleMentees: ranked.length,
        entries: ranked,
        topThree,
        myEntry,
        optedOut: viewerOptedOut,
        hasData,
        scoringRules,
      };
    }
  }

  // Live calculation (and on-demand finalization for completed past periods without snapshot)
  const rawMentees = await Mentee.find(
    { status: 'active' },
    { name: 1, userId: 1, standard: 1, makid: 1, preferences: 1, goals: 1 },
  ).lean();

  const userIds = rawMentees.map((m) => m.userId).filter(Boolean);
  const rawUsers = await User.find(
    { _id: { $in: userIds } },
    { role: 1, status: 1 },
  ).lean();

  const eligibleMentees = filterEligibleMentees(rawMentees, rawUsers);
  const eligibleIds = eligibleMentees.map((m) => String(m._id));

  const performances = await DailyPerformance.find(
    { menteeId: { $in: eligibleIds } },
    { menteeId: 1, date: 1 },
  ).lean();

  const menteeDatesMap = new Map<string, string[]>();
  for (const p of performances) {
    const list = menteeDatesMap.get(p.menteeId) || [];
    list.push(p.date);
    menteeDatesMap.set(p.menteeId, list);
  }

  const viewerMenteeDoc = eligibleMentees.find((m) => String(m._id) === viewerMenteeId);
  const viewerOptedOut = Boolean(viewerMenteeDoc?.preferences?.optOutLeaderboard);

  let totalPeriodSubmissions = 0;

  const rawEntries: RawLeaderboardEntry[] = eligibleMentees.map((m) => {
    const pId = String(m._id);
    const isMe = pId === viewerMenteeId;
    const allDates = [...new Set(menteeDatesMap.get(pId) || [])].sort();
    const periodDates = allDates.filter((d) => d >= startDate && d <= endDate);

    totalPeriodSubmissions += periodDates.length;

    const { weeklyPoints, weeklySubmissions } = calculateWeeklyLeaderboardScore(
      period === 'weekly' ? periodDates : allDates.filter((d) => {
        const wb = getIsoWeekBoundaries(todayStr, 0);
        return d >= wb.startDate && d <= wb.endDate;
      }),
    );

    const { monthlyPoints, monthlySubmissions } = calculateMonthlyLeaderboardScore(
      period === 'monthly' ? periodDates : allDates.filter((d) => {
        const mb = getCalendarMonthBoundaries(todayStr, 0);
        return d >= mb.startDate && d <= mb.endDate;
      }),
    );

    const streak = calculateStreaks(allDates, isHistorical ? endDate : todayStr);
    const hasGoal = Boolean(m.goals?.careerGoal || m.goals?.semesterGoal);
    const totalXp = calculateTotalXp({
      submissionCount: allDates.length,
      uniqueSortedDates: allDates,
      bestStreak: streak.bestStreak,
      hasGoalSet: hasGoal,
    });

    const isOptedOut = Boolean(m.preferences?.optOutLeaderboard);
    let displayName = m.name;
    if (isOptedOut) {
      displayName = isMe ? `${m.name} (Private)` : 'Anonymous Learner';
    }

    return {
      menteeId: pId,
      name: displayName,
      isMe,
      currentStreak: streak.currentStreak,
      weeklyPoints,
      weeklySubmissions,
      monthlyPoints,
      monthlySubmissions,
      totalSubmissions: allDates.length,
      totalXp,
      isAnonymous: isOptedOut,
    };
  });

  const ranked = rankLeaderboardEntries(rawEntries, period);
  const myEntry = ranked.find((e) => e.isMe) || null;
  const topThree = ranked.slice(0, 3);
  const hasData = period === 'alltime' ? ranked.some((e) => e.totalXp > 0) : totalPeriodSubmissions > 0;

  // If this was a completed historical period without a saved snapshot, persist it now for permanent stability
  if (isHistorical && (period === 'weekly' || period === 'monthly')) {
    const snapshotEntries = ranked.map((r) => {
      const origMentee = eligibleMentees.find((em) => String(em._id) === r.menteeId);
      return {
        menteeId: r.menteeId,
        name: origMentee?.name || r.name,
        rank: r.rank,
        points: period === 'weekly' ? r.weeklyPoints : (r.monthlyPoints ?? 0),
        checkInDays: period === 'weekly' ? r.weeklySubmissions : (r.monthlySubmissions ?? 0),
        streak: r.currentStreak,
        totalXp: r.totalXp,
        isTopThree: r.isTopThree,
        isAnonymous: Boolean(r.isAnonymous),
      };
    });

    void LeaderboardSnapshot.create({
      periodType: period,
      periodKey,
      label: periodLabel,
      startDate,
      endDate,
      totalEligibleMentees: ranked.length,
      totalSubmissions: totalPeriodSubmissions,
      entries: snapshotEntries,
      finalizedAt: new Date(),
    }).catch((err: any) => {
      if (err?.code !== 11000) {
        console.warn('[Leaderboard] Snapshot persistence notice:', err?.message);
      }
    });
  }

  const scoringRules =
    period === 'monthly'
      ? [
          {
            rule: 'Daily Check-in',
            points: '+10 pts',
            description: 'Awarded for each verified daily performance submission during this calendar month.',
          },
          {
            rule: 'Weekly Consistency Milestone',
            points: '+50 pts each',
            description: 'Awarded for each calendar week in this month where you log 5 or more check-ins.',
          },
          {
            rule: 'Active Habit Streak',
            points: 'Bonus Multiplier',
            description: 'Maintaining consecutive days builds streak XP and breaks ties in rankings.',
          },
        ]
      : period === 'weekly'
        ? [
            {
              rule: 'Daily Check-in',
              points: '+10 pts',
              description: 'Awarded for each verified daily performance submission this week.',
            },
            {
              rule: 'Weekly Consistency Milestone',
              points: '+50 pts',
              description: 'Earned when logging 5 or more days within the Monday–Sunday week.',
            },
            {
              rule: 'Active Habit Streak',
              points: 'Bonus Multiplier',
              description: 'Maintaining consecutive days builds streak XP and unlocks achievements.',
            },
          ]
        : [
            {
              rule: 'Verified Daily Check-ins',
              points: '+10 XP per day',
              description: 'Awarded for every verified daily submission since joining Anfaal.',
            },
            {
              rule: 'Consistency Milestones',
              points: '+50 XP per week',
              description: 'Accumulated for every week completed with 5 or more check-ins.',
            },
            {
              rule: 'Habit Streak Milestones',
              points: 'Up to +250 XP',
              description: 'Unlocked at 3, 7, 14, and 30-day continuous streaks.',
            },
          ];

  return {
    period: {
      type: period,
      label: periodLabel,
      startDate,
      endDate,
      timezone,
      isHistorical: Boolean(isHistorical),
      isFinalized: Boolean(isHistorical),
      weekOffset: period === 'weekly' ? weekOffset : undefined,
      monthOffset: period === 'monthly' ? monthOffset : undefined,
    },
    myRank: myEntry?.rank ?? 0,
    myWeeklyPoints: myEntry?.weeklyPoints ?? 0,
    myMonthlyPoints: myEntry?.monthlyPoints ?? 0,
    myLifetimeXp: myEntry?.totalXp ?? 0,
    totalEligibleMentees: ranked.length,
    entries: ranked,
    topThree,
    myEntry,
    optedOut: viewerOptedOut,
    hasData,
    scoringRules,
  };
}

export async function setMenteeLeaderboardPrivacy(
  menteeId: string,
  optOut: boolean,
): Promise<{ success: boolean; optedOut: boolean }> {
  const mentee = await Mentee.findById(menteeId);
  if (!mentee) {
    throw new Error('Mentee profile not found');
  }

  const preferences = (mentee as any).preferences || {};
  preferences.optOutLeaderboard = Boolean(optOut);
  (mentee as any).preferences = preferences;
  mentee.markModified('preferences');
  await mentee.save();

  return { success: true, optedOut: Boolean(optOut) };
}

// ─── Main Mentee Growth Summary Service ───────────────────────────────────────

export async function getMenteeGrowthSummary(
  menteeId: string,
  options: { weekOffset?: number; timezone?: string } = {},
) {
  const timezone = options.timezone || 'Asia/Kolkata';
  const weekOffset = options.weekOffset || 0;
  const todayStr = getLocalTodayString(timezone);

  // 1. Fetch mentee profile
  const mentee = await Mentee.findById(menteeId).lean();
  if (!mentee) {
    throw new Error('Mentee profile not found');
  }

  // 2. Fetch all daily performance records for this mentee
  const records = await DailyPerformance.find({ menteeId })
    .sort({ date: -1 })
    .lean();

  const recordsMap = new Map(records.map((r) => [r.date, r]));
  const uniqueDates = [...new Set(records.map((r) => r.date))].sort();

  // 3. Today's submission status
  const todayRecord = recordsMap.get(todayStr) || null;
  const todayStatus = {
    submitted: Boolean(todayRecord),
    date: todayStr,
    record: todayRecord
      ? {
          ...todayRecord,
          submittedAt: todayRecord.submittedAt || todayRecord.createdAt,
        }
      : null,
  };

  // 4. Streaks
  const { currentStreak, bestStreak } = calculateStreaks(uniqueDates, todayStr);

  // 5. Weekly calendar
  const weeklyCalendar = buildWeeklyCalendar({
    todayStr,
    weekOffset,
    recordsMap,
  });

  // Calculate days submitted in the CURRENT week (offset 0)
  const currentWeekCalendar = weekOffset === 0
    ? weeklyCalendar
    : buildWeeklyCalendar({ todayStr, weekOffset: 0, recordsMap });
  const daysSubmittedThisWeek = currentWeekCalendar.completedCount;

  // Study minutes in current week
  const studyMinutesThisWeek = currentWeekCalendar.days.reduce(
    (sum, d) => sum + d.studyMinutes,
    0,
  );

  // Total study minutes all-time
  const totalStudyMinutes = records.reduce((sum, r) => sum + (r.studyMinutes || 0), 0);

  // 6. XP and Level
  const hasGoalSet = Boolean(
    mentee.goals?.careerGoal || mentee.goals?.semesterGoal,
  );
  const totalXp = calculateTotalXp({
    submissionCount: records.length,
    uniqueSortedDates: uniqueDates,
    bestStreak,
    hasGoalSet,
  });
  const levelInfo = getLevelInfo(totalXp);

  // 7. Achievement Badges
  const badges = [
    {
      id: 'first_step',
      name: 'First Step',
      icon: '🌟',
      description: 'Recorded your very first daily check-in',
      unlocked: records.length >= 1,
      progress: Math.min(records.length, 1),
      maxProgress: 1,
      category: 'milestone',
    },
    {
      id: 'streak_3',
      name: '3-Day Ignition',
      icon: '🔥',
      description: 'Achieved a 3-day consecutive check-in streak',
      unlocked: bestStreak >= 3,
      progress: Math.min(bestStreak, 3),
      maxProgress: 3,
      category: 'streak',
    },
    {
      id: 'streak_7',
      name: '7-Day Momentum',
      icon: '⚡',
      description: 'Maintained a full 7-day consistency streak',
      unlocked: bestStreak >= 7,
      progress: Math.min(bestStreak, 7),
      maxProgress: 7,
      category: 'streak',
    },
    {
      id: 'weekly_champion',
      name: 'Weekly Champion',
      icon: '🏆',
      description: 'Submitted 5 or more check-ins in a single week',
      unlocked: daysSubmittedThisWeek >= 5 || records.length >= 5,
      progress: Math.min(daysSubmittedThisWeek, 5),
      maxProgress: 5,
      category: 'consistency',
    },
    {
      id: 'streak_14',
      name: 'Two-Week Master',
      icon: '🛡️',
      description: 'Built a 14-day dedicated streak habit',
      unlocked: bestStreak >= 14,
      progress: Math.min(bestStreak, 14),
      maxProgress: 14,
      category: 'streak',
    },
    {
      id: 'study_scholar',
      name: 'Knowledge Seeker',
      icon: '📚',
      description: 'Logged 10+ total hours of focused study',
      unlocked: totalStudyMinutes >= 600,
      progress: Math.min(totalStudyMinutes, 600),
      maxProgress: 600,
      category: 'study',
    },
    {
      id: 'goal_setter',
      name: 'Visionary',
      icon: '🎯',
      description: 'Defined career or semester goals with your mentor',
      unlocked: hasGoalSet,
      progress: hasGoalSet ? 1 : 0,
      maxProgress: 1,
      category: 'growth',
    },
  ];

  // 8. Weekly Challenges
  const weeklyChallenges = [
    {
      id: 'weekly_checkins',
      title: 'Weekly Consistency',
      description: 'Complete 5 daily performance check-ins this week',
      current: daysSubmittedThisWeek,
      target: 5,
      unit: 'days',
      completed: daysSubmittedThisWeek >= 5,
      xpReward: XP_RULES.WEEKLY_CONSISTENCY_BONUS,
      expiresAt: currentWeekCalendar.endDate,
    },
    {
      id: 'study_dedication',
      title: 'Study Dedication',
      description: 'Log 300+ minutes of study time this week',
      current: studyMinutesThisWeek,
      target: 300,
      unit: 'mins',
      completed: studyMinutesThisWeek >= 300,
      xpReward: 30,
      expiresAt: currentWeekCalendar.endDate,
    },
  ];

  // 9. Goals and Academic Progress
  const goalsData = {
    careerGoal: mentee.goals?.careerGoal || '',
    semesterGoal: mentee.goals?.semesterGoal || '',
    shortTermGoals: mentee.goals?.shortTermGoals || [],
    academic: mentee.academic || null,
  };

  // 10. System-Wide Eligible Leaderboard (Admin-Managed Scope)
  const systemLeaderboard = await getSystemLeaderboard(menteeId, {
    period: 'weekly',
    weekOffset,
    timezone,
  });

  const cohortLeaderboard = {
    hasCohort: true,
    mentorName: 'Anfaal Mentorship',
    myRank: systemLeaderboard.myRank,
    totalMentees: systemLeaderboard.totalEligibleMentees,
    entries: systemLeaderboard.entries.map((e) => ({
      rank: e.rank,
      menteeId: e.menteeId,
      name: e.name,
      isMe: e.isMe,
      currentStreak: e.currentStreak,
      totalSubmissions: e.weeklySubmissions,
      totalXp: e.weeklyPoints,
    })),
  };

  // 11. Recent Activity Timeline
  const recentActivities: Array<{
    id: string;
    type: 'checkin' | 'call' | 'badge';
    title: string;
    description: string;
    timestamp: Date | string;
    xpEarned?: number;
  }> = [];

  // Add recent checkins
  records.slice(0, 4).forEach((r) => {
    recentActivities.push({
      id: `checkin_${r._id}`,
      type: 'checkin',
      title: 'Daily Performance Check-in',
      description: `Logged ${r.studyMinutes}m study · Rating: ${r.dayRating}/5`,
      timestamp: r.submittedAt || r.createdAt,
      xpEarned: 10,
    });
  });

  // Add recent mentor calls (if any)
  const recentCalls = await Call.find({ menteeId })
    .sort({ date: -1 })
    .limit(2)
    .lean();

  recentCalls.forEach((c) => {
    recentActivities.push({
      id: `call_${c._id}`,
      type: 'call',
      title: 'Mentorship Call Recorded',
      description: c.summary ? `${c.duration} mins: ${c.summary.slice(0, 60)}...` : `${c.duration} mins mentorship call completed`,
      timestamp: c.uploadedAt || c.date,
    });
  });

  // Sort activities by timestamp descending
  recentActivities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Motivational message based on status
  let motivationalMessage = 'Every daily effort compounds into extraordinary growth.';
  if (!todayStatus.submitted) {
    if (currentStreak > 0) {
      motivationalMessage = `You have an active ${currentStreak}-day streak! Check in today to keep your momentum alive.`;
    } else {
      motivationalMessage = 'Small steps today, meaningful progress tomorrow. Take 2 minutes to log your daily performance.';
    }
  } else {
    if (currentStreak >= 3) {
      motivationalMessage = `Great job! You are on a ${currentStreak}-day roll. Consistency is the secret of champions.`;
    } else {
      motivationalMessage = "Today's check-in complete! Fantastic work showing up for your future.";
    }
  }

  return {
    mentee: {
      id: String(mentee._id),
      name: mentee.name,
      makid: mentee.makid || '',
      standard: mentee.standard,
      location: mentee.location || '',
    },
    todayStatus,
    streak: {
      currentStreak,
      bestStreak,
      daysSubmittedThisWeek,
      motivationalMessage,
    },
    weeklyCalendar,
    xp: levelInfo,
    badges,
    weeklyChallenges,
    goals: goalsData,
    leaderboard: systemLeaderboard,
    cohortLeaderboard,
    recentActivities: recentActivities.slice(0, 5),
  };
}
