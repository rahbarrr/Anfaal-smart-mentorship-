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

export function MyCallsPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<any[]>([]);
  const [menteeMap, setMenteeMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) { setIsLoading(false); return; }

    Promise.all([getMentorCalls(token), getMyMentees(token)])
      .then(([callRes, menteeRes]) => {
        setCalls(callRes.calls ?? []);
        const map: Record<string, string> = {};
        for (const m of menteeRes.mentees ?? []) { map[m.id] = m.name; }
        setMenteeMap(map);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = calls.filter((call) => {
    const menteeName = menteeMap[call.menteeId] ?? '';
    const matchSearch = !search || menteeName.toLowerCase().includes(search.toLowerCase()) || (call.summary ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || call.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const [selectedCall, setSelectedCall] = useState<any | null>(null);

  return (
    <div className="form-card">
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">My Calls</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Call history</h3>
          <p className="page-subtitle">{calls.length} total session{calls.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Search by mentee or summary…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">All Statuses</option>
          <option value="Approved">Approved</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Draft">Draft</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Mentee</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Summary</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {isLoading ? 'Loading call history…' : (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>No calls recorded yet</div>
                        <div style={{ fontSize: '0.88rem' }}>Upload your first call recording to get started.</div>
                        <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((call) => (
                <tr key={call.id}>
                  <td style={{ fontWeight: 600 }}>{new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>{menteeMap[call.menteeId] ?? call.menteeId}</td>
                  <td>{call.duration} min</td>
                  <td><StatusBadge status={call.status} /></td>
                  <td style={{ fontSize: '0.85rem', maxWidth: 220 }}>
                    {call.summary ? (call.summary.length > 60 ? call.summary.slice(0, 60) + '…' : call.summary) : 'Awaiting summary'}
                  </td>
                  <td>
                    <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px' }} onClick={() => setSelectedCall(call)}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Call Detail Modal */}
      {selectedCall && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={() => setSelectedCall(null)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 20, padding: 28, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div className="eyebrow">Call Session Details</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Mentee: {menteeMap[selectedCall.menteeId] ?? selectedCall.menteeId}</h3>
              </div>
              <button className="btn-secondary" onClick={() => setSelectedCall(null)} style={{ padding: '6px 12px' }}>✕ Close</button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', gap: 18, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <span>📅 <strong>Date:</strong> {new Date(selectedCall.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <span>⏱️ <strong>Duration:</strong> {selectedCall.duration} min</span>
                <span>📌 <strong>Status:</strong> <StatusBadge status={selectedCall.status} /></span>
              </div>

              <div style={{ background: 'rgba(143,63,102,0.04)', padding: 16, borderRadius: 14, border: '1px solid rgba(143,63,102,0.1)' }}>
                <div className="label" style={{ marginBottom: 6 }}>AI Session Summary</div>
                <p style={{ lineHeight: 1.6, margin: 0, fontSize: '0.95rem' }}>{selectedCall.summary}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-primary" onClick={() => setSelectedCall(null)}>Close View</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
