export type Role = 'ADMIN' | 'MENTOR' | 'MENTEE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  menteeId?: string;
}

export interface DailyPerformanceRecord {
  _id?: string;
  id?: string;
  menteeId: string;
  date: string; // YYYY-MM-DD
  studyMinutes: number;
  quran: {
    ruku: number;
    ayat: number;
    pages: number;
  };
  readingMinutes: number;
  dayRating: number; // 1-5
  dailyReflection?: string;
  facedDifficulty?: boolean;
  difficultyNote?: string;
  needsMentorHelp?: boolean;
  mentorHelpNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WeeklyPerformanceSummary {
  startDate: string;
  endDate: string;
  daysSubmitted: number;
  totalStudyMinutes: number;
  totalStudyHoursFormatted: string;
  quran: {
    ruku: number;
    ayat: number;
    pages: number;
  };
  totalReadingMinutes: number;
  averageDayRating: number;
}

export interface PerformanceAnalyticsData {
  study: {
    todayMinutes: number;
    weeklyMinutes: number;
    monthlyMinutes: number;
    averageDailyMinutes: number;
    charts: {
      last7Days: Array<{ date: string; hours: number; minutes: number }>;
      last30Days: Array<{ date: string; hours: number; minutes: number }>;
    };
  };
  quran: {
    totalRuku: number;
    totalAyat: number;
    totalPages: number;
    averageDailyPages: number;
    charts: {
      last7Days: Array<{ date: string; ruku: number; ayat: number; pages: number }>;
    };
  };
  reading: {
    totalMinutes: number;
    weeklyMinutes: number;
    averageDailyMinutes: number;
    charts: {
      last7Days: Array<{ date: string; minutes: number }>;
    };
  };
  overallDay: {
    averageRating: number;
    ratingDistribution: Record<number, number>;
  };
  mentorInsights: string[];
}

export interface AiInsightsResult {
  weeklySummary: string;
  discussionPoints: string[];
}

export interface DashboardCardItem {
  label: string;
  value: string;
  change?: string;
  tone?: 'success' | 'warning' | 'danger' | 'info';
}

export interface Mentee {
  id: string;
  name: string;
  standard: string;
  age: string;
  status: 'Active' | 'At Risk' | 'Paused';
  assignedMentor: string;
  lastCallDate: string;
  totalCalls: number;
  nextFollowUp: string;
}

export interface CallRecord {
  id: string;
  mentee: string;
  date: string;
  duration: string;
  status: 'Completed' | 'Processing' | 'Pending Review' | 'Submitted' | 'Failed';
  summary: string;
  action: string;
}

export interface SummaryResult {
  shortSummary: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
}
