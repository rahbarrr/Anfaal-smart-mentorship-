import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMentorCalls,
  getCallAudioUrl,
  deleteCall,
  deleteCallRecording,
  deleteCallSummary,
  deleteCallIntelligence,
  bulkDeleteCalls,
} from '../lib/api';
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
  CheckCircle2,
  AlertTriangle,
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

type DeleteActionType = 'ENTIRE_CALL' | 'RECORDING' | 'SUMMARY' | 'INTELLIGENCE' | 'BULK_CALLS';

interface DeleteModalState {
  type: DeleteActionType;
  call?: CallRecord;
  bulkIds?: string[];
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

  // Selection state
  const [selectedCallIds, setSelectedCallIds] = useState<Set<string>>(new Set());
  const selectAllTableRef = useRef<HTMLInputElement>(null);
  const selectAllMobileRef = useRef<HTMLInputElement>(null);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
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

  // Selection logic
  const isAllVisibleSelected = filteredCalls.length > 0 && filteredCalls.every((c) => selectedCallIds.has(c.id));
  const isSomeVisibleSelected = filteredCalls.some((c) => selectedCallIds.has(c.id)) && !isAllVisibleSelected;

  useEffect(() => {
    if (selectAllTableRef.current) {
      selectAllTableRef.current.indeterminate = isSomeVisibleSelected;
    }
    if (selectAllMobileRef.current) {
      selectAllMobileRef.current.indeterminate = isSomeVisibleSelected;
    }
  }, [isSomeVisibleSelected]);

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      const next = new Set(selectedCallIds);
      filteredCalls.forEach((c) => next.delete(c.id));
      setSelectedCallIds(next);
    } else {
      const next = new Set(selectedCallIds);
      filteredCalls.forEach((c) => next.add(c.id));
      setSelectedCallIds(next);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedCallIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedCallIds(next);
  };

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

  const executeDeleteAction = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      if (deleteModal.type === 'ENTIRE_CALL' && deleteModal.call) {
        const callId = deleteModal.call.id;
        const res = await deleteCall(token, callId);
        if (playingCallId === callId) {
          setPlayingCallId(null);
          setSignedAudioUrl(null);
        }
        setCalls((prev) => prev.filter((c) => c.id !== callId));
        setSelectedCallIds((prev) => {
          const next = new Set(prev);
          next.delete(callId);
          return next;
        });
        setSuccessMessage(res.message || 'Call deleted successfully.');
      } else if (deleteModal.type === 'RECORDING' && deleteModal.call) {
        const callId = deleteModal.call.id;
        const res = await deleteCallRecording(token, callId);
        if (playingCallId === callId) {
          setPlayingCallId(null);
          setSignedAudioUrl(null);
        }
        setCalls((prev) =>
          prev.map((c) => (c.id === callId ? { ...c, hasRecording: false, recordingStatus: 'deleted' } : c)),
        );
        setSuccessMessage(res.message || 'Call recording deleted successfully.');
      } else if (deleteModal.type === 'SUMMARY' && deleteModal.call) {
        const callId = deleteModal.call.id;
        const res = await deleteCallSummary(token, callId);
        setCalls((prev) =>
          prev.map((c) => (c.id === callId ? { ...c, summary: '' } : c)),
        );
        setSuccessMessage(res.message || 'Call summary deleted successfully.');
      } else if (deleteModal.type === 'INTELLIGENCE' && deleteModal.call) {
        const callId = deleteModal.call.id;
        const res = await deleteCallIntelligence(token, callId);
        setCalls((prev) =>
          prev.map((c) => (c.id === callId ? { ...c, aiStatus: 'pending', topicsDiscussed: [] } : c)),
        );
        setSuccessMessage(res.message || 'Call intelligence analysis deleted successfully.');
      } else if (deleteModal.type === 'BULK_CALLS' && deleteModal.bulkIds) {
        const ids = deleteModal.bulkIds;
        const res = await bulkDeleteCalls(token, ids);
        const deletedSet = new Set(res.deletedIds);
        setCalls((prev) => prev.filter((c) => !deletedSet.has(c.id)));
        setSelectedCallIds((prev) => {
          const next = new Set(prev);
          res.deletedIds.forEach((id) => next.delete(id));
          return next;
        });
        if (playingCallId && deletedSet.has(playingCallId)) {
          setPlayingCallId(null);
          setSignedAudioUrl(null);
        }
        setSuccessMessage(res.message);
      }

      setDeleteModal(null);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="form-card" style={{ maxWidth: 1240, margin: '0 auto' }}>
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
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'rgba(22, 163, 74, 0.08)',
            border: '1px solid rgba(22,163,74,0.25)',
            borderRadius: 12,
            color: 'var(--success)',
            fontWeight: 600,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'inherit', padding: 0 }}
          >
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

      {/* ── Search & Filters ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
          <option value="AI_COMPLETED">AI Summarized</option>
        </select>
      </div>

      {/* ── Bulk Actions Bar (Sticky & Mobile Responsive) ────────────────────── */}
      {selectedCallIds.size > 0 && (
        <div
          className="bulk-actions-toolbar bulk-toolbar"
          style={{
            position: 'sticky',
            top: 14,
            zIndex: 90,
            background: '#242024',
            color: '#fff',
            borderRadius: 16,
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: '0.9rem',
                background: 'rgba(255,255,255,0.16)',
                padding: '4px 12px',
                borderRadius: 20,
              }}
            >
              {selectedCallIds.size} selected
            </span>
            <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
              ({filteredCalls.length} visible in list)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.2)',
                fontSize: '0.84rem',
                padding: '6px 12px',
                minHeight: 38,
              }}
              onClick={() => setSelectedCallIds(new Set())}
            >
              Deselect All
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.2)',
                fontSize: '0.84rem',
                padding: '6px 12px',
                minHeight: 38,
              }}
              onClick={handleToggleSelectAll}
            >
              {isAllVisibleSelected ? 'Unselect Visible' : `Select All (${filteredCalls.length})`}
            </button>
            <button
              type="button"
              style={{
                background: 'var(--danger)',
                color: '#fff',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                padding: '8px 16px',
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                minHeight: 38,
              }}
              onClick={() =>
                setDeleteModal({
                  type: 'BULK_CALLS',
                  bulkIds: Array.from(selectedCallIds),
                })
              }
            >
              <Trash2 size={15} /> Delete Selected ({selectedCallIds.size})
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile Select-All Bar ────────────────────────────────────────────── */}
      <div
        className="mobile-select-all-row"
        style={{
          padding: '10px 14px',
          background: 'var(--surface-muted)',
          borderRadius: 12,
          marginBottom: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700 }}>
          <input
            ref={selectAllMobileRef}
            type="checkbox"
            style={{ width: 22, height: 22, accentColor: 'var(--primary)' }}
            checked={isAllVisibleSelected}
            onChange={handleToggleSelectAll}
          />
          <span>Select all {filteredCalls.length} visible calls</span>
        </label>
      </div>

      {/* ── Desktop Call Table ───────────────────────────────────────────────── */}
      <div className="desktop-table">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center', padding: '10px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                    <input
                      ref={selectAllTableRef}
                      type="checkbox"
                      style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--primary)' }}
                      checked={isAllVisibleSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all calls"
                    />
                  </div>
                </th>
                <th>Session Details</th>
                <th>Mentor</th>
                <th>Mentee</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>Summary</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                    Loading call records…
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                    {search || statusFilter !== 'ALL' ? 'No calls match your filters.' : 'No call records available yet.'}
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => {
                  const isPlaying = playingCallId === call.id;
                  const isSelected = selectedCallIds.has(call.id);

                  return (
                    <tr key={call.id} style={{ background: isSelected ? 'rgba(143,63,102,0.05)' : undefined }}>
                      <td style={{ textAlign: 'center', padding: '10px 4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                          <input
                            type="checkbox"
                            style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--primary)' }}
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(call.id)}
                            aria-label={`Select call for ${call.menteeName}`}
                          />
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          ID: {call.id.slice(-6).toUpperCase()}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{call.mentorName}</td>
                      <td>{call.menteeName}</td>
                      <td>{call.duration} min</td>
                      <td>
                        {call.hasRecording ? (
                          <button
                            className="btn-outline btn-sm"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: '0.78rem',
                              padding: '4px 10px',
                              color: isPlaying ? 'var(--primary)' : undefined,
                              borderColor: isPlaying ? 'var(--primary)' : undefined,
                            }}
                            onClick={() => handlePlayAudio(call.id)}
                          >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />} {isPlaying ? 'Playing' : 'Play Audio'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No audio</span>
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
                          {call.summary || <span className="muted">No summary</span>}
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
                            title="View call details and intelligence"
                          >
                            <Sparkles size={13} /> Details <ArrowRight size={13} />
                          </button>

                          {/* Modular delete actions */}
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            {call.hasRecording && (
                              <button
                                className="btn-secondary btn-sm"
                                style={{
                                  fontSize: '0.76rem',
                                  padding: '5px 8px',
                                  color: 'var(--danger)',
                                  borderColor: 'rgba(199,92,92,0.3)',
                                }}
                                onClick={() => setDeleteModal({ type: 'RECORDING', call })}
                                title="Delete audio recording only"
                              >
                                Del Audio
                              </button>
                            )}

                            {call.summary && (
                              <button
                                className="btn-secondary btn-sm"
                                style={{
                                  fontSize: '0.76rem',
                                  padding: '5px 8px',
                                  color: 'var(--danger)',
                                  borderColor: 'rgba(199,92,92,0.3)',
                                }}
                                onClick={() => setDeleteModal({ type: 'SUMMARY', call })}
                                title="Delete summary only"
                              >
                                Del Summary
                              </button>
                            )}

                            <button
                              className="btn-secondary btn-sm"
                              style={{
                                fontSize: '0.76rem',
                                padding: '5px 8px',
                                color: 'var(--danger)',
                                borderColor: 'rgba(199,92,92,0.4)',
                                background: 'rgba(199,92,92,0.06)',
                              }}
                              onClick={() => setDeleteModal({ type: 'ENTIRE_CALL', call })}
                              title="Delete entire call"
                            >
                              <Trash2 size={13} /> Call
                            </button>
                          </div>
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
            const isSelected = selectedCallIds.has(call.id);

            return (
              <div
                key={call.id}
                className="call-mobile-card"
                style={{
                  border: isSelected ? '2px solid var(--primary)' : undefined,
                  background: isSelected ? 'rgba(143,63,102,0.03)' : undefined,
                }}
              >
                <div className="call-mobile-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 44, minHeight: 44, marginTop: -4 }}>
                    <input
                      type="checkbox"
                      style={{ width: 22, height: 22, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      checked={isSelected}
                      onChange={() => handleToggleSelectOne(call.id)}
                      aria-label={`Select call for ${call.menteeName}`}
                    />
                  </div>

                  <div className="call-mobile-card-names" style={{ flex: 1, minWidth: 0 }}>
                    <div className="call-mobile-card-title">{call.mentorName} → {call.menteeName}</div>
                    <div className="call-mobile-card-subtitle">
                      {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {call.duration} min
                    </div>
                  </div>
                  <StatusBadge status={call.status} />
                </div>

                {/* Resource badges */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: call.hasRecording ? 'rgba(22,163,74,0.1)' : 'rgba(0,0,0,0.06)',
                      color: call.hasRecording ? 'var(--success)' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    Audio: {call.hasRecording ? 'Available' : 'None'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: call.summary ? 'rgba(143,63,102,0.1)' : 'rgba(0,0,0,0.06)',
                      color: call.summary ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    Summary: {call.summary ? 'Available' : 'None'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      padding: '3px 8px',
                      borderRadius: 8,
                      background: call.aiStatus === 'completed' ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.06)',
                      color: call.aiStatus === 'completed' ? '#2563eb' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    AI: {call.aiStatus}
                  </span>
                </div>

                {call.summary && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', marginTop: 6 }}>
                    {call.summary}
                  </div>
                )}

                <div className="call-mobile-card-actions" style={{ marginTop: 14 }}>
                  {call.hasRecording && (
                    <button
                      className="btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: isPlaying ? 'var(--primary)' : undefined, minHeight: 44 }}
                      onClick={() => handlePlayAudio(call.id)}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      {isPlaying ? 'Playing…' : 'Play Audio'}
                    </button>
                  )}
                  <button
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44 }}
                    onClick={() => navigate(`/admin/calls/${call.id}`)}
                  >
                    <Sparkles size={13} /> Full Details
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--danger)', borderColor: 'rgba(199,92,92,0.3)', minHeight: 44 }}
                    onClick={() => setDeleteModal({ type: 'ENTIRE_CALL', call })}
                  >
                    <Trash2 size={14} /> Delete Call
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Unified Delete Confirmation Modal ─────────────────────────────────── */}
      {deleteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            boxSizing: 'border-box',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setDeleteModal(null);
            }
          }}
        >
          <div
            className="form-card"
            style={{
              width: '100%',
              maxWidth: 480,
              position: 'relative',
              borderRadius: 24,
              padding: '28px 24px',
              textAlign: 'center',
              boxShadow: '0 28px 70px rgba(0,0,0,0.3)',
            }}
          >
            {!isDeleting && (
              <button
                onClick={() => setDeleteModal(null)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 4,
                }}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            )}

            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(199,92,92,0.12)', color: 'var(--danger)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={28} />
            </div>

            {/* Dynamic modal titles and text based on delete type */}
            {deleteModal.type === 'ENTIRE_CALL' && deleteModal.call && (
              <>
                <h3 style={{ fontWeight: 800, fontSize: '1.35rem', marginBottom: 10, letterSpacing: '-0.03em' }}>
                  Delete Entire Call?
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 12 }}>
                  This will permanently delete the call record between{' '}
                  <strong>{deleteModal.call.mentorName}</strong> and <strong>{deleteModal.call.menteeName}</strong> from{' '}
                  <strong>{new Date(deleteModal.call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.
                </p>
                <div style={{ background: 'rgba(199,92,92,0.08)', borderRadius: 12, padding: '10px 14px', marginBottom: 20, textAlign: 'left', fontSize: '0.84rem', color: '#991b1b' }}>
                  <strong>Permanently removed:</strong>
                  <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    <li>Audio recording from cloud storage</li>
                    <li>Transcript & speaker segments</li>
                    <li>AI intelligence & summary analysis</li>
                    <li>Call session record & queue jobs</li>
                  </ul>
                </div>
              </>
            )}

            {deleteModal.type === 'RECORDING' && deleteModal.call && (
              <>
                <h3 style={{ fontWeight: 800, fontSize: '1.35rem', marginBottom: 10, letterSpacing: '-0.03em' }}>
                  Delete Call Recording?
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 14 }}>
                  The audio recording file will be permanently deleted from cloud storage. The call record, transcript, and summary will be retained.
                </p>
              </>
            )}

            {deleteModal.type === 'SUMMARY' && deleteModal.call && (
              <>
                <h3 style={{ fontWeight: 800, fontSize: '1.35rem', marginBottom: 10, letterSpacing: '-0.03em' }}>
                  Delete Call Summary?
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 14 }}>
                  The summary content and all revision versions will be cleared from this call record.
                </p>
              </>
            )}

            {deleteModal.type === 'INTELLIGENCE' && deleteModal.call && (
              <>
                <h3 style={{ fontWeight: 800, fontSize: '1.35rem', marginBottom: 10, letterSpacing: '-0.03em' }}>
                  Delete Call Intelligence?
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 14 }}>
                  The AI intelligence analysis, topics discussed, student concerns, and recommendations will be removed.
                </p>
              </>
            )}

            {deleteModal.type === 'BULK_CALLS' && deleteModal.bulkIds && (
              <>
                <h3 style={{ fontWeight: 800, fontSize: '1.35rem', marginBottom: 10, letterSpacing: '-0.03em' }}>
                  Delete {deleteModal.bulkIds.length} calls?
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 14 }}>
                  This action will permanently delete all <strong>{deleteModal.bulkIds.length}</strong> selected calls, including their cloud audio files, summaries, transcripts, and AI analysis.
                </p>
                <div style={{ background: 'rgba(199,92,92,0.08)', borderRadius: 12, padding: '10px 14px', marginBottom: 20, textAlign: 'left', fontSize: '0.84rem', color: '#991b1b' }}>
                  ⚠️ <strong>Warning:</strong> This cannot be undone. All associated audio files will be deleted from storage.
                </div>
              </>
            )}

            {deleteError && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  background: 'rgba(201,87,87,0.1)',
                  borderRadius: 10,
                  color: 'var(--danger)',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangle size={16} />
                <span>{deleteError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
                style={{ minWidth: 100, minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'var(--danger)',
                  borderColor: 'var(--danger)',
                  minWidth: 140,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'center',
                  opacity: isDeleting ? 0.75 : 1,
                }}
                onClick={executeDeleteAction}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255,255,255,0.4)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    {deleteModal.type === 'BULK_CALLS'
                      ? `Delete ${deleteModal.bulkIds?.length} Calls`
                      : deleteModal.type === 'RECORDING'
                      ? 'Delete Recording'
                      : deleteModal.type === 'SUMMARY'
                      ? 'Delete Summary'
                      : deleteModal.type === 'INTELLIGENCE'
                      ? 'Delete Intelligence'
                      : 'Delete Call'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
