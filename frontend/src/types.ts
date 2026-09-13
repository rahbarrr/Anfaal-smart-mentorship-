export type Role = 'ADMIN' | 'MENTOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
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
