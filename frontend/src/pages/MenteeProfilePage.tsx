import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMenteeProfile, getMenteePerformance, getMenteePerformanceAnalytics, getMenteeAiInsights } from '../lib/api';
import { ArrowLeft, PhoneCall, BookOpen, Calendar, CheckSquare, AlertCircle, MessageSquare, Sparkles, TrendingUp, HelpCircle, BarChart3, Clock, BookMarked, Star, CircleDot } from 'lucide-react';
import type { PerformanceAnalyticsData, AiInsightsResult } from '../types';

type MenteeProfile = {
  id: string;
  name: string;
  standard: string;
  guardian: string;
  phone: string;
  status: 'active' | 'inactive';
  assignedMentor?: string;
  createdAt: string;
};

type CallRecord = {
  id: string;
  date: string;
  duration: number;
  reviewStatus: string;
  summary?: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
};

const MOOD_MAP: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😞', label: 'Very difficult' },
  2: { emoji: '😕', label: 'Difficult' },
  3: { emoji: '😐', label: 'Okay' },
  4: { emoji: '🙂', label: 'Good' },
  5: { emoji: '😊', label: 'Very good' },
};

function formatDuration(min: number): string {
  if (min === 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Approved' ? 'status-completed' : status === 'Rejected' ? 'status-failed' : status === 'Pending Review' ? 'status-pending' : 'status-processing';
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

export function MenteeProfilePage() {
  const { menteeId } = useParams<{ menteeId: string }>();
  const navigate = useNavigate();
  const [mentee, setMentee] = useState<MenteeProfile | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'calls' | 'summary' | 'performance'>('overview');

  const user = (() => {
    try {
      const u = localStorage.getItem('anfaal-user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })();
  const isAdmin = user?.role === 'ADMIN';

  // Daily Performance states
  const [perfData, setPerfData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<PerformanceAnalyticsData | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsightsResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [analyticsChartTab, setAnalyticsChartTab] = useState<'study7' | 'study30' | 'quran' | 'reading' | 'mood'>('study7');

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token || !menteeId) { setIsLoading(false); return; }

    getMenteeProfile(token, menteeId)
      .then((res) => {
        setMentee(res.mentee ?? null);
        setCalls(res.calls ?? []);
      })
      .catch((error: unknown) => {
        setMentee(null);
        setCalls([]);
        setLoadError(error instanceof Error ? error.message : 'Unable to load mentee profile.');
      })
      .finally(() => setIsLoading(false));

    getMenteePerformance(menteeId)
      .then((res) => setPerfData(res))
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Unable to load performance data.'));

    getMenteePerformanceAnalytics(menteeId)
      .then((res) => setAnalyticsData(res))
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Unable to load performance analytics.'));
  }, [menteeId]);

  const handleGenerateAiInsights = async () => {
    if (!menteeId) return;
    setIsGeneratingAi(true);
    try {
      const res = await getMenteeAiInsights(menteeId);
      setAiInsights(res);
    } catch {
      alert('Unable to generate AI insights.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        Loading mentee profile…
      </div>
    );
  }

  if (!mentee) {
    return (
      <div className="summary-card" style={{ textAlign: 'center', padding: 40 }}>
        <p>{loadError ?? 'Mentee not found.'}</p>
        <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }

  const lastCall = calls[0];
  const initials = mentee.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'performance', label: 'Daily Performance' },
    { id: 'calls', label: `Call History (${calls.length})` },
    { id: 'summary', label: 'Latest Summary' },
  ] as const;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {loadError && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>{loadError}</div>}

      {/* Back button */}
      <button
        className="btn-secondary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: '0.88rem' }}
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={15} /> {isAdmin ? 'Back to Mentees' : 'Back to My Mentees'}
      </button>

      {/* Profile header */}
      <div className="summary-card profile-header-card">
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '1.4rem', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.04em', margin: 0, wordBreak: 'break-word' }}>{mentee.name}</h2>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{mentee.standard}</span>
            {mentee.assignedMentor && (
              <span style={{ fontWeight: 700, color: 'var(--primary)', background: 'rgba(143,63,102,0.08)', padding: '3px 10px', borderRadius: 8, fontSize: '0.84rem' }}>
                Mentor: {mentee.assignedMentor}
              </span>
            )}
            <span className={`status-badge ${mentee.status === 'active' ? 'status-completed' : 'status-failed'}`}>{mentee.status}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{calls.length} total sessions</span>
          </div>
        </div>
        <button className="btn-primary" onClick={() => navigate(isAdmin ? '/admin/calls' : '/mentor/upload')}>
          {isAdmin ? 'View Call Library' : '+ Upload Call'}
        </button>
      </div>

      {/* Quick stats */}
      <div className="card-grid" style={{ marginBottom: 20 }}>
        <div className="dashboard-card">
          <div className="label">Total Calls</div>
          <div className="value">{calls.length}</div>
          <div className="change">All sessions</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Last Call</div>
          <div className="value" style={{ fontSize: '1.2rem' }}>{lastCall ? new Date(lastCall.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div>
          <div className="change">{lastCall ? `${lastCall.duration} min` : 'No calls yet'}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Guardian</div>
          <div style={{ marginTop: 12, fontWeight: 700, fontSize: '1.05rem', wordBreak: 'break-word' }}>{mentee.guardian || '—'}</div>
          <div className="change">{mentee.phone || ''}</div>
        </div>
        <div className="dashboard-card approved-calls-card">
          <div className="label">Approved Calls</div>
          <div className="value" style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
            <span>{calls.filter((c) => c.reviewStatus === 'Approved').length} / {calls.length}</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>sessions</span>
          </div>
          <div className="call-progress-track">
            <div
              className="call-progress-bar"
              style={{
                width: `${calls.length > 0 ? Math.round((calls.filter((c) => c.reviewStatus === 'Approved').length / calls.length) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="change" style={{ marginTop: 6, fontSize: '0.78rem' }}>
            {calls.length > 0 ? Math.round((calls.filter((c) => c.reviewStatus === 'Approved').length / calls.length) * 100) : 0}% completed
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs-wrapper">
        <div className="profile-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`profile-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={18} /> Profile Information</h3>
            </div>
            <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
              {[
                { label: 'Full Name', value: mentee.name },
                { label: 'Class / Standard', value: mentee.standard },
                { label: 'Assigned Mentor', value: mentee.assignedMentor || 'Unassigned' },
                { label: 'Guardian', value: mentee.guardian || '—' },
                { label: 'Phone', value: mentee.phone || '—' },
                { label: 'Status', value: mentee.status },
                { label: 'Member Since', value: new Date(mentee.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckSquare size={18} /> Latest Action Items</h3>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {lastCall?.actionItems?.length ? lastCall.actionItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(143,63,102,0.04)', borderRadius: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)' }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{item}</span>
                </div>
              )) : <p className="muted">No action items yet.</p>}
            </div>

            <div style={{ marginTop: 24 }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><AlertCircle size={16} /> Student Concerns</h4>
              {lastCall?.studentConcerns?.length ? (
                <ul style={{ paddingLeft: 18, display: 'grid', gap: 8 }}>
                  {lastCall.studentConcerns.map((c, i) => <li key={i} style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>{c}</li>)}
                </ul>
              ) : <p className="muted">No concerns recorded.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Calls tab */}
      {activeTab === 'calls' && (
        <div className="call-history-section-wrap">
          <div className="call-history-header-bar">
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>Call History</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 0', color: 'var(--text-primary)' }}>
                {calls.length} {calls.length === 1 ? 'Recorded Session' : 'Recorded Sessions'}
              </h3>
            </div>
            <span className="muted" style={{ fontSize: '0.84rem' }}>
              {calls.filter((c) => c.reviewStatus === 'Approved').length} approved of {calls.length} total
            </span>
          </div>

          {calls.length === 0 ? (
            <div className="call-history-empty-card">
              <PhoneCall size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 8px', opacity: 0.6 }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>No calls recorded yet</div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0 16px' }}>
                Sessions uploaded for this mentee will appear here with automated summaries, topics, and AI intelligence.
              </p>
              <button
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => navigate(isAdmin ? '/admin/calls' : '/mentor/upload')}
              >
                {isAdmin ? 'View Call Library' : '+ Upload Call'}
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table (> 640px) */}
              <div className="call-history-desktop-wrap">
                <table className="call-history-table">
                  <thead>
                    <tr>
                      <th style={{ width: '16%' }}>Call / Date</th>
                      <th style={{ width: '10%' }}>Duration</th>
                      <th style={{ width: '14%' }}>Status</th>
                      <th style={{ width: '22%' }}>Topics</th>
                      <th style={{ width: '26%' }}>Summary</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Intelligence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call, idx) => (
                      <tr key={call.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                            Call #{String(calls.length - idx).padStart(2, '0')}
                          </div>
                          <div className="muted" style={{ fontSize: '0.78rem' }}>
                            {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{call.duration} min</td>
                        <td><StatusBadge status={call.reviewStatus} /></td>
                        <td>
                          {call.topicsDiscussed && call.topicsDiscussed.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {call.topicsDiscussed.map((topic, i) => (
                                <span key={i} className="call-topic-chip">{topic}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: '0.82rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--text-primary)' }}>
                            {call.summary ? (
                              call.summary.length > 120 ? `${call.summary.slice(0, 120)}…` : call.summary
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn-outline btn-sm call-desktop-intel-btn"
                            onClick={() => navigate(isAdmin ? `/admin/calls/${call.id}` : `/mentor/calls/${call.id}`)}
                            title="View Call Intelligence"
                          >
                            <Sparkles size={13} />
                            <span>Intelligence</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (<= 640px) */}
              <div className="call-history-mobile-cards">
                {calls.map((call, idx) => (
                  <div key={call.id} className="call-history-card">
                    {/* Header: Call number + date + duration + status */}
                    <div className="call-history-card-header">
                      <div className="call-history-card-left">
                        <span className="call-number-badge">
                          CALL #{String(calls.length - idx).padStart(2, '0')}
                        </span>
                        <span className="call-card-date">
                          {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="call-history-card-right">
                        <span className="call-card-duration">{call.duration} min</span>
                        <StatusBadge status={call.reviewStatus} />
                      </div>
                    </div>

                    <div className="call-history-card-divider" />

                    {/* Topics */}
                    <div className="call-history-card-field">
                      <div className="call-history-field-label">TOPICS</div>
                      {call.topicsDiscussed && call.topicsDiscussed.length > 0 ? (
                        <div className="call-card-topics-chips">
                          {call.topicsDiscussed.map((topic, i) => (
                            <span key={i} className="call-topic-chip">{topic}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.84rem' }}>No specific topics recorded</span>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="call-history-card-field">
                      <div className="call-history-field-label">SUMMARY</div>
                      <p className="call-card-summary">
                        {call.summary || 'No summary recorded for this mentorship call.'}
                      </p>
                    </div>

                    {/* Full-width Intelligence Action Button */}
                    <button
                      className="btn-primary call-history-card-btn"
                      onClick={() => navigate(isAdmin ? `/admin/calls/${call.id}` : `/mentor/calls/${call.id}`)}
                    >
                      <Sparkles size={16} />
                      <span>View Intelligence</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && lastCall && (
        <div className="summary-grid">
          <div className="summary-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
              <div className="label">Short Summary</div>
              <button
                className="btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
                onClick={() => navigate(isAdmin ? `/admin/calls/${lastCall.id}` : `/mentor/calls/${lastCall.id}`)}
              >
                <Sparkles size={14} /> Full Call Intelligence Report →
              </button>
            </div>
            <p style={{ marginTop: 8, lineHeight: 1.7 }}>{lastCall.summary || 'No summary available.'}</p>

            <div style={{ marginTop: 22 }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} /> Key Discussion Points</h4>
              <ul style={{ paddingLeft: 18, marginTop: 10, display: 'grid', gap: 8 }}>
                {lastCall.keyDiscussionPoints?.map((p, i) => <li key={i} style={{ fontSize: '0.88rem' }}>{p}</li>)}
              </ul>
            </div>

            <div style={{ marginTop: 22 }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={16} /> Follow-up Recommendations</h4>
              <ul style={{ paddingLeft: 18, marginTop: 10, display: 'grid', gap: 8 }}>
                {lastCall.followUpRecommendations?.map((r, i) => <li key={i} style={{ fontSize: '0.88rem' }}>{r}</li>)}
              </ul>
            </div>
          </div>

          <div className="summary-card">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PhoneCall size={16} /> Topics Discussed</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {lastCall.topicsDiscussed?.map((t, i) => (
                <span key={i} style={{ background: 'rgba(143,63,102,0.08)', color: 'var(--primary)', borderRadius: 999, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 700 }}>{t}</span>
              ))}
            </div>

            <div style={{ marginTop: 24 }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckSquare size={16} /> Action Items</h4>
              <ul style={{ paddingLeft: 18, marginTop: 10, display: 'grid', gap: 8 }}>
                {lastCall.actionItems?.map((a, i) => <li key={i} style={{ fontSize: '0.88rem' }}>{a}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'summary' && !lastCall && (
        <div className="summary-card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted">No call summaries available yet. Upload a call to get started.</p>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
        </div>
      )}

      {/* ── Daily Performance Tab (Requirements 9, 10, 11, 12, 13, 14) ─── */}
      {activeTab === 'performance' && (
        <div className="profile-performance-flow">
          {/* Section 9: Today's Performance (Polished Status Card) */}
          <div className="today-status-card">
            <div className="today-status-header">
              <div className="today-status-title-group">
                <div className="today-status-eyebrow">
                  <Calendar size={14} className="metric-icon" />
                  <span>Mentee Daily Performance</span>
                </div>
                <h3 className="today-status-title">Today's Performance</h3>
              </div>
              <div className={`today-status-badge ${perfData?.today ? 'submitted' : 'pending'}`}>
                <span className="status-badge-dot" />
                <span>
                  {perfData?.today
                    ? `Submitted • ${new Date(perfData.today.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                    : 'Status: Not submitted'}
                </span>
              </div>
            </div>

            {perfData?.today ? (
              <div>
                <div className="today-perf-metrics-grid">
                  <div>
                    <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Study</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>
                      {formatDuration(perfData.today.studyMinutes)}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quran</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 2 }}>
                      {perfData.today.quran?.ruku ?? 0} Ruku • {perfData.today.quran?.ayat ?? 0} Ayat
                    </div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>{perfData.today.quran?.pages ?? 0} Pages</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reading</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>
                      {formatDuration(perfData.today.readingMinutes)}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Overall</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span>{MOOD_MAP[perfData.today.dayRating]?.emoji ?? '🙂'}</span>
                      <span style={{ fontSize: '0.9rem' }}>{MOOD_MAP[perfData.today.dayRating]?.label ?? 'Good'}</span>
                    </div>
                  </div>
                </div>

                {perfData.today.dailyReflection && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Reflection: </span>
                    <span style={{ fontSize: '0.88rem', fontStyle: 'italic' }}>"{perfData.today.dailyReflection}"</span>
                  </div>
                )}

                {(perfData.today.facedDifficulty || perfData.today.needsMentorHelp) && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                    {perfData.today.facedDifficulty && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff3e0', color: '#e65100', padding: '8px 12px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600 }}>
                        <AlertCircle size={16} /> Difficulty faced: {perfData.today.difficultyNote || 'Difficulty reported'}
                      </div>
                    )}
                    {perfData.today.needsMentorHelp && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(143,63,102,0.08)', color: 'var(--primary)', padding: '8px 12px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600 }}>
                        <HelpCircle size={16} /> Mentor help requested: {perfData.today.mentorHelpNote || 'Assistance requested'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="today-status-empty-box">
                <div className="today-status-indicator-row">
                  <CircleDot size={16} className="status-indicator-icon" />
                  <span className="status-indicator-title">No entry for today</span>
                </div>
                <p className="today-status-desc">
                  {mentee?.name
                    ? `No daily performance has been submitted by ${mentee.name} today.`
                    : 'No daily performance has been submitted for today yet.'}
                </p>
              </div>
            )}
          </div>

          {/* Section 14: Weekly Mentorship View (Compact Metric Cards) */}
          <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <div className="weekly-section-header">
              <div className="eyebrow" style={{ marginBottom: 2 }}>Overview</div>
              <h3 className="weekly-section-title">Weekly Progress</h3>
              <p className="weekly-section-subtitle">Your activity and consistency this week</p>
            </div>

            <div className="metric-grid">
              {/* Card 1: Study Time */}
              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-card-label">
                    <Clock size={14} className="metric-icon" />
                    <span>Study Time</span>
                  </div>
                </div>
                <div className="metric-card-value">
                  {perfData?.weekly?.totalStudyHoursFormatted ?? '0h 0m'}
                </div>
                <div className="metric-card-footer">
                  <span className="metric-card-desc">
                    {(perfData?.weekly?.totalStudyMinutes ?? 0) > 0 ? 'This past week' : 'No study time logged yet'}
                  </span>
                </div>
              </div>

              {/* Card 2: Quran Recitation */}
              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-card-label">
                    <BookOpen size={14} className="metric-icon" />
                    <span>Quran Recitation</span>
                  </div>
                </div>
                <div className="metric-card-value">
                  {perfData?.weekly?.quran?.ruku ?? 0} Ruku • {perfData?.weekly?.quran?.pages ?? 0} pgs
                </div>
                <div className="metric-card-footer">
                  <span className="metric-card-desc">
                    {(perfData?.weekly?.quran?.ruku ?? 0) > 0 || (perfData?.weekly?.quran?.pages ?? 0) > 0 || (perfData?.weekly?.quran?.ayat ?? 0) > 0
                      ? `${perfData?.weekly?.quran?.ayat ?? 0} Ayat logged`
                      : 'No recitation logged yet'}
                  </span>
                </div>
              </div>

              {/* Card 3: Reading Time */}
              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-card-label">
                    <BookMarked size={14} className="metric-icon" />
                    <span>Reading Time</span>
                  </div>
                </div>
                <div className="metric-card-value">
                  {formatDuration(perfData?.weekly?.totalReadingMinutes ?? 0)}
                </div>
                <div className="metric-card-footer">
                  <span className="metric-card-desc">
                    {(perfData?.weekly?.totalReadingMinutes ?? 0) > 0 ? 'General reading' : 'No reading time logged yet'}
                  </span>
                </div>
              </div>

              {/* Card 4: Average Day Rating */}
              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-card-label">
                    <Star size={14} className="metric-icon" />
                    <span>Average Day Rating</span>
                  </div>
                </div>
                <div className="metric-card-value">
                  {perfData?.weekly?.averageDayRating ? `${perfData.weekly.averageDayRating} / 5` : '—'}
                  {perfData?.weekly?.averageDayRating ? (
                    <span className="metric-card-emoji">{MOOD_MAP[Math.round(perfData.weekly.averageDayRating)]?.emoji}</span>
                  ) : null}
                </div>
                <div className="metric-card-footer">
                  <span className="metric-card-desc">
                    {perfData?.weekly?.daysSubmitted ? `${perfData.weekly.daysSubmitted} of 7 days submitted` : '0 of 7 days submitted'}
                  </span>
                  <div className="day-dots-indicator" aria-label={`${perfData?.weekly?.daysSubmitted ?? 0} of 7 days submitted`} title={`${perfData?.weekly?.daysSubmitted ?? 0} of 7 days submitted`}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <span
                        key={i}
                        className={`day-dot ${i < (perfData?.weekly?.daysSubmitted ?? 0) ? 'active' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 11: Performance Analytics (Charts) */}
          <div className="summary-card" style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <div className="analytics-header">
              <div>
                <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart3 size={15} color="var(--primary)" /> Visual Analytics
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '2px 0 0' }}>Performance Trends & Distribution</h3>
              </div>

              {/* Chart selector tabs */}
              <div className="analytics-chart-tabs">
                {[
                  { id: 'study7', label: 'Study (7d)' },
                  { id: 'study30', label: 'Study (30d)' },
                  { id: 'quran', label: 'Quran (7d)' },
                  { id: 'reading', label: 'Reading (7d)' },
                  { id: 'mood', label: 'Day Rating' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAnalyticsChartTab(tab.id as any)}
                    className={`analytics-tab-btn ${analyticsChartTab === tab.id ? 'active' : ''}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Render selected Chart */}
            <div className="analytics-chart-box">
              {/* Study 7 Days */}
              {analyticsChartTab === 'study7' && (
                <div>
                  <div className="chart-title-row">
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Study Hours — Last 7 Days</span>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Daily breakdown</span>
                  </div>
                  <div className="analytics-bar-chart-row">
                    {(analyticsData?.study.charts.last7Days ?? []).map((day) => {
                      const maxHours = Math.max(4, ...((analyticsData?.study.charts.last7Days ?? []).map((d) => d.hours) || [4]));
                      const heightPercent = Math.min(100, Math.round((day.hours / maxHours) * 100));
                      const dLabel = new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' });
                      return (
                        <div key={day.date} className="analytics-bar-col">
                          <span className="bar-val-label" style={{ color: 'var(--primary)' }}>
                            {day.hours > 0 ? `${day.hours}h` : '0'}
                          </span>
                          <div
                            className="analytics-bar-fill"
                            style={{
                              height: `${Math.max(8, heightPercent)}%`,
                              background: day.hours > 0 ? 'var(--primary)' : '#e2d9dc',
                            }}
                            title={`${day.date}: ${day.hours} hours (${day.minutes} min)`}
                          />
                          <span className="bar-day-label">
                            {dLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Study 30 Days */}
              {analyticsChartTab === 'study30' && (
                <div>
                  <div className="chart-title-row">
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Study Hours — Last 30 Days</span>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Monthly daily progression</span>
                  </div>
                  <div className="analytics-bar-chart-row" style={{ gap: 2 }}>
                    {(analyticsData?.study.charts.last30Days ?? []).map((day) => {
                      const maxHours = Math.max(4, ...((analyticsData?.study.charts.last30Days ?? []).map((d) => d.hours) || [4]));
                      const heightPercent = Math.min(100, Math.round((day.hours / maxHours) * 100));
                      return (
                        <div key={day.date} className="analytics-bar-col">
                          <div
                            className="analytics-bar-fill"
                            style={{
                              height: `${Math.max(4, heightPercent)}%`,
                              background: day.hours > 0 ? 'var(--primary)' : '#ebe5e7',
                              borderRadius: '2px 2px 0 0',
                            }}
                            title={`${day.date}: ${day.hours} hours`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                    <span>30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
              )}

              {/* Quran 7 Days */}
              {analyticsChartTab === 'quran' && (
                <div>
                  <div className="chart-title-row">
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Quran Reading — Last 7 Days (Pages)</span>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Daily pages read</span>
                  </div>
                  <div className="analytics-bar-chart-row">
                    {(analyticsData?.quran.charts.last7Days ?? []).map((day) => {
                      const maxPages = Math.max(10, ...((analyticsData?.quran.charts.last7Days ?? []).map((d) => d.pages) || [10]));
                      const heightPercent = Math.min(100, Math.round((day.pages / maxPages) * 100));
                      const dLabel = new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' });
                      return (
                        <div key={day.date} className="analytics-bar-col">
                          <span className="bar-val-label" style={{ color: '#2e7d32' }}>
                            {day.pages > 0 ? `${day.pages}p` : '0'}
                          </span>
                          <div
                            className="analytics-bar-fill"
                            style={{
                              height: `${Math.max(8, heightPercent)}%`,
                              background: day.pages > 0 ? '#2e7d32' : '#e2d9dc',
                            }}
                            title={`${day.date}: ${day.pages} pages, ${day.ruku} ruku, ${day.ayat} ayat`}
                          />
                          <span className="bar-day-label">
                            {dLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reading 7 Days */}
              {analyticsChartTab === 'reading' && (
                <div>
                  <div className="chart-title-row">
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>General Reading Time — Last 7 Days</span>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Minutes per day</span>
                  </div>
                  <div className="analytics-bar-chart-row">
                    {(analyticsData?.reading.charts.last7Days ?? []).map((day) => {
                      const maxMin = Math.max(60, ...((analyticsData?.reading.charts.last7Days ?? []).map((d) => d.minutes) || [60]));
                      const heightPercent = Math.min(100, Math.round((day.minutes / maxMin) * 100));
                      const dLabel = new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' });
                      return (
                        <div key={day.date} className="analytics-bar-col">
                          <span className="bar-val-label" style={{ color: '#1976d2' }}>
                            {day.minutes > 0 ? `${day.minutes}m` : '0'}
                          </span>
                          <div
                            className="analytics-bar-fill"
                            style={{
                              height: `${Math.max(8, heightPercent)}%`,
                              background: day.minutes > 0 ? '#1976d2' : '#e2d9dc',
                            }}
                            title={`${day.date}: ${day.minutes} minutes`}
                          />
                          <span className="bar-day-label">
                            {dLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Overall Day Rating Distribution */}
              {analyticsChartTab === 'mood' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Rating Distribution</span>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>Past 30 days mood spectrum</div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                      Avg: {analyticsData?.overallDay.averageRating ?? '—'} / 5 😊
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = analyticsData?.overallDay.ratingDistribution[rating] ?? 0;
                      const totalRatings = Object.values(analyticsData?.overallDay.ratingDistribution ?? {}).reduce((a, b) => a + b, 0) || 1;
                      const percent = Math.round((count / totalRatings) * 100);
                      const mood = MOOD_MAP[rating];
                      return (
                        <div key={rating} className="mood-rating-row">
                          <span style={{ fontSize: '1.2rem', width: 28, textAlign: 'center', flexShrink: 0 }}>{mood.emoji}</span>
                          <span className="mood-rating-label">{mood.label}</span>
                          <div style={{ flex: 1, minWidth: 0, height: 12, background: '#ede7e9', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--primary)', borderRadius: 6 }} />
                          </div>
                          <span style={{ fontSize: '0.82rem', width: 36, textAlign: 'right', fontWeight: 700, flexShrink: 0 }}>
                            {count}d
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 12: Mentor Insights */}
          <div className="summary-card" style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <div className="mentor-insights-header">
              <div>
                <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={15} color="var(--primary)" /> Trends
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '2px 0 0' }}>Mentor Insights</h3>
              </div>
              <span className="mentor-insights-badge">
                Descriptive statistics • Non-diagnostic
              </span>
            </div>

            <div className="mentor-insights-grid">
              {(analyticsData?.mentorInsights ?? [
                'Study consistency: Study time has been recorded regularly.',
                'Quran reading: Recitation logged across multiple days.',
                'Reading habits: Consistent time dedicated to reading.',
                'Overall day experience: Positive day ratings reported.',
              ]).map((insight, idx) => (
                <div key={idx} className="mentor-insight-card">
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 600 }}>
                    {insight}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 13: Optional AI Insights */}
          <div className="summary-card" style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <div className="ai-insights-header">
              <div>
                <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={15} color="var(--primary)" /> Supportive Intelligence
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '2px 0 0' }}>Weekly AI Progress Insights</h3>
              </div>

              <button
                type="button"
                className="btn-primary ai-insights-btn"
                disabled={isGeneratingAi}
                onClick={handleGenerateAiInsights}
              >
                <Sparkles size={16} />
                {isGeneratingAi ? 'Analyzing Data…' : aiInsights ? 'Regenerate Insights' : 'Generate Weekly AI Insights'}
              </button>
            </div>

            {aiInsights ? (
              <div style={{ display: 'grid', gap: 16, minWidth: 0, width: '100%', maxWidth: '100%' }}>
                <div style={{ padding: '14px 16px', background: 'rgba(143,63,102,0.05)', borderRadius: 14, border: '1px solid var(--border)', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)' }}>
                    Weekly Progress Summary
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                    {aiInsights.weeklySummary}
                  </p>
                </div>

                <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 800 }}>
                    Suggested Mentor Discussion Points
                  </h4>
                  <ul style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 8 }}>
                    {aiInsights.discussionPoints.map((point, idx) => (
                      <li key={idx} style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  ℹ️ AI suggestions are strictly informational and supportive. They do not diagnose or evaluate medical/psychological wellbeing.
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 20px', background: '#fdfbfb', borderRadius: 12, border: '1px dashed var(--border)', textAlign: 'center', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Click "Generate Weekly AI Insights" to generate a supportive summary and suggested talking points for your next mentorship check-in.
                </p>
              </div>
            )}
          </div>

          {/* Section 10: Performance History Table */}
          <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Records</div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 14 }}>Performance History</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Study</th>
                    <th>Ruku</th>
                    <th>Ayat</th>
                    <th>Pages</th>
                    <th>Reading</th>
                    <th>Day</th>
                    <th>Reflection / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(perfData?.history ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>
                        No daily performance records submitted yet.
                      </td>
                    </tr>
                  ) : (
                    (perfData?.history ?? []).map((r: any) => (
                      <tr key={r._id || r.id || r.date}>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {new Date(r.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          {formatDuration(r.studyMinutes)}
                        </td>
                        <td>{r.quran?.ruku ?? 0}</td>
                        <td>{r.quran?.ayat ?? 0}</td>
                        <td>{r.quran?.pages ?? 0}</td>
                        <td>{formatDuration(r.readingMinutes)}</td>
                        <td style={{ fontSize: '1.3rem' }}>
                          {MOOD_MAP[r.dayRating]?.emoji ?? '—'}
                        </td>
                        <td style={{ fontSize: '0.85rem', maxWidth: 240, overflowWrap: 'break-word', wordBreak: 'normal' }}>
                          {r.dailyReflection ? (
                            <span>{r.dailyReflection}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                          {r.facedDifficulty && (
                            <div style={{ color: '#e65100', fontSize: '0.78rem', marginTop: 2 }}>
                              ⚠️ {r.difficultyNote || 'Difficulty reported'}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
