import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMentorCalls, getMyMentees } from '../lib/api';

function StatusBadge({ status }: { status: string }) {
  const cls = (() => {
    switch (status) {
      case 'Approved': case 'Completed': return 'status-completed';
      case 'Processing': return 'status-processing';
      case 'Pending Review': return 'status-pending';
      case 'Submitted': case 'Draft': return 'status-submitted';
      case 'Failed': case 'Rejected': return 'status-failed';
      default: return 'status-pending';
    }
  })();
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

export function MentorDashboardPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<any[]>([]);
  const [menteeMap, setMenteeMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) { setIsLoading(false); return; }

    Promise.all([
      getMentorCalls(token),
      getMyMentees(token),
    ]).then(([callRes, menteeRes]) => {
      setCalls(callRes.calls ?? []);
      const map: Record<string, string> = {};
      for (const m of menteeRes.mentees ?? []) {
        map[m.id] = m.name;
      }
      setMenteeMap(map);
    })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const callsThisMonth = calls.filter((c) => new Date(c.date) >= startOfMonth).length;
  const pendingCalls = calls.filter((c) => c.status === 'Pending Review' || c.status === 'Draft').length;
  const lastCallDate = calls.length > 0 ? new Date(calls[0].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
  const uniqueMentees = new Set(calls.map((c) => c.menteeId)).size;

  const cards = [
    { label: 'Total Mentees', value: isLoading ? '—' : String(Object.keys(menteeMap).length || uniqueMentees), change: 'Assigned to you' },
    { label: 'Calls This Month', value: isLoading ? '—' : String(callsThisMonth), change: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}` },
    { label: 'Pending Submission', value: isLoading ? '—' : String(pendingCalls), change: pendingCalls > 0 ? 'Needs your attention' : 'All caught up' },
    { label: 'Last Call', value: isLoading ? '—' : lastCallDate, change: calls.length > 0 ? `${calls[0].duration ?? 0} min` : 'No calls yet' },
  ];

  return (
    <>
      <div className="card-grid">
        {cards.map((card) => (
          <div key={card.label} className="dashboard-card">
            <div className="label">{card.label}</div>
            <div className="value">{card.value}</div>
            <div className="change">{card.change}</div>
          </div>
        ))}
      </div>

      <div className="page-header" style={{ marginTop: 10 }}>
        <div>
          <div className="eyebrow">Recent activity</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Recent Mentorship Sessions</h3>
        </div>
        <button className="btn-primary" onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
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
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {isLoading ? 'Loading calls…' : (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>No mentorship calls yet</div>
                        <div style={{ fontSize: '0.88rem' }}>Upload your first call recording to get started.</div>
                        <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              calls.slice(0, 10).map((call) => (
                <tr key={call.id}>
                  <td style={{ fontWeight: 600 }}>{menteeMap[call.menteeId] ?? call.menteeId ?? 'Mentee'}</td>
                  <td>{new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>{call.duration} min</td>
                  <td><StatusBadge status={call.status} /></td>
                  <td style={{ fontSize: '0.85rem', maxWidth: 220 }}>
                    {call.summary ? (call.summary.length > 60 ? call.summary.slice(0, 60) + '…' : call.summary) : 'Pending summary'}
                  </td>
                  <td><button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px' }} onClick={() => navigate('/mentor/calls')}>View</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
