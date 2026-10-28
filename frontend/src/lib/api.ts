// Production API Base URL: loaded from VITE_API_URL or defaults to '/api'
import type { ImportPreview, ShortTermGoal } from '../types';

const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api';
const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');


export type UserRole = 'ADMIN' | 'MENTOR' | 'MENTEE';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  menteeId?: string;
  mentorApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

type AttendanceRecord = { id: string; menteeId: string; date: string; status: 'PRESENT' | 'ABSENT'; source: string; notes?: string };
type AnnouncementRecord = { id: string; title: string; body: string; audience: string; priority?: string; pinned?: boolean; read?: boolean; publishedAt?: { _seconds?: number } | string };
type CallSummaryRecord = { id: string; date: string; summary: { overview: string } };
type ConversationRecord = { id: string; participantIds: string[]; lastMessage?: string; updatedAt?: string };
type ChatContact = { id: string; name: string; email?: string; role: string };
type ChatMessage = { id: string; conversationId?: string; senderId: string; text: string; createdAt?: string };
type ProxyAssignmentRecord = { id: string; menteeId: string; primaryMentorId: string; proxyMentorId: string; startDate: string; endDate: string; reason?: string };
type BinRecord = { type: string; id: string; label: string; deletedAt?: string; deletedBy?: string; deletionReason?: string };
export type AiMentorMessage = { role: 'user' | 'assistant'; content: string; createdAt?: string };
export type AiMentorStatus = { dailyLimit: number; promptsUsedToday: number; promptsRemaining: number };
type GrowthDailyRecord = {
  studyMinutes: number;
  readingMinutes: number;
  dayRating: number;
  mentorCallRating?: number | null;
  mentorCallFeedback?: string | null;
  dailyReflection?: string;
  submittedAt?: string | Date;
  updatedAt?: string | Date;
  quran?: { ruku?: number; ayat?: number; pages?: number };
};

function getToken(): string {
  return localStorage.getItem('anfaal-token') ?? '';
}

export const AUTH_EXPIRED_EVENT = 'anfaal-auth-expired';

export function clearStoredAuth(): void {
  localStorage.removeItem('anfaal-token');
  localStorage.removeItem('anfaal-user');
}

export function notifyUnauthorized(response: Response): void {
  if (response.status === 401) {
    clearStoredAuth();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

// Keep all API calls behind one boundary so expired sessions behave the same
// for dashboards, reports, imports, uploads, and processing status polling.
const nativeFetch = globalThis.fetch.bind(globalThis);
async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await nativeFetch(input, init);
  const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (target.startsWith(API_BASE_URL)) notifyUnauthorized(response);
  return response;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? `Request failed: ${response.status}`);
  }
  return response;
}

