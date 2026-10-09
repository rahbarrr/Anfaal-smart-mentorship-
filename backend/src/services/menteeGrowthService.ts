import { DailyPerformance } from '../models/DailyPerformance.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Mentor } from '../models/Mentor.js';
import { User } from '../models/User.js';
import { Call } from '../models/Call.js';

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

  // 10. Cohort Leaderboard (Authorized Mentorship Cohort Only)
  let cohortLeaderboard = {
    hasCohort: false,
    mentorName: '',
    myRank: 1,
    totalMentees: 1,
    entries: [] as Array<{
      rank: number;
      menteeId: string;
      name: string;
      isMe: boolean;
      currentStreak: number;
      totalSubmissions: number;
      totalXp: number;
    }>,
  };

  const activeAssignment = await Mentorship.findOne({
    menteeId,
    status: 'active',
  }).lean();

  if (activeAssignment) {
    const mentorProfile = await Mentor.findById(activeAssignment.mentorId).lean();
    let mentorUserName = 'Mentor';
    if (mentorProfile) {
      const mentorUser = await User.findById(mentorProfile.userId).lean();
      if (mentorUser) mentorUserName = mentorUser.name;
    }

    // Find all mentees in the same mentorship cohort
    const cohortAssignments = await Mentorship.find({
      mentorId: activeAssignment.mentorId,
      status: 'active',
    }).lean();

    const peerMenteeIds = cohortAssignments.map((a) => a.menteeId);
    const peerMentees = await Mentee.find(
      { _id: { $in: peerMenteeIds } },
      { name: 1, goals: 1 },
    ).lean();

    // Fetch submissions for all peers to compute real participation rankings
    const peerPerformances = await DailyPerformance.find(
      { menteeId: { $in: peerMenteeIds } },
      { menteeId: 1, date: 1 },
    ).lean();

    const peerDatesMap = new Map<string, string[]>();
    for (const p of peerPerformances) {
      const list = peerDatesMap.get(p.menteeId) || [];
      list.push(p.date);
      peerDatesMap.set(p.menteeId, list);
    }

    const entries = peerMentees.map((peer) => {
      const pId = String(peer._id);
      const dates = [...new Set(peerDatesMap.get(pId) || [])].sort();
      const pStreak = calculateStreaks(dates, todayStr);
      const pHasGoal = Boolean(peer.goals?.careerGoal || peer.goals?.semesterGoal);
      const pXp = calculateTotalXp({
        submissionCount: dates.length,
        uniqueSortedDates: dates,
        bestStreak: pStreak.bestStreak,
        hasGoalSet: pHasGoal,
      });

      return {
        menteeId: pId,
        name: peer.name,
        isMe: pId === menteeId,
        currentStreak: pStreak.currentStreak,
        totalSubmissions: dates.length,
        totalXp: pXp,
      };
    });

    // Sort by totalXp desc, then currentStreak desc, then name asc
    entries.sort((a, b) => {
      if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      return a.name.localeCompare(b.name);
    });

    const rankedEntries = entries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));

    const myEntry = rankedEntries.find((e) => e.isMe);

    cohortLeaderboard = {
      hasCohort: true,
      mentorName: mentorUserName,
      myRank: myEntry?.rank ?? 1,
      totalMentees: rankedEntries.length,
      entries: rankedEntries,
    };
  }

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
    cohortLeaderboard,
    recentActivities: recentActivities.slice(0, 5),
  };
}
