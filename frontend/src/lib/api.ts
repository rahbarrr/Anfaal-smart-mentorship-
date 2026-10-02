// Production API Base URL: loaded from VITE_API_URL or defaults to '/api'
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

function getToken(): string {
  return localStorage.getItem('anfaal-token') ?? '';
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

export async function deleteCall(token: string, callId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/calls/${callId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message ?? 'Unable to delete call recording.');
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

export async function getMentees(token: string) {
  const response = await fetch(`${API_BASE_URL}/mentees`, {
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
    (err as any).status = response.status;
    (err as any).existingId = resData.existingId;
    (err as any).existing = resData.existing;
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

export async function updateDailyPerformance(id: string, payload: any) {
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
): Promise<{ importJobId: string; preview: any }> {
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


