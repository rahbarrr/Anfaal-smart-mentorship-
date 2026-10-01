import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMentorCalls, getCallAudioUrl, deleteCall } from '../lib/api';
import {
  Search,
  Play,
  Pause,
  Sparkles,
  Volume2,
  AlertCircle,
  ArrowRight,
  Trash2,
  X,
} from 'lucide-react';

interface CallRecord {
  id: string;
  mentorId: string;
  mentorName: string;
  menteeId: string;
  menteeName: string;
  date: string;
  duration: number;
  status: string;
  aiStatus: string;
  recordingStatus: string;
  summary: string;
  hasTranscript: boolean;
  topicsDiscussed: string[];
  hasRecording: boolean;
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

export function AdminCallsPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CallRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadCalls = () => {
    if (!token) { setIsLoading(false); return; }
    getMentorCalls(token)
      .then((res) => setCalls(res.calls ?? []))
      .catch(() => setCalls([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadCalls(); }, [token]);

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.mentorName.toLowerCase().includes(q) ||
        c.menteeName.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'ALL' ||
        c.status.toLowerCase() === statusFilter.toLowerCase() ||
        (statusFilter === 'AI_COMPLETED' && c.aiStatus === 'completed');

      return matchesSearch && matchesStatus;
    });
  }, [calls, search, statusFilter]);

  const handlePlayAudio = async (callId: string) => {
    if (playingCallId === callId) {
      setPlayingCallId(null);
      setSignedAudioUrl(null);
      return;
    }
    setAudioError(null);
    setPlayingCallId(callId);
    try {
      const res = await getCallAudioUrl(token, callId);
      setSignedAudioUrl(res.audioUrl);
    } catch (err) {
      setSignedAudioUrl(null);
      setAudioError(err instanceof Error ? err.message : 'Unable to load audio playback URL');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteCall(token, deleteTarget.id);
      // If the deleted call was playing, stop it
      if (playingCallId === deleteTarget.id) {
        setPlayingCallId(null);
        setSignedAudioUrl(null);
      }
      setDeleteTarget(null);
      setSuccessMessage('✓ Call recording deleted successfully.');
      loadCalls();
      // Auto-dismiss success toast after 4 seconds
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete call recording.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="form-card" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="label">Call Intelligence</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Call Records Library</h3>
          <p className="page-subtitle">
            Organization-wide repository of mentorship sessions, AI summaries, transcripts, and recordings.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="status-badge status-completed" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
            {calls.length} Total Sessions
          </span>
        </div>
      </div>

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

      {/* Floating Audio Player if active */}
      {playingCallId && (
        <div
          style={{
            marginBottom: 20,
            padding: '14px 20px',
            background: 'var(--surface-muted)',
            borderRadius: 14,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Volume2 size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                Playing Recording: {calls.find((c) => c.id === playingCallId)?.menteeName} with {calls.find((c) => c.id === playingCallId)?.mentorName}
              </div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Streaming authenticated audio session
              </div>
            </div>
          </div>
          <div className="call-audio-player-wrap">
            {signedAudioUrl ? (
              <audio
                controls
                autoPlay
                src={signedAudioUrl}
                style={{ width: '100%', maxWidth: 380, height: 38 }}
                onError={() => setAudioError('Audio recording file is unavailable or missing on server.')}
              />
            ) : (
              <span className="muted" style={{ fontSize: '0.85rem' }}>Loading secure audio player…</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setPlayingCallId(null)}>✕ Close</button>
          </div>
        </div>
      )}

      {audioError && (
        <div className="summary-card" style={{ marginBottom: 16, borderLeft: '4px solid var(--warning)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} color="var(--warning)" />
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{audioError}</span>
        </div>
      )}

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            className="input-field search-full"
            placeholder="Search by mentor, mentee, or topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>
        <select
          className="input-field"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 160, flex: '0 0 auto' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="Approved">Approved</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Processing">Processing</option>
          <option value="Draft">Draft</option>
        </select>
      </div>

      {/* ── Desktop Table ────────────────────────────────────────────────────── */}
      <div className="desktop-table">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Mentor</th>
                <th>Mentee</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>AI Summary</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                    Loading call records…
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                    {search || statusFilter !== 'ALL' ? 'No calls match your filters.' : 'No call records available yet.'}
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => {
                  const isPlaying = playingCallId === call.id;
                  return (
                    <tr key={call.id}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ fontWeight: 600 }}>{call.mentorName}</td>
                      <td>{call.menteeName}</td>
                      <td>{call.duration} min</td>
                      <td>
                        {call.hasRecording ? (
                          <button
                            className="btn-outline btn-sm"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: '0.78rem', padding: '4px 10px',
                              color: isPlaying ? 'var(--primary)' : undefined,
                              borderColor: isPlaying ? 'var(--primary)' : undefined,
                            }}
                            onClick={() => handlePlayAudio(call.id)}
                          >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />} {isPlaying ? 'Playing' : 'Play Audio'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Notes only</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: 220 }}>
                        <span
                          title={call.summary}
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
                        <StatusBadge status={call.status} />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            className="btn-primary btn-sm"
                            style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            onClick={() => navigate(`/admin/calls/${call.id}`)}
                          >
                            <Sparkles size={13} /> Full Details <ArrowRight size={13} />
                          </button>
                          <button
                            className="btn-secondary btn-sm"
                            style={{
                              fontSize: '0.8rem', padding: '5px 10px',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile Card List ─────────────────────────────────────────────────── */}
      <div className="mobile-card-list">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>Loading call records…</div>
        ) : filteredCalls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
            {search || statusFilter !== 'ALL' ? 'No calls match your filters.' : 'No call records available yet.'}
          </div>
        ) : (
          filteredCalls.map((call) => {
            const isPlaying = playingCallId === call.id;
            return (
              <div key={call.id} className="call-mobile-card">
                <div className="call-mobile-card-header">
                  <div className="call-mobile-card-names">
                    <div className="call-mobile-card-title">{call.mentorName} → {call.menteeName}</div>
                    <div className="call-mobile-card-subtitle">
                      {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
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
                    <span className="call-mobile-card-meta-label">Recording</span>
                    <span className="call-mobile-card-meta-value">{call.hasRecording ? 'Available' : 'Notes only'}</span>
                  </div>
                </div>
                {call.summary && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {call.summary}
                  </div>
                )}
                <div className="call-mobile-card-actions">
                  {call.hasRecording && (
                    <button
                      className="btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: isPlaying ? 'var(--primary)' : undefined }}
                      onClick={() => handlePlayAudio(call.id)}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      {isPlaying ? 'Playing…' : 'Play Audio'}
                    </button>
                  )}
                  <button
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => navigate(`/admin/calls/${call.id}`)}
                  >
                    <Sparkles size={13} /> Full Details
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
            );
          })
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
          onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) { setDeleteTarget(null); } }}
        >
          <div className="form-card" style={{
            width: '100%', maxWidth: 480, position: 'relative',
            borderRadius: 20, padding: 28, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          }}>
            {/* Close button */}
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
              This will permanently delete the call recording between{' '}
              <strong>{deleteTarget.mentorName}</strong> and <strong>{deleteTarget.menteeName}</strong>
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
