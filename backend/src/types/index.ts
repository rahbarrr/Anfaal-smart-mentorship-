export type UserRole = 'ADMIN' | 'MENTOR';

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
  passwordHash: string;
  role: UserRole;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

export interface MentorDocument {
  _id: string;
  userId: string;
  phone?: string;
  bio?: string;
  status: 'active' | 'disabled';
}

export interface MenteeDocument {
  _id: string;
  name: string;
  standard: string;
  contactInformation?: Record<string, unknown>;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export interface MentorshipDocument {
  _id: string;
  mentorId: string;
  menteeId: string;
  assignedAt: Date;
  status: 'active' | 'archived';
}

export interface CallDocument {
  _id: string;
  mentorId: string;
  menteeId: string;
  date: Date;
  duration: number;
  recordingUrl?: string;
  recordingStatus: 'pending' | 'uploaded' | 'processing' | 'failed';
  transcript?: string;
  summary?: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
  mentorNotes?: string;
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  reviewStatus: AiReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}
