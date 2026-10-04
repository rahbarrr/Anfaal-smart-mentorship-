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
  createdAt: Date;
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

