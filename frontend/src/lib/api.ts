// Use the same origin by default. Vite proxies this path in development and
// Nginx proxies it in Docker, so phones never try to call their own localhost.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export type UserRole = 'ADMIN' | 'MENTOR' | 'MENTEE';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  menteeId?: string;
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

export async function getMentorCalls(token: string) {
  const response = await fetch(`${API_BASE_URL}/calls`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load call data');
  return response.json();
}

export async function uploadCall(
  token: string,
  payload: { menteeId: string; duration: number; date?: string; mentorNotes?: string },
  file?: File | null,
) {
  const rawUser = localStorage.getItem('anfaal-user');
  const user = rawUser ? JSON.parse(rawUser) : null;

  const formData = new FormData();
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
    throw new Error(payloadError.message ?? 'Unable to upload call');
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

// ─── Mentors ──────────────────────────────────────────────────────────────────

export async function getMentors(token: string) {
  const response = await fetch(`${API_BASE_URL}/mentors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load mentors');
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

export async function getMenteeProfile(token: string, menteeId: string) {
  const response = await fetch(`${API_BASE_URL}/mentees/${menteeId}`, {
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

