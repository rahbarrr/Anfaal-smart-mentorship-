export type UserRole = 'ADMIN' | 'MENTOR' | 'MENTEE';

export type CallStatus =
  | 'Completed'
  | 'Processing'
  | 'Pending Review'
  | 'Submitted'
  | 'Failed';

export type AiReviewStatus = 'Draft' | 'Pending Review' | 'Approved' | 'Rejected';

export interface UserDocument {
  _id: string;
  name: string;
  email: string;
  makid?: string;
  passwordHash: string;
  role: UserRole;
  status: 'active' | 'disabled';
  menteeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MentorApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface MentorDocument {
  _id: string;
  userId: string;
  phone?: string;
  bio?: string;
  gender?: string;
  expertise?: string;
  availability?: string;
  location?: string;
  preferredSubjects?: string[];
  mentorApprovalStatus?: MentorApprovalStatus;
  status: 'active' | 'disabled';
}

export interface MenteeDocument {
  _id: string;
  name: string;
  standard: string;
  makid?: string;
  contactInformation?: Record<string, unknown>;
  status: 'active' | 'inactive';
  userId?: string;
  location?: string;
  academic?: {
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
  goals?: {
    careerGoal?: string;
    semesterGoal?: string;
    shortTermGoals?: Array<{
      id: string;
      title: string;
      description: string;
      progress: number;
      deadline?: string;
      status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold';
      createdAt?: Date;
      updatedAt?: Date;
    }>;
  };
  routine?: {
    selfStudyHours?: number;
    schedule?: string;
    habits?: string[];
  };
  careerInterests?: {
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
  challenges?: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    status: 'Open' | 'In Progress' | 'Resolved';
    mentorAction: string;
    progress: number;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  notes?: Array<{
    id: string;
    mentorId?: string;
    mentorName: string;
    note: string;
    category?: string;
    createdAt?: Date;
  }>;
  profileProvenance?: Record<
    string,
    {
      method: 'manual' | 'ai_approved';
      updatedBy: string;
      updatedByName?: string;
      updatedAt: Date;
      sourceCallId?: string;
    }
  >;
  lastProfileUpdate?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface DailyPerformanceDocument {
  _id: string;
  menteeId: string;
  date: string; // YYYY-MM-DD format
  studyMinutes: number;
  quran: {
    ruku: number;
    ayat: number;
    pages: number;
  };
  readingMinutes: number;
  dayRating: number; // 1 to 5
  dailyReflection?: string;
  facedDifficulty?: boolean;
  difficultyNote?: string;
  needsMentorHelp?: boolean;
  mentorHelpNote?: string;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MentorshipDocument {
  _id: string;
  mentorId: string;
  menteeId: string;
  assignedAt: Date;
  status: 'active' | 'archived';
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface CallRecordingData {
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url?: string;
}

export interface CallTranscriptionData {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptSegment[];
  provider?: string;
  createdAt?: Date;
}

export interface CallStructuredSummary {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  shortSummary: string;
  keyDiscussionPoints: string[];
  academicProgress?: string;
  personalDevelopment?: string;
  challenges: string[];
  achievements: string[];
  actionItems: string[];
  mentorCommitments: string[];
  menteeCommitments: string[];
  followUpTopics: string[];
  topicsDiscussed: string[];
  generatedAt?: Date;
}

export interface CallSummaryVersion {
  version: number;
  type: 'AI' | 'MENTOR_EDIT' | 'APPROVED';
  content: Record<string, any>;
  timestamp: Date;
  author?: string;
}

export interface CallMentorReview {
  status: 'Draft' | 'Pending Review' | 'Approved' | 'Rejected';
  reviewedAt?: Date;
  reviewedBy?: string;
}

export interface CallDocument {
  _id: string;
  mentorId: string;
  menteeId: string;
  date: Date;
  duration: number;
  recordingUrl?: string;
  recordingStatus: 'pending' | 'uploaded' | 'processing' | 'failed';
  uploadedAt?: Date;
  processingStatus: 'queued' | 'processing' | 'completed' | 'failed';
  recording?: CallRecordingData;
  transcript?: string;
  transcription?: CallTranscriptionData;
  summary?: string;
  aiSummary?: CallStructuredSummary;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
  mentorNotes?: string;
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  reviewStatus: AiReviewStatus;
  mentorReview?: CallMentorReview;
  summaryVersions?: CallSummaryVersion[];
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType =
  | 'MENTEE_DAILY_SUBMITTED'
  | 'MENTOR_REGISTERED'
  | 'MENTOR_APPROVAL_REQUIRED'
  | 'CALL_PROCESSING_COMPLETED'
  | 'CALL_PROCESSING_FAILED'
  | 'CALL_SUMMARY_AVAILABLE'
  | 'MENTOR_ASSIGNED'
  | 'MENTEE_ASSIGNED'
  | 'DAILY_REMINDER'
  | 'SYSTEM_ALERT';

export type NotificationCategory =
  | 'dailyReminders'
  | 'mentorshipActivity'
  | 'callUpdates'
  | 'systemNotifications';

export interface NotificationDocument {
  _id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PushSubscriptionDocument {
  _id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

export interface NotificationPreferenceDocument {
  _id: string;
  userId: string;
  pushEnabled: boolean;
  dailyReminders: boolean;
  mentorshipActivity: boolean;
  callUpdates: boolean;
  systemNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
}