// Product features: kept on the regular Render API boundary.
export async function getAttendance(token: string, params: { month?: string } = {}): Promise<{ records: AttendanceRecord[] }> { const q = params.month ? `?month=${encodeURIComponent(params.month)}` : ''; return (await apiFetch(`/attendance${q}`, { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function saveAttendance(token: string, body: unknown): Promise<{ record: AttendanceRecord }> { return (await apiFetch('/attendance', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getAnnouncements(token: string): Promise<{ announcements: AnnouncementRecord[] }> { return (await apiFetch('/announcements', { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function createAnnouncement(token: string, body: unknown): Promise<{ announcement: AnnouncementRecord }> { return (await apiFetch('/announcements', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function markAnnouncementRead(token: string, id: string): Promise<{ success: boolean }> { return (await apiFetch(`/announcements/${id}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getCallSummaryReport(token: string, period: string): Promise<{ totalCalls: number; completedSummaries: number; calls: CallSummaryRecord[] }> { return (await apiFetch(`/calls/summary-report?period=${period}`, { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getConversations(token: string): Promise<{ conversations: ConversationRecord[] }> { return (await apiFetch('/conversations', { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getChatContacts(token: string): Promise<{ contacts: ChatContact[] }> { return (await apiFetch('/chat/contacts', { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function createConversation(token: string, participantIds: string[]): Promise<{ conversation: ConversationRecord }> { return (await apiFetch('/conversations', { method: 'POST', body: JSON.stringify({ participantIds }), headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getConversationMessages(token: string, id: string): Promise<{ messages: ChatMessage[] }> { return (await apiFetch(`/conversations/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function sendConversationMessage(token: string, id: string, text: string): Promise<{ message: ChatMessage }> { return (await apiFetch(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }), headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getProxyAssignments(token: string): Promise<{ assignments: ProxyAssignmentRecord[] }> { return (await apiFetch('/admin/proxy-assignments', { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function createProxyAssignment(token: string, body: unknown): Promise<{ assignment: ProxyAssignmentRecord }> { return (await apiFetch('/admin/proxy-assignments', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getBin(token: string): Promise<{ items: BinRecord[] }> { return (await apiFetch('/admin/bin', { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function restoreBinItem(token: string, type: string, id: string): Promise<{ record: Record<string, unknown> }> { return (await apiFetch(`/admin/bin/${encodeURIComponent(type)}/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getAiMentorStatus(token: string): Promise<AiMentorStatus> { return (await apiFetch('/ai-mentor/status', { headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function sendAiMentorMessage(token: string, message: string, sessionId?: string): Promise<{ sessionId: string; message: AiMentorMessage; dailyLimit?: number; promptsUsedToday?: number; promptsRemaining?: number }> { return (await apiFetch('/ai-mentor/chat', { method: 'POST', body: JSON.stringify({ message, sessionId }), headers: { Authorization: `Bearer ${token}` } })).json(); }
export async function getAiMentorSession(token: string, sessionId: string): Promise<{ messages: AiMentorMessage[] }> { return (await apiFetch(`/ai-mentor/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } })).json(); }

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function loginWithEmail(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? 'Unable to sign in.');
  }
  return response.json();
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export async function getDashboardSummary(token: string) {
  const response = await fetch(`${API_BASE_URL}/admin/dashboard-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load dashboard summary');
  return response.json();
}

export async function getAnalyticsSummary(token: string) {
  const response = await fetch(`${API_BASE_URL}/admin/analytics-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load analytics summary');
  return response.json();
}

export async function getMentorshipSummary(token: string) {
  const response = await fetch(`${API_BASE_URL}/admin/mentorship-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load mentorship summary');
  return response.json();
}

// ─── Admin Assignments ────────────────────────────────────────────────────────

export async function getAssignments(token: string) {
  const response = await fetch(`${API_BASE_URL}/admin/assignments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load assignments');
  return response.json();
}

export async function createAssignment(token: string, payload: { mentorId: string; menteeId: string; status?: 'active' | 'archived' }) {
  const response = await fetch(`${API_BASE_URL}/admin/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to create assignment');
  }
  return response.json();
}

export async function updateAssignmentStatus(token: string, assignmentId: string, status: 'active' | 'archived') {
  const response = await fetch(`${API_BASE_URL}/admin/assignments/${assignmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update assignment');
  }
  return response.json();
}

export async function deleteAssignment(token: string, assignmentId: string) {
  const response = await fetch(`${API_BASE_URL}/admin/assignments/${assignmentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete assignment');
  }
  return response.json();
}

// ─── Calls ────────────────────────────────────────────────────────────────────

export async function getMentorCalls(token: string, options: { limit?: number; cursor?: string } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(options.limit ?? 100, 1), 100)));
  if (options.cursor) params.set('cursor', options.cursor);
  const response = await fetch(`${API_BASE_URL}/calls?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load call data');
  return response.json();
}

export async function getPresignedUploadUrl(
  token: string,
  payload: { fileName: string; fileSize: number; mimeType: string; menteeId: string },
): Promise<{
  callId: string;
  uploadUrl: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresIn: number;
}> {
  const response = await fetch(`${API_BASE_URL}/calls/presign-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const validationDetails = Array.isArray(errorPayload.errors)
      ? errorPayload.errors
          .map((issue: { path?: (string | number)[]; message?: string }) => {
            const field = issue.path?.join('.') ?? '';
            return field && issue.message ? `${field}: ${issue.message}` : issue.message;
          })
          .filter(Boolean)
          .join(' ')
      : '';
    throw new Error(
      [errorPayload.message ?? 'Unable to obtain presigned upload URL', validationDetails]
        .filter(Boolean)
        .join(' '),
    );
  }
  return response.json();
}

export function uploadFileDirectToS3(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.timeout = 12 * 60 * 1000;
    xhr.setRequestHeader('Content-Type', mimeType || file.type || 'application/octet-stream');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Direct S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Unable to upload the recording. Please check your internet connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The recording upload timed out. Please check your connection and try again.'));
    xhr.onabort = () => reject(new Error('The recording upload was interrupted. Please try again.'));

    xhr.send(file);
  });
}

export async function completeCallUpload(
  token: string,
  payload: {
    callId?: string;
    storageKey?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    menteeId: string;
    duration: number;
    date?: string;
    mentorNotes?: string;
  },
): Promise<{ callId: string; jobId: string; message: string; status: string }> {
  const response = await fetch(`${API_BASE_URL}/calls/complete-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const error = new Error(errorPayload.message ?? 'Unable to complete call session upload') as Error & {
      callId?: string;
      recordingUploaded?: boolean;
      processingStatus?: string;
    };
    error.callId = errorPayload.callId;
    error.recordingUploaded = errorPayload.recordingUploaded;
    error.processingStatus = errorPayload.processingStatus;
    throw error;
  }
  return response.json();
}

export async function getCallAudioUrl(token: string, callId: string): Promise<{ audioUrl: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}/audio-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to load playback audio URL');
  }
  return response.json();
}

export async function deleteCall(token: string, callId: string): Promise<{ message: string; storageDeleted?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/admin/calls/${callId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete call record.');
  }
  return response.json();
}

export async function deleteCallRecording(token: string, callId: string): Promise<{ message: string; storageDeleted?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/admin/calls/${callId}/recording`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete call recording.');
  }
  return response.json();
}

export async function deleteCallSummary(token: string, callId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/calls/${callId}/summary`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete call summary.');
  }
  return response.json();
}

export async function deleteCallIntelligence(token: string, callId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/calls/${callId}/intelligence`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete call intelligence.');
  }
  return response.json();
}

export async function bulkDeleteCalls(token: string, ids: string[]): Promise<{ message: string; deletedCount: number; deletedIds: string[]; failedIds?: string[] }> {
  const response = await fetch(`${API_BASE_URL}/admin/calls/bulk-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to bulk delete calls.');
  }
  return response.json();
}

export async function retryCallProcessing(token: string, callId: string): Promise<{ message: string; jobId: string }> {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to retry processing');
  }
  return response.json();
}

export async function uploadCall(
  token: string,
  payload: { callId?: string; menteeId: string; duration: number; date?: string; mentorNotes?: string },
  file?: File | null,
) {
  const rawUser = localStorage.getItem('anfaal-user');
  const user = rawUser ? JSON.parse(rawUser) : null;

  const formData = new FormData();
  if (payload.callId) formData.append('callId', payload.callId);
  formData.append('mentorId', user?.id ?? '');
  formData.append('menteeId', payload.menteeId);
  formData.append('duration', String(payload.duration));
  if (payload.date) formData.append('date', payload.date);
  if (payload.mentorNotes) formData.append('mentorNotes', payload.mentorNotes);
  if (file) formData.append('recording', file, file.name);

  const response = await fetch(`${API_BASE_URL}/calls/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const payloadError = await response.json().catch(() => ({}));
    const error = new Error(payloadError.message ?? 'Unable to upload call') as Error & {
      callId?: string;
      recordingUploaded?: boolean;
      processingStatus?: string;
    };
    error.callId = payloadError.callId;
    error.recordingUploaded = payloadError.recordingUploaded;
    error.processingStatus = payloadError.processingStatus;
    throw error;
  }
  return response.json();
}

export async function updateCallSummary(token: string, callId: string, payload: Partial<{
  summary: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
  aiSummary?: { summaryPoints?: string[] };
}>) {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update call');
  }
  return response.json();
}

export async function getCallDetail(token: string, callId: string) {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}?_t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load call detail');
  return response.json();
}

export async function getCallJobStatus(token: string, callId: string) {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}/status?_t=${Date.now()}`, {
    // Force a fresh network request every time — never use a cached 304
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const err = new Error(payload.message ?? `Job status request failed: ${response.status}`) as Error & { status: number };
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export async function getCallTranscript(token: string, callId: string) {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}/transcript?_t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load transcript');
  return response.json();
}

export async function approveCallSummary(token: string, callId: string, editedSummary?: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ summary: editedSummary }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to approve summary');
  }
  return response.json();
}

// ─── Mentors ──────────────────────────────────────────────────────────────────

export async function getMentors(token: string) {
  const response = await fetch(`${API_BASE_URL}/mentors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load mentors');
  return response.json();
}

export async function submitMentorRegistration(payload: {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  gender?: string;
  bio?: string;
  expertise?: string;
  availability?: string;
  location?: string;
  preferredSubjects?: string[];
}) {
  const response = await fetch(`${API_BASE_URL}/mentors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to submit mentor registration');
  }
  return response.json();
}

export async function createMentor(token: string, payload: { name: string; email: string; password?: string; phone?: string; bio?: string }) {
  const response = await fetch(`${API_BASE_URL}/mentors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to create mentor');
  }
  return response.json();
}

export async function updateMentorApprovalStatus(token: string, mentorId: string, approvalStatus: 'APPROVED' | 'REJECTED') {
  const response = await fetch(`${API_BASE_URL}/mentors/${mentorId}/approval`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ approvalStatus }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update mentor approval status');
  }
  return response.json();
}

export async function updateMentorStatus(token: string, mentorId: string, status: 'active' | 'disabled') {
  const response = await fetch(`${API_BASE_URL}/mentors/${mentorId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update mentor status');
  }
  return response.json();
}

export async function deleteMentor(token: string, mentorId: string) {
  const response = await fetch(`${API_BASE_URL}/mentors/${mentorId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete mentor');
  }
  return response.json().catch(() => ({ message: 'Deleted' }));
}

// ─── Mentees ──────────────────────────────────────────────────────────────────

export async function getMentees(
  token: string,
  options?: { page?: number; limit?: number; search?: string; status?: string },
) {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.search) params.set('search', options.search);
  if (options?.status) params.set('status', options.status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/mentees${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load mentees');
  return response.json();
}

export async function getMyMentees(token: string) {
  const response = await fetch(`${API_BASE_URL}/mentees/my`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load assigned mentees');
  return response.json();
}

export async function getMenteeProfile(token: string, menteeId: string, limit = 100) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}?limit=${Math.min(Math.max(limit, 1), 100)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load mentee profile');
  return response.json();
}

export async function createMentee(token: string, payload: { name: string; standard: string; phone?: string; guardian?: string }) {
  const response = await fetch(`${API_BASE_URL}/mentees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to create mentee');
  }
  return response.json();
}

export async function updateMentee(token: string, menteeId: string, payload: { name?: string; standard?: string; phone?: string; guardian?: string; status?: 'active' | 'inactive' }) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update mentee');
  }
  return response.json();
}

export async function deleteMentee(token: string, menteeId: string) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete mentee');
  }
  return response.json().catch(() => ({ message: 'Deleted' }));
}

export async function updateMentee360(token: string, menteeId: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}/360`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update 360 profile');
  }
  return response.json();
}

export async function addMenteeNote(token: string, menteeId: string, payload: { note: string; category?: string }) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to add mentor note');
  }
  return response.json();
}

export async function deleteMenteeNote(token: string, menteeId: string, noteId: string) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}/notes/${noteId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete note');
  }
  return response.json();
}

export async function fetchMenteeSuggestions(token: string, menteeId: string, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}/suggestions${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to fetch profile suggestions');
  }
  return response.json();
}

export async function reviewMenteeSuggestion(
  token: string,
  menteeId: string,
  suggestionId: string,
  action: 'approve' | 'edit' | 'reject',
  editedValue?: unknown,
) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}/suggestions/${suggestionId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, editedValue }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to review suggestion');
  }
  return response.json();
}

export async function bulkReviewMenteeSuggestions(
  token: string,
  menteeId: string,
  action: 'approve' | 'reject',
  suggestionIds: string[],
) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}/suggestions/bulk-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, suggestionIds }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to bulk review suggestions');
  }
  return response.json();
}

export async function extractProfileFromCall(token: string, callId: string) {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}/extract-profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to extract profile from call');
  }
  return response.json();
}

// ─── Admin Review ─────────────────────────────────────────────────────────────

export async function getReviewQueue(token: string) {
  const response = await fetch(`${API_BASE_URL}/admin/calls/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load review queue');
  return response.json();
}

export async function updateCallReview(token: string, callId: string, reviewStatus: 'Pending Review' | 'Approved' | 'Rejected') {
  const response = await fetch(`${API_BASE_URL}/admin/calls/${callId}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reviewStatus }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? 'Unable to update review');
  }
  return response.json();
}

export async function getRecordingUrl(token: string, callId: string) {
  const response = await fetch(`${API_BASE_URL}/admin/calls/${callId}/recording-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load recording');
  return response.json();
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function buildReportUrl(_token: string, filters: {
  from?: string;
  to?: string;
  mentorId?: string;
  menteeId?: string;
  standard?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.mentorId) params.set('mentorId', filters.mentorId);
  if (filters.menteeId) params.set('menteeId', filters.menteeId);
  if (filters.standard) params.set('standard', filters.standard);
  if (filters.status) params.set('status', filters.status);
  return `${API_BASE_URL}/admin/reports/calls?${params.toString()}`;
}

export async function exportCallsReport(token: string, filters: {
  from?: string; to?: string; mentorId?: string; menteeId?: string; standard?: string; status?: string;
}): Promise<void> {
  const url = buildReportUrl(token, filters);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Unable to generate report');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `anfaal-calls-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

// ─── Daily Performance ─────────────────────────────────────────────────────────

export async function submitDailyPerformance(payload: {
  date: string;
  studyMinutes: number;
  quran?: { ruku?: number; ayat?: number; pages?: number };
  readingMinutes: number;
  dayRating: number;
  dailyReflection?: string;
  facedDifficulty?: boolean;
  difficultyNote?: string;
  needsMentorHelp?: boolean;
  mentorHelpNote?: string;
  menteeId?: string;
}) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/daily-performance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(resData.message ?? 'Unable to record daily performance');
    Object.assign(err, { status: response.status, existingId: resData.existingId, existing: resData.existing });
    throw err;
  }
  return resData;
}

export async function getTodayPerformance(date?: string) {
  const token = getToken();
  const query = date ? `?date=${date}` : '';
  const response = await fetch(`${API_BASE_URL}/daily-performance/today${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load today performance');
  return response.json();
}

export async function getPerformanceHistory(params?: { from?: string; to?: string; limit?: number; skip?: number; menteeId?: string }) {
  const token = getToken();
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.skip) searchParams.set('skip', String(params.skip));
  if (params?.menteeId) searchParams.set('menteeId', params.menteeId);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/daily-performance/history${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load performance history');
  return response.json();
}

export async function getWeeklyPerformance(menteeId?: string) {
  const token = getToken();
  const query = menteeId ? `?menteeId=${menteeId}` : '';
  const response = await fetch(`${API_BASE_URL}/daily-performance/weekly${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load weekly performance');
  return response.json();
}

export async function getMonthlyPerformance(menteeId?: string) {
  const token = getToken();
  const query = menteeId ? `?menteeId=${menteeId}` : '';
  const response = await fetch(`${API_BASE_URL}/daily-performance/monthly${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load monthly performance');
  return response.json();
}

export async function updateDailyPerformance(id: string, payload: unknown) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/daily-performance/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to update performance');
  }
  return response.json();
}

export async function getAdminDailyPerformance(params?: {
  menteeId?: string;
  mentorId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
  skip?: number;
}) {
  const token = getToken();
  const searchParams = new URLSearchParams();
  if (params?.menteeId) searchParams.set('menteeId', params.menteeId);
  if (params?.mentorId) searchParams.set('mentorId', params.mentorId);
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.skip) searchParams.set('skip', String(params.skip));

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/admin/daily-performance${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load daily performance records.');
  return response.json();
}

export async function deleteDailyPerformance(token: string, id: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/daily-performance/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete daily performance entry.');
  }
  return response.json();
}

export async function bulkDeleteDailyPerformance(token: string, ids: string[]): Promise<{ message: string; deletedCount: number; deletedIds: string[] }> {
  const response = await fetch(`${API_BASE_URL}/admin/daily-performance/bulk-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to bulk delete daily performance entries.');
  }
  return response.json();
}

export async function getMenteePerformance(menteeId: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/daily-performance/mentor-view/${menteeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load mentee performance');
  return response.json();
}

export async function getMenteePerformanceAnalytics(menteeId: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/daily-performance/mentor-view/${menteeId}/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load performance analytics');
  return response.json();
}

export async function getMenteeAiInsights(menteeId: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/daily-performance/mentor-view/${menteeId}/ai-insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to generate AI insights');
  }
  return response.json();
}

export async function getAdminPerformanceAnalytics(filters?: {
  mentorId?: string;
  menteeId?: string;
  standard?: string;
  from?: string;
  to?: string;
}) {
  const token = getToken();
  const params = new URLSearchParams();
  if (filters?.mentorId) params.set('mentorId', filters.mentorId);
  if (filters?.menteeId) params.set('menteeId', filters.menteeId);
  if (filters?.standard) params.set('standard', filters.standard);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/daily-performance/admin/analytics${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load admin performance analytics');
  return response.json();
}

// ─── Bulk Import & Export ───────────────────────────────────────────────────

export async function downloadImportTemplate(type: 'mentors' | 'mentees' | 'assignments'): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/templates/${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to download template.');
  return response.blob();
}

export async function uploadImportFile(
  type: 'mentors' | 'mentees' | 'assignments',
  file: File,
): Promise<{ importJobId: string; preview: ImportPreview }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/import/upload/${type}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'CSV upload and validation failed.');
  }
  return response.json();
}

export async function getImportPreview(importJobId: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/${importJobId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load import preview.');
  return response.json();
}

export async function confirmImport(
  importJobId: string,
  duplicateAction: 'skip' | 'update' | 'ask',
  reassignMentees = true,
) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/${importJobId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ duplicateAction, reassignMentees }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to confirm import.');
  }
  return response.json();
}

export async function getImportStatus(importJobId: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/${importJobId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to check import status.');
  return response.json();
}

export async function downloadImportErrors(importJobId: string): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/${importJobId}/errors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to download error report.');
  return response.blob();
}

export async function getImportHistory() {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load import history.');
  return response.json();
}

export async function getImportJobDetails(importJobId: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/import/${importJobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load import details.');
  return response.json();
}

export async function exportBulkData(
  category: 'mentors' | 'mentees' | 'assignments' | 'calls' | 'performance',
  filters: Record<string, string> = {},
): Promise<Blob> {
  const token = getToken();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== 'All') {
      params.set(key, value);
    }
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/export/${category}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Failed to export data.');
  }
  return response.blob();
}

export interface AuditLogRow {
  _id: string;
  userId: string;
  userName: string;
  userRole: 'ADMIN' | 'MENTOR' | 'MENTEE';
  action:
    | 'UPLOAD_RECORDING'
    | 'PLAY_RECORDING'
    | 'VIEW_TRANSCRIPT'
    | 'EDIT_SUMMARY'
    | 'APPROVE_SUMMARY'
    | 'CHANGE_ASSIGNMENT'
    | 'DELETE_RECORD';
  targetType: 'CALL' | 'MENTORSHIP' | 'MENTEE' | 'MENTOR' | 'DAILY_PERFORMANCE';
  targetId: string;
  menteeName?: string;
  mentorName?: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export async function getAuditLogs(token: string, action?: string, limit: number = 50): Promise<{ logs: AuditLogRow[] }> {
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  params.set('limit', String(limit));
  const res = await fetch(`${API_BASE_URL}/admin/audit-logs?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

// ─── Notifications & Web Push ────────────────────────────────────────────────

export interface InAppNotification {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  dailyReminders: boolean;
  mentorshipActivity: boolean;
  callUpdates: boolean;
  systemNotifications: boolean;
}

export async function getNotifications(
  token: string,
  unreadOnly = false,
  limit = 40,
): Promise<{ notifications: InAppNotification[]; unreadCount: number }> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread', 'true');
  params.set('limit', String(limit));

  const res = await fetch(`${API_BASE_URL}/notifications?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

let inFlightUnreadCountPromise: Promise<{ unreadCount: number }> | null = null;
let lastUnreadCountResult: { data: { unreadCount: number }; timestamp: number } | null = null;

export function invalidateUnreadNotificationCountCache() {
  lastUnreadCountResult = null;
}

export async function getUnreadNotificationCount(token: string): Promise<{ unreadCount: number }> {
  const now = Date.now();
  if (lastUnreadCountResult && now - lastUnreadCountResult.timestamp < 3000) {
    return lastUnreadCountResult.data;
  }
  if (inFlightUnreadCountPromise) {
    return inFlightUnreadCountPromise;
  }
  inFlightUnreadCountPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch unread notification count');
      const data = await res.json();
      lastUnreadCountResult = { data, timestamp: Date.now() };
      return data;
    } finally {
      inFlightUnreadCountPromise = null;
    }
  })();
  return inFlightUnreadCountPromise;
}

export async function markNotificationAsRead(
  token: string,
  id: string,
): Promise<{ message: string; notification: { id: string; read: boolean }; unreadCount: number }> {
  invalidateUnreadNotificationCountCache();
  const res = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to mark notification as read');
  return res.json();
}

export async function markAllNotificationsAsRead(
  token: string,
): Promise<{ message: string; unreadCount: number }> {
  invalidateUnreadNotificationCountCache();
  const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to mark all notifications as read');
  return res.json();
}

export async function getNotificationPreferences(
  token: string,
): Promise<{ preferences: NotificationPreferences }> {
  const res = await fetch(`${API_BASE_URL}/notifications/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch notification preferences');
  return res.json();
}

export async function updateNotificationPreferences(
  token: string,
  preferences: Partial<NotificationPreferences>,
): Promise<{ message: string; preferences: NotificationPreferences }> {
  const res = await fetch(`${API_BASE_URL}/notifications/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw new Error('Failed to update notification preferences');
  return res.json();
}

export async function getVapidPublicKey(): Promise<{ publicKey: string }> {
  const res = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
  if (!res.ok) throw new Error('Failed to fetch VAPID public key');
  return res.json();
}

export async function registerPushSubscription(
  token: string,
  subscription: PushSubscription,
): Promise<{ message: string }> {
  const rawKey = subscription.getKey ? subscription.getKey('p256dh') : null;
  const rawAuth = subscription.getKey ? subscription.getKey('auth') : null;
  const p256dh = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : '';
  const auth = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : '';

  const res = await fetch(`${API_BASE_URL}/notifications/push-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) throw new Error('Failed to register push subscription');
  return res.json();
}

export async function unregisterPushSubscription(
  token: string,
  endpoint?: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/notifications/push-subscription`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error('Failed to remove push subscription');
  return res.json();
}

export interface ReminderSlot {
  slotIndex: number;
  time: string; // 'HH:mm' in 24h
  enabled: boolean;
}

export interface DailyReminderSetting {
  mentorId: string;
  enabled: boolean;
  timezone: string;
  slots: ReminderSlot[];
}

export async function getMentorReminderSettings(): Promise<{ settings: DailyReminderSetting }> {
  const res = await apiFetch('/mentors/reminder-settings');
  return res.json();
}

export async function updateMentorReminderSettings(data: {
  enabled: boolean;
  timezone: string;
  slots: ReminderSlot[];
}): Promise<{ message: string; settings: DailyReminderSetting }> {
  const res = await apiFetch('/mentors/reminder-settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json();
}

export interface CalendarDayItem {
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

export interface MenteeGrowthSummary {
  mentee: {
    id: string;
    name: string;
    makid: string;
    standard: string;
    location: string;
  };
  todayStatus: {
    submitted: boolean;
    date: string;
    record: GrowthDailyRecord | null;
  };
  streak: {
    currentStreak: number;
    bestStreak: number;
    daysSubmittedThisWeek: number;
    motivationalMessage: string;
  };
  weeklyCalendar: {
    weekLabel: string;
    startDate: string;
    endDate: string;
    days: CalendarDayItem[];
    completedCount: number;
  };
  xp: {
    level: number;
    levelName: string;
    totalXp: number;
    currentLevelFloor: number;
    nextLevelThreshold: number;
    progressPercent: number;
  };
  badges: Array<{
    id: string;
    name: string;
    icon: string;
    description: string;
    unlocked: boolean;
    progress?: number;
    maxProgress?: number;
    category: string;
  }>;
  weeklyChallenges: Array<{
    id: string;
    title: string;
    description: string;
    current: number;
    target: number;
    unit: string;
    completed: boolean;
    xpReward: number;
    expiresAt: string;
  }>;
  goals: {
    careerGoal: string;
    semesterGoal: string;
    shortTermGoals: ShortTermGoal[];
    academic: Record<string, unknown> | null;
  };
  leaderboard?: LeaderboardData;
  cohortLeaderboard: {
    hasCohort: boolean;
    mentorName: string;
    myRank: number;
    totalMentees: number;
    entries: Array<{
      rank: number;
      menteeId: string;
      name: string;
      isMe: boolean;
      currentStreak: number;
      totalSubmissions: number;
      totalXp: number;
    }>;
  };
  recentActivities: Array<{
    id: string;
    type: 'checkin' | 'call' | 'badge';
    title: string;
    description: string;
    timestamp: string;
    xpEarned?: number;
  }>;
}

export interface LeaderboardEntry {
  rank: number;
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
  isTopThree: boolean;
  isAnonymous?: boolean;
}

export interface HistoricalPeriodOption {
  type: 'weekly' | 'monthly';
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  offset: number;
}

export interface HistoricalPeriodsResponse {
  weekly: HistoricalPeriodOption[];
  monthly: HistoricalPeriodOption[];
}

export interface LeaderboardData {
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

export async function getMenteeGrowthSummary(params?: { weekOffset?: number; menteeId?: string }): Promise<MenteeGrowthSummary> {
  const query = new URLSearchParams();
  if (params?.weekOffset !== undefined) query.set('weekOffset', String(params.weekOffset));
  if (params?.menteeId) query.set('menteeId', params.menteeId);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch(`/daily-performance/growth-summary${qs}`);
  return res.json();
}

export async function getLeaderboard(params?: {
  period?: 'weekly' | 'monthly' | 'alltime';
  weekOffset?: number;
  monthOffset?: number;
  menteeId?: string;
  timezone?: string;
}): Promise<LeaderboardData> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.weekOffset !== undefined) query.set('weekOffset', String(params.weekOffset));
  if (params?.monthOffset !== undefined) query.set('monthOffset', String(params.monthOffset));
  if (params?.menteeId) query.set('menteeId', params.menteeId);
  if (params?.timezone) query.set('timezone', params.timezone);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch(`/daily-performance/leaderboard${qs}`);
  return res.json();
}

export async function getLeaderboardPeriods(timezone?: string): Promise<HistoricalPeriodsResponse> {
  const query = new URLSearchParams();
  if (timezone) query.set('timezone', timezone);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch(`/daily-performance/leaderboard-periods${qs}`);
  return res.json();
}

export async function updateLeaderboardPrivacy(optOut: boolean): Promise<{ success: boolean; optedOut: boolean }> {
  const res = await apiFetch('/daily-performance/leaderboard-privacy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optOut }),
  });
  return res.json();
}




