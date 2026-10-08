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
  submittedAt?: string;
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
  makid?: string;
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
  uploadedAt?: string;
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

export type ImportType = 'MENTORS' | 'MENTEES' | 'ASSIGNMENTS';
export type ImportStatus = 'UPLOADED' | 'VALIDATING' | 'READY' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type DuplicateStrategy = 'skip' | 'update' | 'ask';

export interface ImportErrorItem {
  row: number;
  name?: string;
  email?: string;
  error: string;
  warning?: boolean;
}

export interface ParsedRowItem {
  row: number;
  status: 'valid' | 'warning' | 'error';
  data: Record<string, any>;
  message?: string;
  isExisting?: boolean;
}

export interface ImportPreview {
  id: string;
  type: ImportType;
  fileName: string;
  status?: ImportStatus;
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  previewRows: ParsedRowItem[];
  errors: ImportErrorItem[];
  totalErrors?: number;
}

export interface ImportProgress {
  id: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorCount: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ImportHistoryItem {
  id: string;
  type: ImportType;
  fileName: string;
  fileSize: number;
  uploadedBy: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface ShortTermGoal {
  id: string;
  title: string;
  description: string;
  progress: number;
  deadline?: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold';
  createdAt?: string;
  updatedAt?: string;
}

export interface MenteeChallenge {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved';
  mentorAction: string;
  progress: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MentorNote {
  id: string;
  mentorId?: string;
  mentorName: string;
  note: string;
  category?: string;
  createdAt: string;
}

export interface Mentee360Profile {
  id: string;
  name: string;
  standard: string;
  makid: string;
  location: string;
  guardian: string;
  phone: string;
  status: 'active' | 'inactive';
  assignedMentor?: string;
  assignedMentorId?: string;
  createdAt: string;
  lastActivity?: string;
  academic: {
    previousPercentage?: number;
    latestPercentage?: number;
    targetPercentage?: number;
    attendancePercentage?: number;
    academicLevel?: string;
    favouriteSubjects?: string[];
    weakSubjects?: string[];
    currentExam?: string;
    examProgress?: Array<{
      subject: string;
      portionCompleted: number;
      status?: string;
    }>;
  };
  goals: {
    careerGoal?: string;
    semesterGoal?: string;
    shortTermGoals?: ShortTermGoal[];
  };
  routine: {
    selfStudyHours?: number;
    schedule?: string;
    habits?: string[];
  };
  careerInterests: {
    primaryGoal?: string;
    secondaryInterests?: string[];
    otherExplored?: string[];
    hobbies?: string[];
    skills?: string[];
    skillsToDevelop?: string[];
    recommendedCourses?: Array<{
      name: string;
      provider?: string;
      status?: string;
    }>;
  };
  challenges: MenteeChallenge[];
  notes: MentorNote[];
}

