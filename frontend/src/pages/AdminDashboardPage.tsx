import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardSummary, sendTestPushNotification, getPushDiagnosticStatus } from '../lib/api';
import {
  AlertTriangle,
  Users,
  UserCheck,
  PhoneCall,
  Brain,
  CalendarCheck,
  Clock,
  Sparkles,
  ArrowRight,
  Bell,
  Smartphone,
  Send,
  Radio,
  RefreshCw,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { formatDateTime, formatDateOnly, formatSubmissionTimestamps } from '../lib/dateTime';
import { isPushSupported, getNotificationPermission, subscribeToPush } from '../pwa/pwaNotifications';

type AttentionItem = {
  type: string;
  title: string;
  description: string;
  link: string;
};

type RecentCall = {
  id: string;
  date: string;
  uploadedAt?: string;
  duration: number;
  mentorName: string;
  menteeName: string;
  reviewStatus: string;
  aiStatus: string;
  summary: string;
  hasRecording: boolean;
};

type RecentProgress = {
  id: string;
  menteeId: string;
  menteeName: string;
  date: string;
  submittedAt?: string;
  updatedAt?: string;
  studyMinutes: number;
  quranRuku: number;
  dayRating: number;
  needsMentorHelp: boolean;
  mentorHelpNote?: string;
};

type DashboardData = {
  totalMentors: number;
  totalMentees: number;
  callsThisMonth: number;
  callsPending: number;
  callsCompleted: number;
  callsProcessedByAi: number;
  dailySubmissionsToday: number;
  recentCalls: RecentCall[];
  recentProgress: RecentProgress[];
  attentionItems: AttentionItem[];
};

const fallback: DashboardData = {
  totalMentors: 0,
  totalMentees: 0,
  callsThisMonth: 0,
  callsPending: 0,
  callsCompleted: 0,
  callsProcessedByAi: 0,
  dailySubmissionsToday: 0,
  recentCalls: [],
  recentProgress: [],
  attentionItems: [],
};

function StatusBadge({ status }: { status: string }) {
  const cls = (() => {
    switch (status) {
      case 'Approved':
      case 'Completed':
        return 'status-completed';
      case 'Processing':
        return 'status-processing';
      case 'Pending Review':
        return 'status-pending';
      case 'Submitted':
      case 'Draft':
        return 'status-submitted';
      case 'Failed':
      case 'Rejected':
        return 'status-failed';
      default:
        return 'status-pending';
    }
  })();
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

const ratingEmojis = ['', '😞', '😐', '🙂', '😊', '🤩'];

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ─── PWA & Push Diagnostics State ──────────────────────────────────────────
  const [pushDiag, setPushDiag] = useState<{
    vapidConfigured: boolean;
    pushEnabled: boolean;
    registeredDevices: number;
    totalSystemDevices?: number;
    devices: Array<{ endpointSnippet: string; userAgent: string; createdAt?: string }>;
  } | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ success: boolean; message: string; summary?: any } | null>(null);

  const fetchPushDiag = useCallback(async () => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;
    try {
      const status = await getPushDiagnosticStatus(token);
      setPushDiag(status);
    } catch {
      // ignore background poll failure
    }
  }, []);

  useEffect(() => {
    fetchPushDiag();
  }, [fetchPushDiag]);

  const handleTestPush = async (broadcast: boolean) => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;
    setPushLoading(true);
    setPushFeedback(null);
    try {
      const res = await sendTestPushNotification(token, {
        title: 'Anfaal Test Notification',
        message: 'Background push notifications are working correctly!',
        link: '/',
        broadcast,
      });
      setPushFeedback(res);
      await fetchPushDiag();
    } catch (err: any) {
      setPushFeedback({
        success: false,
        message: err?.message || 'Failed to dispatch test notification.',
      });
    } finally {
      setPushLoading(false);
    }
  };

  const handleRegisterDevice = async () => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;
    setPushLoading(true);
    setPushFeedback(null);
    try {
      const res = await subscribeToPush(token);
      setPushFeedback({
        success: res.success,
        message: res.message,
      });
      await fetchPushDiag();
    } catch (err: any) {
      setPushFeedback({
        success: false,
        message: err?.message || 'Error subscribing device to push.',
      });
    } finally {
      setPushLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    getDashboardSummary(token)
      .then((res) => {
        setData({
          ...fallback,
          ...(res ?? {}),
          recentCalls: res?.recentCalls ?? [],
          recentProgress: res?.recentProgress ?? [],
          attentionItems: res?.attentionItems ?? [],
        });
      })
      .catch((error) => {
        setData(fallback);
        setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const metricCards = [
    { label: 'Total Mentors', value: data.totalMentors, icon: Users, sub: 'Active in system' },
    { label: 'Total Mentees', value: data.totalMentees, icon: UserCheck, sub: 'Assigned & active' },
    { label: 'Calls This Month', value: data.callsThisMonth, icon: PhoneCall, sub: 'Completed sessions' },
    { label: 'Pending Review', value: data.callsPending, icon: Clock, sub: 'Awaiting mentor approval', highlight: data.callsPending > 0 },
    { label: 'Processed by AI', value: data.callsProcessedByAi, icon: Brain, sub: 'Summaries generated' },
    { label: 'Daily Submissions Today', value: data.dailySubmissionsToday, icon: CalendarCheck, sub: 'Student daily logs' },
  ];

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 1200, margin: '0 auto', minWidth: 0, width: '100%' }}>
      {loadError && <div className="alert-banner alert-error" role="alert">Unable to load the latest dashboard data: {loadError}</div>}
      {/* ── Section 13 High-Level Mentorship Activity Metrics ─────────────── */}
      <div className="card-grid">
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="dashboard-card" style={m.highlight ? { borderLeft: '4px solid var(--warning)' } : {}}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="label">{m.label}</div>
                <Icon size={18} color="var(--primary)" />
              </div>
              <div className="value" style={m.highlight ? { color: 'var(--warning)' } : {}}>
                {isLoading ? '—' : m.value}
              </div>
              <div className="change" style={{ fontSize: '0.78rem' }}>{m.sub}</div>
            </div>
          );
        })}
      </div>

      {/* ── Attention Required (Factual Status Indicators) ────────────────── */}
      {data.attentionItems.length > 0 && (
        <div className="summary-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="summary-header" style={{ marginBottom: 14 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              <AlertTriangle size={18} color="var(--warning)" /> Attention Required
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Factual operational alerts</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.attentionItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(207,159,75,0.06)',
                  borderRadius: 10,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.title}</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>{item.description}</div>
                </div>
                <button
                  className="btn-outline btn-sm"
                  style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => navigate(item.link)}
                >
                  Resolve <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Web Push & Android PWA Diagnostics Card ──────────────────────── */}
      <div className="summary-card" style={{ borderLeft: '4px solid var(--primary)' }}>
        <div className="summary-header" style={{ marginBottom: 14 }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              <Bell size={18} color="var(--primary)" /> Web Push & Android Background Notification Diagnostics
            </h3>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Real-time push delivery verification across open, minimized, closed, and locked device states
            </p>
          </div>
          <button
            className="btn-outline btn-sm"
            onClick={fetchPushDiag}
            disabled={pushLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}
          >
            <RefreshCw size={13} className={pushLoading ? 'spin' : ''} /> Refresh Status
          </button>
        </div>

        {/* Live Diagnostics Telemetry Pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <strong>Push API:</strong> {isPushSupported() ? <span style={{ color: 'var(--success, #16a34a)' }}>Supported</span> : <span style={{ color: 'var(--destructive, #dc2626)' }}>Not Supported</span>}
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <strong>Browser Permission:</strong>{' '}
            <span style={{ color: getNotificationPermission() === 'granted' ? 'var(--success, #16a34a)' : 'var(--warning, #ca8a04)' }}>
              {getNotificationPermission()}
            </span>
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <strong>VAPID Backend:</strong> {pushDiag?.vapidConfigured ? <span style={{ color: 'var(--success, #16a34a)' }}>Configured & Active</span> : <span style={{ color: 'var(--warning, #ca8a04)' }}>Checking...</span>}
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <strong>Admin Devices:</strong> <span style={{ fontWeight: 700 }}>{pushDiag?.registeredDevices ?? 0}</span>
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <strong>Total System Subscriptions:</strong> <span style={{ fontWeight: 700 }}>{pushDiag?.totalSystemDevices ?? 0}</span>
          </div>
        </div>

        {/* Diagnostic Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            className="btn-primary btn-sm"
            onClick={() => handleTestPush(false)}
            disabled={pushLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38 }}
          >
            <Send size={14} /> Send Test Push to My Device
          </button>
          <button
            className="btn-outline btn-sm"
            onClick={() => handleTestPush(true)}
            disabled={pushLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38 }}
          >
            <Radio size={14} /> Broadcast Test Push to All Devices
          </button>
          {getNotificationPermission() !== 'granted' && (
            <button
              className="btn-outline btn-sm"
              onClick={handleRegisterDevice}
              disabled={pushLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38 }}
            >
              <Smartphone size={14} /> Enable & Register This Device
            </button>
          )}
        </div>

        {/* Live Feedback / Result Display */}
        {pushFeedback && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              border: `1px solid ${pushFeedback.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              background: pushFeedback.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              fontSize: '0.85rem',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              {pushFeedback.success ? <CheckCircle size={16} color="#16a34a" /> : <XCircle size={16} color="#dc2626" />}
              <span>{pushFeedback.message}</span>
            </div>
            {pushFeedback.summary && pushFeedback.summary.results?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <strong>Delivery Telemetry:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {pushFeedback.summary.results.map((r: any, idx: number) => (
                    <li key={idx}>
                      Endpoint: {r.endpoint} — Status: {r.status} {r.success ? '✓ (Delivered to provider)' : `✗ (${r.error})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Registered Devices List */}
        {pushDiag && pushDiag.devices && pushDiag.devices.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Registered Device Endpoints for Current User:
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {pushDiag.devices.map((d, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--surface-muted)',
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{d.endpointSnippet}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {d.userAgent.includes('Android') ? '📱 Android Chrome' : d.userAgent.slice(0, 30)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Dual Grid: Recent Calls & Recent Mentee Progress ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
        {/* Recent Calls */}
        <div className="summary-card">
          <div className="summary-header" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Recent Calls</h3>
              <p className="muted" style={{ fontSize: '0.8rem' }}>Latest uploaded recordings & summaries</p>
            </div>
            <button className="btn-outline btn-sm" onClick={() => navigate('/admin/calls')}>
              View All Calls →
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {data.recentCalls.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                No recent calls recorded.
              </div>
            ) : (
              data.recentCalls.slice(0, 5).map((call) => (
                <div
                  key={call.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', overflowWrap: 'anywhere' }}>{call.menteeName}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>with {call.mentorName}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                      <span>Call: {formatDateOnly(call.date)}</span>
                      <span>·</span>
                      <span>{call.duration} min</span>
                      {call.uploadedAt && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--text-secondary)' }}>Uploaded: {formatDateTime(call.uploadedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusBadge status={call.reviewStatus} />
                    <button
                      className="btn-primary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36 }}
                      onClick={() => navigate(`/admin/calls/${call.id}`)}
                    >
                      <Sparkles size={11} /> View
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Mentee Progress */}
        <div className="summary-card">
          <div className="summary-header" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Recent Mentee Progress</h3>
              <p className="muted" style={{ fontSize: '0.8rem' }}>Latest submitted daily performance logs</p>
            </div>
            <button className="btn-outline btn-sm" onClick={() => navigate('/admin/performance')}>
              Performance Dashboard →
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {data.recentProgress.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                No daily progress logs submitted recently.
              </div>
            ) : (
              data.recentProgress.slice(0, 5).map((p) => {
                const timestamps = formatSubmissionTimestamps(p.submittedAt, p.updatedAt);
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', overflowWrap: 'anywhere' }}>{p.menteeName}</span>
                        <span>{ratingEmojis[p.dayRating] || '🙂'}</span>
                        {p.needsMentorHelp && (
                          <span className="status-badge status-failed" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            Needs Help
                          </span>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                        <div>Study: {Math.floor(p.studyMinutes / 60)}h {p.studyMinutes % 60}m · Quran: {p.quranRuku} Ruku · Log Date: {formatDateOnly(p.date)}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Submitted: {timestamps.submittedFormatted}
                          {timestamps.isEdited && (
                            <span style={{ marginLeft: 6 }}>· Updated: {timestamps.updatedFormatted}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn-outline btn-sm"
                      style={{ fontSize: '0.75rem', padding: '4px 8px', minHeight: 36 }}
                      onClick={() => navigate(`/admin/mentees/${p.menteeId}`)}
                    >
                      Profile
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
