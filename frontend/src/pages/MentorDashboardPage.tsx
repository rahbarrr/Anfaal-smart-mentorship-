import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMentorCalls, getMyMentees } from '../lib/api';
import {
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface TodayProgress {
  studyMinutes: number;
  studyFormatted: string;
  quranRuku: number;
  quranAyat: number;
  quranPages: number;
  readingMinutes: number;
  dayRating: number;
  submitted: boolean;
  needsMentorHelp: boolean;
  mentorHelpNote?: string;
}

interface AssignedMentee {
  id: string;
  name: string;
  standard: string;
  guardian?: string;
  phone?: string;
  status: string;
  totalCalls: number;
  lastCallDate: string;
  lastCallSummary?: string | null;
  todayProgress?: TodayProgress | null;
}

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

const ratingLabels = ['', 'Difficult', 'Okay', 'Good', 'Very Good', 'Excellent'];
const ratingEmojis = ['', '😞', '😐', '🙂', '😊', '🤩'];

export function MentorDashboardPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<any[]>([]);
  const [mentees, setMentees] = useState<AssignedMentee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    Promise.all([getMentorCalls(token), getMyMentees(token)])
      .then(([callRes, menteeRes]) => {
        setCalls(callRes.calls ?? []);
        setMentees(menteeRes.mentees ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const callsThisMonth = calls.filter((c) => new Date(c.date) >= startOfMonth).length;
  const pendingCalls = calls.filter((c) => c.status === 'Pending Review' || c.status === 'Draft').length;
  const lastCallDate = calls.length > 0 ? new Date(calls[0].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

  const cards = [
    { label: 'Assigned Mentees', value: isLoading ? '—' : String(mentees.length), change: 'Active students' },
    { label: 'Calls This Month', value: isLoading ? '—' : String(callsThisMonth), change: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}` },
    { label: 'Pending Review', value: isLoading ? '—' : String(pendingCalls), change: pendingCalls > 0 ? 'Action required' : 'All approved' },
    { label: 'Last Call', value: isLoading ? '—' : lastCallDate, change: calls.length > 0 ? `${calls[0].duration ?? 0} min` : 'No calls yet' },
  ];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* ── Top Metric Cards ──────────────────────────────────────────────── */}
      <div className="card-grid">
        {cards.map((card) => (
          <div key={card.label} className="dashboard-card">
            <div className="label">{card.label}</div>
            <div className="value">{card.value}</div>
            <div className="change">{card.change}</div>
          </div>
        ))}
      </div>

      {/* ── Section 9: My Mentees Cards Grid ──────────────────────────────── */}
      <div>
        <div className="page-header" style={{ marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Assigned Students</div>
            <h3 className="page-title" style={{ fontSize: '1.6rem' }}>My Mentees</h3>
            <p className="page-subtitle">Track today's study consistency, Quran recitation, and call history.</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/mentor/upload')}>
            + Upload Call
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            Loading assigned mentees…
          </div>
        ) : mentees.length === 0 ? (
          <div className="summary-card" style={{ textAlign: 'center', padding: '48px 20px' }}>
            <Users size={32} color="var(--text-secondary)" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ fontWeight: 700, marginBottom: 6 }}>No mentees assigned yet</h4>
            <p className="muted">Your administrator will assign mentees to your mentor profile shortly.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {mentees.map((mentee) => {
              const p = mentee.todayProgress;
              const hasSubmitted = Boolean(p && p.submitted);
              const needsHelp = Boolean(p && p.needsMentorHelp);

              return (
                <div
                  key={mentee.id}
                  className="summary-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeftWidth: 4,
                    borderLeftStyle: 'solid',
                    borderLeftColor: needsHelp ? 'var(--danger)' : hasSubmitted ? 'var(--success)' : 'var(--border)',
                    position: 'relative',
                  }}
                >
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 2 }}>{mentee.name}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Class: {mentee.standard}
                        </span>
                      </div>
                      <div>
                        {needsHelp ? (
                          <span className="status-badge status-failed" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                            Needs Help
                          </span>
                        ) : hasSubmitted ? (
                          <span className="status-badge status-completed" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                            ✓ Logged Today
                          </span>
                        ) : (
                          <span className="status-badge status-pending" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                            No Log Today
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Performance & Call details */}
                    <div
                      style={{
                        margin: '14px 0',
                        padding: '12px 14px',
                        background: 'var(--surface-muted)',
                        borderRadius: 10,
                        fontSize: '0.86rem',
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Last Call:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{mentee.lastCallDate}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Today's Study:</span>
                        <strong>{hasSubmitted ? p!.studyFormatted : '—'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Quran:</span>
                        <strong>{hasSubmitted ? `${p!.quranRuku} Ruku` : '—'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Day Rating:</span>
                        <span>
                          {hasSubmitted
                            ? `${ratingEmojis[p!.dayRating]} ${ratingLabels[p!.dayRating]}`
                            : '—'}
                        </span>
                      </div>
                      {needsHelp && p?.mentorHelpNote && (
                        <div
                          style={{
                            marginTop: 4,
                            padding: '8px 10px',
                            background: 'rgba(217,83,79,0.1)',
                            borderRadius: 8,
                            fontSize: '0.8rem',
                            color: 'var(--danger)',
                          }}
                        >
                          <strong>Student Note:</strong> {p.mentorHelpNote}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      className="btn-primary btn-sm"
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                      onClick={() => navigate(`/mentor/mentees/${mentee.id}`)}
                    >
                      View Mentee <ArrowRight size={13} />
                    </button>
                    <button
                      className="btn-outline btn-sm"
                      style={{ fontSize: '0.8rem' }}
                      title="Upload Call with this Mentee"
                      onClick={() => navigate('/mentor/upload')}
                    >
                      + Call
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent Mentorship Sessions Table ──────────────────────────────── */}
      <div style={{ marginTop: 10 }}>
        <div className="page-header" style={{ marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Call Records</div>
            <h3 className="page-title" style={{ fontSize: '1.4rem' }}>Recent Mentorship Sessions</h3>
          </div>
          <button className="btn-outline btn-sm" onClick={() => navigate('/mentor/calls')}>
            View All Calls →
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mentee</th>
                <th>Date</th>
                <th>Duration</th>
                <th>Status</th>
                <th>AI Summary</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                    No mentorship calls recorded yet.
                  </td>
                </tr>
              ) : (
                calls.slice(0, 8).map((call) => (
                  <tr key={call.id}>
                    <td style={{ fontWeight: 600 }}>{call.menteeName || 'Mentee'}</td>
                    <td>
                      {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td>{call.duration} min</td>
                    <td>
                      <StatusBadge status={call.status} />
                    </td>
                    <td style={{ fontSize: '0.85rem', maxWidth: 240 }}>
                      <span
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.4,
                        }}
                      >
                        {call.summary || 'Processing…'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-outline btn-sm"
                        style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => navigate(`/mentor/calls/${call.id}`)}
                      >
                        <Sparkles size={12} /> View Intelligence
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
