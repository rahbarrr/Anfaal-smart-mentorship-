import { useEffect, useState } from 'react';
import { getDashboardSummary, getMentorCalls } from '../lib/api';
import { AlertTriangle } from 'lucide-react';

type SummaryState = {
  totalMentors: number;
  totalMentees: number;
  callsThisMonth: number;
  callsPending: number;
  callsCompleted: number;
  activeMentors: number;
};

const fallbackSummary: SummaryState = { totalMentors: 0, totalMentees: 0, callsThisMonth: 0, callsPending: 0, callsCompleted: 0, activeMentors: 0 };

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

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryState>(fallbackSummary);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) { setIsLoading(false); return; }

    Promise.all([
      getDashboardSummary(token),
      getMentorCalls(token),
    ])
      .then(([dashData, callData]) => {
        setSummary(dashData);
        setRecentCalls((callData.calls ?? []).slice(0, 8));
      })
      .catch(() => {
        setSummary(fallbackSummary);
        setRecentCalls([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const cards = [
    { label: 'Total Mentors', value: `${summary.totalMentors}`, color: undefined },
    { label: 'Total Mentees', value: `${summary.totalMentees}`, color: undefined },
    { label: 'Calls This Month', value: `${summary.callsThisMonth}`, color: undefined },
    { label: 'Calls Pending', value: `${summary.callsPending}`, color: 'var(--warning)' },
    { label: 'Calls Completed', value: `${summary.callsCompleted}`, color: 'var(--success)' },
    { label: 'Active Mentors', value: `${summary.activeMentors}`, color: undefined },
  ];

  // Simple bar chart data — either from real calls or sample
  const barData = [50, 65, 60, 80, 90, 84, summary.callsThisMonth || 45];
  const months = (() => {
    const names = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      names.push(d.toLocaleString('default', { month: 'short' }));
    }
    return names;
  })();

  return (
    <>
      <div className="card-grid">
        {cards.map((card) => (
          <div key={card.label} className="dashboard-card">
            <div className="label">{card.label}</div>
            <div className="value" style={card.color ? { color: card.color } : {}}>{isLoading ? '—' : card.value}</div>
          </div>
        ))}
      </div>

      <div className="summary-grid" style={{ marginTop: 10 }}>
        {/* Calls per month chart */}
        <div className="summary-card">
          <div className="summary-header">
            <h3>Calls per month</h3>
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'end', gap: 12, height: 180 }}>
            {barData.map((value, index) => {
              const maxBar = Math.max(...barData, 1);
              const h = Math.max((value / maxBar) * 160, 8);
              return (
                <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{value}</span>
                  <div
                    style={{
                      width: '100%', height: h,
                      background: index === barData.length - 1 ? 'rgba(143,63,102,0.85)' : 'rgba(143,63,102,0.35)',
                      borderRadius: 8, transition: 'height 0.4s ease',
                    }}
                  />
                  <span className="muted" style={{ fontSize: '0.7rem' }}>{months[index]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mentors requiring attention */}
        <div className="summary-card">
          <div className="summary-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={18} color="var(--warning)" /> Mentors requiring attention</h3>
          </div>
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            {[
              { label: 'No call submitted in 7+ days', severity: 'warning' },
              { label: 'Pending submissions not reviewed', severity: 'warning' },
              { label: 'Low mentor activity in the last 14 days', severity: 'info' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: item.severity === 'warning' ? 'rgba(207,159,75,0.06)' : 'rgba(93,126,184,0.06)', borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.severity === 'warning' ? 'var(--warning)' : 'var(--info)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent calls table */}
      <div style={{ marginTop: 24 }}>
        <div className="page-header" style={{ marginBottom: 14 }}>
          <h3 style={{ fontWeight: 700, fontSize: '1.2rem' }}>Recent Calls</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Duration</th>
                <th>Status</th>
                <th>AI Summary</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {isLoading ? 'Loading…' : 'No recent calls.'}
                  </td>
                </tr>
              ) : (
                recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td style={{ fontWeight: 600 }}>{new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>{call.duration} min</td>
                    <td><StatusBadge status={call.status} /></td>
                    <td style={{ fontSize: '0.85rem', maxWidth: 260 }}>
                      {call.summary ? (call.summary.length > 70 ? call.summary.slice(0, 70) + '…' : call.summary) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
