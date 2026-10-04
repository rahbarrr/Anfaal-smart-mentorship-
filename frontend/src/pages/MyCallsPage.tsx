import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMentorCalls, getMyMentees, deleteCall } from '../lib/api';
import { formatDateTime, formatDateOnly } from '../lib/dateTime';
import { Brain, Trash2, X } from 'lucide-react';

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

function AiStatusDot({ status }: { status?: string }) {
  if (status === 'completed') return <span style={{ color: '#16a34a', fontSize: '0.78rem', fontWeight: 600 }}>✓ Ready</span>;
  if (status === 'pending' || status === 'processing') return <span style={{ color: '#d97706', fontSize: '0.78rem' }}>⏳ Processing</span>;
  if (status === 'failed') return <span style={{ color: '#dc2626', fontSize: '0.78rem' }}>⚠ Failed</span>;
  return <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>;
}

export function MyCallsPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<any[]>([]);
  const [menteeMap, setMenteeMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = () => {
    if (!token) { setIsLoading(false); return; }
    Promise.all([getMentorCalls(token), getMyMentees(token)])
      .then(([callRes, menteeRes]) => {
        setCalls(callRes.calls ?? []);
        const map: Record<string, string> = {};
        for (const m of menteeRes.mentees ?? []) { map[m.id] = m.name; }
        setMenteeMap(map);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Unable to load call history.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const filtered = calls.filter((call) => {
    const menteeName = menteeMap[call.menteeId] ?? '';
    const matchSearch = !search || menteeName.toLowerCase().includes(search.toLowerCase()) || (call.summary ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || call.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteCall(token, deleteTarget.id);
      setDeleteTarget(null);
      setSuccessMessage('✓ Call recording deleted successfully.');
      loadData();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete call recording.');
    } finally {
      setIsDeleting(false);
    }
  };

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

      {loadError && <div className="alert-banner alert-error" role="alert">Unable to load call history: {loadError}</div>}

      {/* ── Success Toast ─────────────────────────────────────────────────────── */}
      {successMessage && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22,163,74,0.25)',
          borderRadius: 12, color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {successMessage}
          <button onClick={() => setSuccessMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'inherit', padding: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          className="input search-full"
          placeholder="Search by mentee or summary…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 160, flex: '0 0 auto' }}>
          <option value="">All Statuses</option>
          <option value="Approved">Approved</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Draft">Draft</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {/* ── Desktop Table ─────────────────────────────────────────────────────── */}
      <div className="desktop-table">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Mentee</th>
                <th>Duration</th>
                <th>Status</th>
                <th>AI Summary</th>
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
                    <td>
                      <div style={{ fontWeight: 600 }}>{formatDateOnly(call.date)}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Uploaded: {formatDateTime(call.uploadedAt || call.createdAt)}
                      </div>
                    </td>
                    <td>{menteeMap[call.menteeId] ?? call.menteeId}</td>
                    <td>{call.duration} min</td>
                    <td><StatusBadge status={call.status} /></td>
                    <td><AiStatusDot status={call.aiStatus} /></td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          id={`view-call-${call.id}`}
                          className="btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => navigate(`/mentor/calls/${call.id}`)}
                        >
                          <Brain size={14} /> View Intelligence
                        </button>
                        <button
                          id={`delete-call-${call.id}`}
                          className="btn-secondary"
                          style={{
                            fontSize: '0.82rem', padding: '6px 10px',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            color: 'var(--danger)', borderColor: 'rgba(199,92,92,0.3)',
                          }}
                          onClick={() => { setDeleteTarget(call); setDeleteError(''); }}
                          title="Delete call recording"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile Card List ─────────────────────────────────────────────────── */}
      <div className="mobile-card-list">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>Loading call history…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No calls recorded yet</div>
            <div style={{ fontSize: '0.88rem' }}>Upload your first call recording to get started.</div>
            <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
          </div>
        ) : (
          filtered.map((call) => (
            <div key={call.id} className="call-mobile-card">
              <div className="call-mobile-card-header">
                <div className="call-mobile-card-names">
                  <div className="call-mobile-card-title">{menteeMap[call.menteeId] ?? call.menteeId}</div>
                  <div className="call-mobile-card-subtitle" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>Call Date: {formatDateOnly(call.date)}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Uploaded: {formatDateTime(call.uploadedAt || call.createdAt)}
                    </span>
                  </div>
                </div>
                <StatusBadge status={call.status} />
              </div>
              <div className="call-mobile-card-meta">
                <div className="call-mobile-card-meta-item">
                  <span className="call-mobile-card-meta-label">Duration</span>
                  <span className="call-mobile-card-meta-value">{call.duration} min</span>
                </div>
                <div className="call-mobile-card-meta-item">
                  <span className="call-mobile-card-meta-label">Uploaded</span>
                  <span className="call-mobile-card-meta-value" style={{ overflowWrap: 'break-word' }}>
                    {formatDateTime(call.uploadedAt || call.createdAt)}
                  </span>
                </div>
              </div>
              {call.summary && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {call.summary}
                </div>
              )}
              <div className="call-mobile-card-actions">
                <button
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => navigate(`/mentor/calls/${call.id}`)}
                >
                  <Brain size={14} /> View Intelligence
                </button>
                <button
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--danger)', borderColor: 'rgba(199,92,92,0.3)' }}
                  onClick={() => { setDeleteTarget(call); setDeleteError(''); }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, boxSizing: 'border-box',
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) setDeleteTarget(null); }}
        >
          <div className="form-card" style={{
            width: '100%', maxWidth: 460, position: 'relative',
            borderRadius: 20, padding: 28, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          }}>
            {!isDeleting && (
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            )}

            <div style={{ fontSize: '3rem', marginBottom: 10 }}>🗑️</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 10, letterSpacing: '-0.03em' }}>
              Delete call recording?
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 6 }}>
              This will permanently delete the call recording with{' '}
              <strong>{menteeMap[deleteTarget.menteeId] ?? deleteTarget.menteeId}</strong>
              {' '}on <strong>{new Date(deleteTarget.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.
            </p>
            <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 24 }}>
              This will also delete the associated call details and recording file. This action cannot be undone.
            </p>

            {deleteError && (
              <div style={{
                marginBottom: 16, padding: '10px 14px',
                background: 'rgba(201,87,87,0.08)', borderRadius: 10,
                color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem',
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                className="btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                style={{ minWidth: 100, minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{
                  background: 'var(--danger)', borderColor: 'var(--danger)',
                  minWidth: 140, minHeight: 44,
                  display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                  opacity: isDeleting ? 0.75 : 1,
                }}
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Deleting…
                  </>
                ) : (
                  <><Trash2 size={15} /> Delete Recording</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
