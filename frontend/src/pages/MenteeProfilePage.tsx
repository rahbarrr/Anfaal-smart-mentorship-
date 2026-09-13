import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMenteeProfile } from '../lib/api';
import { ArrowLeft, PhoneCall, BookOpen, Calendar, CheckSquare, AlertCircle, MessageSquare } from 'lucide-react';

type MenteeProfile = {
  id: string;
  name: string;
  standard: string;
  guardian: string;
  phone: string;
  status: 'active' | 'inactive';
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

const FALLBACK_PROFILE: MenteeProfile = {
  id: 'mock',
  name: 'Aisha Khan',
  standard: 'Class 8',
  guardian: 'Fatima Khan',
  phone: '+91-7700000001',
  status: 'active',
  createdAt: new Date().toISOString(),
};

const FALLBACK_CALLS: CallRecord[] = [
  {
    id: 'c1',
    date: new Date(Date.now() - 86400000).toISOString(),
    duration: 42,
    reviewStatus: 'Approved',
    summary: 'The student showed steady improvement in reading habits. Discussed presentation confidence.',
    keyDiscussionPoints: ['Academic progress', 'Revision routine', 'Presentation confidence'],
    studentConcerns: ['Lower confidence during presentations', 'Difficulty with consistent revision'],
    actionItems: ['Complete weekly reading goals', 'Practice a short presentation weekly'],
    followUpRecommendations: ['Share revised timetable', 'Check presentation confidence in 7 days'],
    topicsDiscussed: ['Academic progress', 'Study habits', 'Confidence building'],
  },
];

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
  const [activeTab, setActiveTab] = useState<'overview' | 'calls' | 'summary'>('overview');

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token || !menteeId) { setIsLoading(false); return; }

    getMenteeProfile(token, menteeId)
      .then((res) => {
        setMentee(res.mentee ?? FALLBACK_PROFILE);
        setCalls(res.calls ?? FALLBACK_CALLS);
      })
      .catch(() => {
        setMentee(FALLBACK_PROFILE);
        setCalls(FALLBACK_CALLS);
      })
      .finally(() => setIsLoading(false));
  }, [menteeId]);

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
        <p>Mentee not found.</p>
        <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }

  const lastCall = calls[0];
  const initials = mentee.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'calls', label: `Call History (${calls.length})` },
    { id: 'summary', label: 'Latest Summary' },
  ] as const;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Back button */}
      <button
        className="btn-secondary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: '0.88rem' }}
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={15} /> Back to My Mentees
      </button>

      {/* Profile header */}
      <div className="summary-card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '1.4rem', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.04em', margin: 0 }}>{mentee.name}</h2>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{mentee.standard}</span>
            <span className={`status-badge ${mentee.status === 'active' ? 'status-completed' : 'status-failed'}`}>{mentee.status}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{calls.length} total sessions</span>
          </div>
        </div>
        <button className="btn-primary" onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
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
          <div style={{ marginTop: 12, fontWeight: 700, fontSize: '1.05rem' }}>{mentee.guardian || '—'}</div>
          <div className="change">{mentee.phone || ''}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Approved Calls</div>
          <div className="value">{calls.filter((c) => c.reviewStatus === 'Approved').length}</div>
          <div className="change">of {calls.length} sessions</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none', border: 'none', padding: '10px 16px', cursor: 'pointer', fontWeight: 700,
              fontSize: '0.88rem', borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Topics</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No calls recorded yet.</td></tr>
              ) : calls.map((call) => (
                <tr key={call.id}>
                  <td style={{ fontWeight: 600 }}>{new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>{call.duration} min</td>
                  <td><StatusBadge status={call.reviewStatus} /></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{call.topicsDiscussed?.slice(0, 2).join(', ') || '—'}</td>
                  <td style={{ fontSize: '0.85rem', maxWidth: 260 }}>{call.summary ? call.summary.slice(0, 80) + (call.summary.length > 80 ? '…' : '') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && lastCall && (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="label">Short Summary</div>
            <p style={{ marginTop: 12, lineHeight: 1.7 }}>{lastCall.summary || 'No summary available.'}</p>

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
    </>
  );
}
