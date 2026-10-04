import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCallDetail,
  getCallJobStatus,
  getCallTranscript,
  getCallAudioUrl,
  retryCallProcessing,
  approveCallSummary,
  updateCallSummary,
  deleteCall,
  deleteCallRecording,
  deleteCallSummary,
  deleteCallIntelligence,
} from '../lib/api';
import {
  FileText,
  Brain,
  CheckCircle,
  AlertTriangle,
  Loader,
  ArrowLeft,
  ThumbsUp,
  Edit3,
  Clock,
  User,
  Calendar,
  X,
  Plus,
  Sparkles,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Volume2,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDateTime, formatDateOnly } from '../lib/dateTime';

// ─── Types ────────────────────────────────────────────────────────────────────
type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
};

type AiSummary = {
  status?: string;
  shortSummary: string;
  keyDiscussionPoints: string[];
  academicProgress?: string;
  personalDevelopment?: string;
  challenges: string[];
  achievements: string[];
  actionItems: string[];
  mentorCommitments: string[];
  menteeCommitments: string[];
  followUpTopics: string[];
  topicsDiscussed: string[];
};

type JobStatus = {
  stage: string;
  status: string;
  processingStatus?: string;
  progress: number;
  stageStatus: Record<string, string>;
  error?: string;
};

type CallData = {
  _id: string;
  mentorId: string;
  mentorName?: string;
  menteeId: string;
  menteeName?: string;
  menteeStandard?: string;
  date: string;
  uploadedAt?: string;
  createdAt?: string;
  duration: number;
  reviewStatus: string;
  aiStatus: string;
  processingStatus?: string;
  recordingStatus?: string;
  recordingUrl?: string;
  recording?: {
    storageKey?: string;
    url?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };
  transcript?: string;
  transcription?: {
    status: string;
    text?: string;
    segments?: TranscriptSegment[];
    duration?: number;
  };
  aiSummary?: AiSummary;
  summary?: string;
  mentorNotes?: string;
  topicsDiscussed?: string[];
  actionItems?: string[];
  mentorReview?: {
    status: string;
    reviewedAt?: string;
    reviewedBy?: string;
  };
  summaryVersions?: Array<{
    version: number;
    type: string;
    timestamp: string;
    author: string;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function SpeakerBadge({ speaker }: { speaker?: string }) {
  if (!speaker) return null;
  const isMentor = /mentor|speaker\s*1|speaker\s*a/i.test(speaker);
  return (
    <span className={`speaker-badge ${isMentor ? 'speaker-mentor' : 'speaker-mentee'}`}>
      {speaker}
    </span>
  );
}

function EditableList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState('');
  const addItem = () => {
    if (newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(''); }
  };
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, val: string) => onChange(items.map((item, idx) => idx === i ? val : item));

  return (
    <div className="editable-list">
      <label className="field-label">{label}</label>
      <div className="editable-list-items">
        {items.map((item, i) => (
          <div key={i} className="editable-list-row">
            <input className="editable-list-input" value={item} onChange={(e) => updateItem(i, e.target.value)} />
            <button className="editable-list-remove" onClick={() => removeItem(i)}><X size={14} /></button>
          </div>
        ))}
        <div className="editable-list-add-row">
          <input className="editable-list-input" placeholder={`Add item…`} value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
          <button className="btn btn-ghost btn-sm" onClick={addItem}><Plus size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function SummaryList({ title, items, color }: { title: string; items?: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div className={`review-section summary-list summary-list-${color}`}>
      <h3>{title}</h3>
      <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function CallIntelligencePage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  const [call, setCall] = useState<CallData | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [transcript, setTranscript] = useState<{ text: string; segments: TranscriptSegment[] }>({ text: '', segments: [] });
  const [editedSummary, setEditedSummary] = useState<AiSummary | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'history'>('summary');
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Admin delete state
  const rawUser = localStorage.getItem('anfaal-user');
  const userRole = rawUser ? JSON.parse(rawUser)?.role : null;
  const isAdmin = userRole === 'ADMIN';
  const [adminDeleteTarget, setAdminDeleteTarget] = useState<'ENTIRE_CALL' | 'RECORDING' | 'SUMMARY' | 'INTELLIGENCE' | null>(null);
  const [isAdminDeleting, setIsAdminDeleting] = useState(false);

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = useCallback(async () => {
    if (!callId) return;
    try {
      const [detailRes, transcriptRes] = await Promise.all([
        getCallDetail(token, callId),
        getCallTranscript(token, callId).catch(() => ({ transcript: '', text: '', segments: [] })),
      ]);

      const loadedCall: CallData | null = detailRes.call ?? null;
      const loadedJob: JobStatus | null = detailRes.processingJob ?? null;
      setCall(loadedCall);
      setJob(loadedJob);

      const transcriptText =
        transcriptRes.transcript ||
        (transcriptRes as any).text ||
        loadedCall?.transcript ||
        loadedCall?.transcription?.text ||
        '';
      const transcriptSegments =
        transcriptRes.segments?.length
          ? transcriptRes.segments
          : (loadedCall?.transcription?.segments ?? []);

      setTranscript({ text: transcriptText, segments: transcriptSegments });

      // Fetch short-lived presigned audio URL
      if (
        loadedCall?.recording?.storageKey ||
        loadedCall?.recordingUrl ||
        loadedCall?.recording?.url
      ) {
        getCallAudioUrl(token, callId)
          .then((res) => setSignedAudioUrl(res.audioUrl))
          .catch(() => setSignedAudioUrl(null));
      }

      const summary: Partial<AiSummary> = loadedCall?.aiSummary ?? {};
      setEditedSummary({
        shortSummary: summary.shortSummary ?? loadedCall?.summary ?? '',
        keyDiscussionPoints: summary.keyDiscussionPoints ?? (loadedCall as any)?.keyDiscussionPoints ?? [],
        academicProgress: summary.academicProgress ?? '',
        personalDevelopment: summary.personalDevelopment ?? '',
        challenges: summary.challenges ?? [],
        achievements: summary.achievements ?? [],
        actionItems: summary.actionItems ?? (loadedCall as any)?.actionItems ?? [],
        mentorCommitments: summary.mentorCommitments ?? [],
        menteeCommitments: summary.menteeCommitments ?? [],
        followUpTopics: summary.followUpTopics ?? (loadedCall as any)?.followUpRecommendations ?? [],
        topicsDiscussed: summary.topicsDiscussed ?? (loadedCall as any)?.topicsDiscussed ?? [],
      });
      return { call: loadedCall, job: loadedJob };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call');
      return null;
    } finally {
      setLoading(false);
    }
  }, [callId, token]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const isCompleted = Boolean(
    job?.status === 'COMPLETED' ||
    job?.processingStatus === 'completed' ||
    call?.processingStatus === 'completed' ||
    call?.aiStatus === 'completed' ||
    (Boolean(call?.summary || call?.aiSummary?.shortSummary) && Boolean(transcript.text || call?.transcript || call?.transcription?.text))
  );

  const isFailed = Boolean(
    !isCompleted &&
    (job?.status === 'FAILED' ||
     job?.processingStatus === 'failed' ||
     call?.processingStatus === 'failed' ||
     call?.aiStatus === 'failed')
  );

  const isProcessing = Boolean(
    !isCompleted &&
    !isFailed &&
    (job?.status === 'PROCESSING' ||
     job?.status === 'PENDING' ||
     job?.processingStatus === 'queued' ||
     job?.processingStatus === 'processing' ||
     call?.processingStatus === 'queued' ||
     call?.processingStatus === 'processing' ||
     call?.aiStatus === 'pending' ||
     call?.aiStatus === 'processing')
  );

  const startPolling = useCallback(() => {
    if (!callId) return;
    stopPolling();

    console.info(`[CALL_STATUS_POLL] Initializing polling for callId=${callId}`);

    pollRef.current = setInterval(async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        console.info(`[CALL_STATUS_POLL] Polling status for callId=${callId}`);
        const jobData = await getCallJobStatus(token, callId);
        console.info(`[CALL_STATUS_UPDATE] Received status for callId=${callId}: stage=${jobData.stage} status=${jobData.status} processingStatus=${jobData.processingStatus} progress=${jobData.progress}%`);
        setJob(jobData);

        const completed =
          jobData.status === 'COMPLETED' ||
          jobData.processingStatus === 'completed' ||
          jobData.progress === 100;

        const failed =
          jobData.status === 'FAILED' ||
          jobData.processingStatus === 'failed';

        if (completed) {
          console.info(`[CALL_PROCESSING_COMPLETED] Processing finished for callId=${callId}`);
          stopPolling();
          await loadData();
        } else if (failed) {
          console.info(`[CALL_PROCESSING_FAILED] Processing failed for callId=${callId}: ${jobData.error || 'Unknown error'}`);
          stopPolling();
          await loadData();
        }
      } catch (err) {
        console.warn(`[CALL_STATUS_POLL] Status polling error for callId=${callId}:`, err);
      } finally {
        isPollingRef.current = false;
      }
    }, 3000);
  }, [callId, token, stopPolling, loadData]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Manage polling lifecycle based on processing state
  useEffect(() => {
    if (isProcessing) {
      startPolling();
    } else {
      stopPolling();
    }
    return () => {
      stopPolling();
    };
  }, [isProcessing, startPolling, stopPolling]);

  const handleRetry = async () => {
    if (!callId) return;
    setIsRetrying(true);
    setFeedback(null);
    try {
      await retryCallProcessing(token, callId);
      setFeedback({ msg: 'Processing retried. Background pipeline has restarted.', type: 'success' });
      setJob({
        stage: 'UPLOAD',
        status: 'PENDING',
        processingStatus: 'queued',
        progress: 0,
        stageStatus: {
          upload: 'COMPLETED',
          audioProcessing: 'PENDING',
          transcription: 'PENDING',
          summary: 'PENDING',
          mentorReview: 'PENDING',
        },
      });
      setCall((prev) => prev ? { ...prev, processingStatus: 'queued', aiStatus: 'pending' } : prev);
      startPolling();
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Retry failed', type: 'error' });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleApprove = async () => {
    if (!callId) return;
    setIsApproving(true);
    try {
      await approveCallSummary(token, callId, editedSummary as any);
      setFeedback({ msg: 'Summary approved! This is now the official record.', type: 'success' });
      setCall((prev) => prev ? { ...prev, reviewStatus: 'Approved' } : prev);
      setIsEditing(false);
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Approval failed', type: 'error' });
    } finally {
      setIsApproving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!callId || !editedSummary) return;
    setIsSaving(true);
    try {
      await updateCallSummary(token, callId, {
        summary: editedSummary.shortSummary,
        keyDiscussionPoints: editedSummary.keyDiscussionPoints,
        actionItems: editedSummary.actionItems,
        followUpRecommendations: editedSummary.followUpTopics,
        topicsDiscussed: editedSummary.topicsDiscussed,
      });
      setFeedback({ msg: 'Draft saved successfully.', type: 'success' });
      setIsEditing(false);
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdminDelete = async () => {
    if (!adminDeleteTarget || !callId) return;
    setIsAdminDeleting(true);
    try {
      if (adminDeleteTarget === 'ENTIRE_CALL') {
        await deleteCall(token, callId);
        navigate('/admin/calls', { replace: true });
        return;
      } else if (adminDeleteTarget === 'RECORDING') {
        await deleteCallRecording(token, callId);
        setFeedback({ msg: 'Recording deleted successfully.', type: 'success' });
      } else if (adminDeleteTarget === 'SUMMARY') {
        await deleteCallSummary(token, callId);
        setFeedback({ msg: 'Summary deleted successfully.', type: 'success' });
      } else if (adminDeleteTarget === 'INTELLIGENCE') {
        await deleteCallIntelligence(token, callId);
        setFeedback({ msg: 'AI intelligence analysis deleted successfully.', type: 'success' });
      }
      setAdminDeleteTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Deletion failed.', type: 'error' });
    } finally {
      setIsAdminDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="call-intel-loading">
        <Loader size={32} className="spin" />
        <p>Loading call intelligence…</p>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="call-intel-error">
        <AlertTriangle size={32} />
        <p>{error ?? 'Call not found'}</p>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    );
  }

  const isApproved = call.reviewStatus === 'Approved';
  const hasTranscript = Boolean(transcript.text || transcript.segments.length);

  return (
    <div className="call-intel-page">
      {/* Topbar */}
      <div className="call-intel-topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="call-intel-meta" style={{ flexWrap: 'wrap', gap: 10 }}>
          <span><Calendar size={14} /> Call Date: {formatDateOnly(call.date)}</span>
          <span><Upload size={14} /> Uploaded: {formatDateTime(call.uploadedAt || call.createdAt)}</span>
          <span><Clock size={14} /> {call.duration} mins</span>
          <span className={`status-badge ${isApproved ? 'status-approved' : isProcessing ? 'status-processing' : 'status-pending'}`}>
            {isApproved ? (
              <><CheckCircle size={12} /> Approved</>
            ) : isProcessing ? (
              <><Loader size={12} className="spin" /> {job?.status === 'PENDING' || job?.processingStatus === 'queued' ? 'Queued' : 'Processing'}</>
            ) : (
              <><Sparkles size={12} /> Pending Review</>
            )}
          </span>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
            {(call.recording?.storageKey || call.recordingUrl || call.recording?.url) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '4px 10px', border: '1px solid rgba(199,92,92,0.3)' }}
                onClick={() => setAdminDeleteTarget('RECORDING')}
              >
                <Trash2 size={13} /> Delete Recording
              </button>
            )}
            {Boolean(call.summary || call.aiSummary?.shortSummary) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '4px 10px', border: '1px solid rgba(199,92,92,0.3)' }}
                onClick={() => setAdminDeleteTarget('SUMMARY')}
              >
                <Trash2 size={13} /> Delete Summary
              </button>
            )}
            {Boolean(call.aiSummary || (call.topicsDiscussed && call.topicsDiscussed.length > 0)) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '4px 10px', border: '1px solid rgba(199,92,92,0.3)' }}
                onClick={() => setAdminDeleteTarget('INTELLIGENCE')}
              >
                <Trash2 size={13} /> Delete Intelligence
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: '#fff', background: 'var(--danger)', fontSize: '0.8rem', padding: '4px 12px', border: 'none' }}
              onClick={() => setAdminDeleteTarget('ENTIRE_CALL')}
            >
              <Trash2 size={13} /> Delete Call
            </button>
          </div>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`alert-banner ${feedback.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          {feedback.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          {feedback.msg}
        </div>
      )}

      {/* Processing state */}
      {isProcessing && (
        <div className="wizard-card processing-card" style={{ marginBottom: '1.5rem' }}>
          <div className="processing-header">
            <div className="processing-pulse" />
            <h2 className="wizard-card-title"><Brain size={20} /> AI is processing this call…</h2>
          </div>
          <div className="pipeline-bar-outer">
            <div className="pipeline-bar-fill" style={{ width: `${job?.progress ?? 0}%` }} />
          </div>
          <p className="pipeline-percent">{job?.progress ?? 0}% — {job?.stage ?? 'UPLOAD'}</p>
        </div>
      )}

      {/* Failed state with Retry button */}
      {isFailed && (
        <div className="wizard-card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--danger)', background: 'rgba(239,68,68,0.04)' }}>
          <div className="call-failed-row">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <AlertTriangle size={24} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--danger)', fontWeight: 700 }}>
                  Call Processing Failed
                </h3>
                <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  {job?.error || 'An error occurred during audio transcription or AI summary generation.'}
                </p>
                <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {transcript.text ? 'Transcript is preserved. You can retry AI summarization.' : 'You can retry the processing pipeline.'}
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={isRetrying}
              onClick={handleRetry}
            >
              {isRetrying ? (
                <>
                  <Loader size={16} className="spin" /> Retrying…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Retry Processing
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Call Overview & Audio Player Card (Section 1 & 15) ─────────────── */}
      <div className="summary-card" style={{ marginBottom: '1.5rem', padding: '18px 22px' }}>
        <div className="call-overview-row">
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Mentorship Session Details
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
              <div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Mentee: </span>
                <strong style={{ fontSize: '1.05rem' }}>{call.menteeName || 'Mentee'}</strong>
                {call.menteeStandard && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}> ({call.menteeStandard})</span>}
              </div>
              <span style={{ color: 'var(--border)' }}>•</span>
              <div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Mentor: </span>
                <strong style={{ fontSize: '1.05rem' }}>{call.mentorName || 'Mentor'}</strong>
              </div>
              <span style={{ color: 'var(--border)' }}>•</span>
              <div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Call Date: </span>
                <strong>{formatDateOnly(call.date)}</strong>
              </div>
              <span style={{ color: 'var(--border)' }}>•</span>
              <div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Uploaded: </span>
                <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatDateTime(call.uploadedAt || call.createdAt)}</strong>
              </div>
              <span style={{ color: 'var(--border)' }}>•</span>
              <div>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Duration: </span>
                <strong>{call.duration} minutes</strong>
              </div>
            </div>
          </div>

          {/* Secure Audio Player */}
          <div className="call-audio-player-wrap">
            {Boolean(signedAudioUrl || call.recording?.storageKey || call.recordingUrl || call.recording?.url) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 420 }}>
                <Volume2 size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                {signedAudioUrl ? (
                  <audio
                    controls
                    src={signedAudioUrl}
                    style={{ width: '100%', height: 38 }}
                    preload="metadata"
                  />
                ) : (
                  <span className="muted" style={{ fontSize: '0.85rem' }}>Loading secure audio player…</span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <FileText size={16} />
                <span>Notes-only session (No recording audio file)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="intel-tabs">
        <button className={`intel-tab ${activeTab === 'summary' ? 'intel-tab-active' : ''}`} onClick={() => setActiveTab('summary')}>
          <Brain size={15} /> AI Summary
        </button>
        <button className={`intel-tab ${activeTab === 'transcript' ? 'intel-tab-active' : ''}`} onClick={() => setActiveTab('transcript')}>
          <FileText size={15} /> Transcript {hasTranscript && <span className="tab-badge">●</span>}
        </button>
        <button className={`intel-tab ${activeTab === 'history' ? 'intel-tab-active' : ''}`} onClick={() => setActiveTab('history')}>
          <Clock size={15} /> Version History
        </button>
      </div>

      {/* ── TAB: AI Summary ────────────────────────────────────────────────── */}
      {activeTab === 'summary' && editedSummary && (
        <div className="intel-content">
          {isApproved ? (
            <div
              className="summary-card"
              style={{
                borderLeft: '4px solid var(--success)',
                background: 'rgba(43,138,91,0.06)',
                marginBottom: '1.2rem',
                padding: '14px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckCircle size={22} color="var(--success)" />
                <div>
                  <strong style={{ color: 'var(--success)', fontSize: '0.95rem' }}>MENTOR APPROVED OFFICIAL RECORD</strong>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Approved by {call.mentorName || 'Mentor'} · This finalized summary is now the official mentorship record.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="review-ai-banner" style={{ marginBottom: '1.2rem' }}>
              <Sparkles size={18} />
              <div>
                <strong>AI GENERATED SUMMARY — Pending Mentor Approval</strong>
                <p>This summary was automatically generated by AI from the call transcript. Mentors can edit any field before official approval.</p>
              </div>
            </div>
          )}

          <div className="review-grid">
            <div className="review-col">
              <div className="review-section">
                <div className="review-section-header">
                  <h3><FileText size={16} /> Session Summary</h3>
                  {!isApproved && !isEditing && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
                      <Edit3 size={14} /> Edit
                    </button>
                  )}
                  {isEditing && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                      <button className="btn btn-secondary btn-sm" onClick={handleSaveDraft} disabled={isSaving}>
                        {isSaving ? <Loader size={14} className="spin" /> : 'Save Draft'}
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <textarea className="field-textarea" rows={5} value={editedSummary.shortSummary}
                    onChange={(e) => setEditedSummary((p) => p && { ...p, shortSummary: e.target.value })} />
                ) : (
                  <p className="review-text">{editedSummary.shortSummary || '—'}</p>
                )}
              </div>

              {editedSummary.academicProgress && (
                <div className="review-section">
                  <h3>Academic Progress</h3>
                  {isEditing ? (
                    <textarea className="field-textarea" rows={3} value={editedSummary.academicProgress}
                      onChange={(e) => setEditedSummary((p) => p && { ...p, academicProgress: e.target.value })} />
                  ) : (
                    <p className="review-text">{editedSummary.academicProgress}</p>
                  )}
                </div>
              )}

              {editedSummary.personalDevelopment && (
                <div className="review-section">
                  <h3>Personal Development</h3>
                  {isEditing ? (
                    <textarea className="field-textarea" rows={3} value={editedSummary.personalDevelopment}
                      onChange={(e) => setEditedSummary((p) => p && { ...p, personalDevelopment: e.target.value })} />
                  ) : (
                    <p className="review-text">{editedSummary.personalDevelopment}</p>
                  )}
                </div>
              )}

              {call.mentorNotes && (
                <div className="review-section mentor-notes-section">
                  <h3><User size={15} /> Mentor Notes</h3>
                  <p className="review-text">{call.mentorNotes}</p>
                </div>
              )}
            </div>

            <div className="review-col">
              {isEditing ? (
                <>
                  <EditableList label="Key Discussion Points" items={editedSummary.keyDiscussionPoints} onChange={(i) => setEditedSummary((p) => p && { ...p, keyDiscussionPoints: i })} />
                  <EditableList label="Achievements" items={editedSummary.achievements} onChange={(i) => setEditedSummary((p) => p && { ...p, achievements: i })} />
                  <EditableList label="Challenges" items={editedSummary.challenges} onChange={(i) => setEditedSummary((p) => p && { ...p, challenges: i })} />
                  <EditableList label="Action Items (Mentee)" items={editedSummary.actionItems} onChange={(i) => setEditedSummary((p) => p && { ...p, actionItems: i })} />
                  <EditableList label="Mentor Commitments" items={editedSummary.mentorCommitments} onChange={(i) => setEditedSummary((p) => p && { ...p, mentorCommitments: i })} />
                  <EditableList label="Follow-Up Topics" items={editedSummary.followUpTopics} onChange={(i) => setEditedSummary((p) => p && { ...p, followUpTopics: i })} />
                </>
              ) : (
                <>
                  <SummaryList title="Key Discussion Points" items={editedSummary.keyDiscussionPoints} color="blue" />
                  <SummaryList title="Achievements" items={editedSummary.achievements} color="green" />
                  <SummaryList title="Challenges" items={editedSummary.challenges} color="amber" />
                  <SummaryList title="Action Items" items={editedSummary.actionItems} color="purple" />
                  <SummaryList title="Mentor Commitments" items={editedSummary.mentorCommitments} color="indigo" />
                  <SummaryList title="Follow-Up Topics" items={editedSummary.followUpTopics} color="teal" />
                </>
              )}

              {editedSummary.topicsDiscussed?.length > 0 && (
                <div className="review-section">
                  <h3>Topics Discussed</h3>
                  <div className="tag-group">
                    {editedSummary.topicsDiscussed.map((t, i) => <span key={i} className="tag">{t}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Approval bar */}
          {!isApproved && (
            <div className="approval-bar">
              <div className="approval-bar-info">
                <strong>Ready to approve?</strong>
                <span>Once approved, this becomes the official mentorship record.</span>
              </div>
              <div className="approval-bar-actions">
                {!isEditing && (
                  <button className="btn btn-outline" onClick={() => setIsEditing(true)}>
                    <Edit3 size={15} /> Edit Summary
                  </button>
                )}
                <button
                  id="approve-summary-btn"
                  className="btn btn-success"
                  disabled={isApproving || isProcessing}
                  onClick={handleApprove}
                >
                  {isApproving ? <><Loader size={16} className="spin" /> Approving…</> : <><ThumbsUp size={16} /> Approve Summary</>}
                </button>
              </div>
            </div>
          )}

          {isApproved && (
            <div className="approved-banner">
              <CheckCircle size={20} />
              <div>
                <strong>Approved</strong>
                <span>This summary has been approved and is the official record.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Transcript ─────────────────────────────────────────────────── */}
      {activeTab === 'transcript' && (
        <div className="intel-content">
          {!hasTranscript ? (
            <div className="empty-state">
              <FileText size={40} />
              <h3>No Transcript Available</h3>
              <p>
                {call.aiStatus === 'pending' || isProcessing
                  ? 'The call is still being processed. Check back shortly.'
                  : 'No audio recording was provided for this call, so no transcript was generated.'}
              </p>
            </div>
          ) : (
            <>
              {/* Segment-level transcript */}
              {transcript.segments.length > 0 ? (
                <div className="transcript-container">
                  <div className="transcript-header" onClick={() => setTranscriptOpen((p) => !p)}>
                    <h3><PlayCircle size={16} /> Conversation Transcript ({transcript.segments.length} segments)</h3>
                    {transcriptOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                  {transcriptOpen && (
                    <div className="transcript-segments">
                      {transcript.segments.map((seg, i) => (
                        <div key={i} className={`transcript-segment ${seg.speaker?.toLowerCase().includes('mentor') || seg.speaker === 'Speaker 1' ? 'segment-mentor' : 'segment-mentee'}`}>
                          <div className="segment-meta">
                            <SpeakerBadge speaker={seg.speaker} />
                            <span className="segment-time">{formatSeconds(seg.start)}</span>
                          </div>
                          <p className="segment-text">{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Plain text transcript */
                <div className="transcript-container">
                  <div className="transcript-header">
                    <h3><FileText size={16} /> Full Transcript</h3>
                  </div>
                  <div className="transcript-plain">
                    <p>{transcript.text}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: Version History ─────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="intel-content">
          {!call.summaryVersions?.length ? (
            <div className="empty-state">
              <Clock size={40} />
              <h3>No Version History</h3>
              <p>Edits and approvals will appear here once the AI summary is generated.</p>
            </div>
          ) : (
            <div className="version-history">
              {[...call.summaryVersions].reverse().map((v, i) => (
                <div key={i} className={`version-entry version-${v.type.toLowerCase()}`}>
                  <div className="version-badge">
                    {v.type === 'AI' ? <Brain size={14} /> : v.type === 'APPROVED' ? <CheckCircle size={14} /> : <Edit3 size={14} />}
                    <span>v{v.version} — {v.type.replace('_', ' ')}</span>
                  </div>
                  <div className="version-meta">
                    <span>{new Date(v.timestamp).toLocaleString()}</span>
                    <span>by {v.author === 'system' ? 'AI' : v.author}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Admin Delete Modal ──────────────────────────────────────────────── */}
      {adminDeleteTarget && (
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
            if (e.target === e.currentTarget && !isAdminDeleting) {
              setAdminDeleteTarget(null);
            }
          }}
        >
          <div
            className="form-card"
            style={{
              width: '100%',
              maxWidth: 'min(calc(100vw - 24px), 480px)',
              maxHeight: 'calc(100dvh - 32px)',
              overflowY: 'auto',
              position: 'relative',
              borderRadius: 24,
              padding: '24px 20px',
              textAlign: 'center',
              boxShadow: '0 28px 70px rgba(0,0,0,0.3)',
              boxSizing: 'border-box',
            }}
          >
            {!isAdminDeleting && (
              <button
                onClick={() => setAdminDeleteTarget(null)}
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
              >
                <X size={20} />
              </button>
            )}

            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(199,92,92,0.12)', color: 'var(--danger)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={28} />
            </div>

            <h3 style={{ fontWeight: 800, fontSize: 'clamp(1.15rem, 3.5vw, 1.35rem)', marginBottom: 10, letterSpacing: '-0.03em' }}>
              {adminDeleteTarget === 'ENTIRE_CALL'
                ? 'Delete Entire Call?'
                : adminDeleteTarget === 'RECORDING'
                ? 'Delete Audio Recording?'
                : adminDeleteTarget === 'SUMMARY'
                ? 'Delete Call Summary?'
                : 'Delete Call Intelligence?'}
            </h3>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 20 }}>
              {adminDeleteTarget === 'ENTIRE_CALL'
                ? 'This will permanently delete this call record, its audio recording in cloud storage, transcripts, and AI intelligence analysis. This cannot be undone.'
                : adminDeleteTarget === 'RECORDING'
                ? 'The audio file will be deleted from cloud storage. Transcripts, summaries, and notes will remain intact.'
                : adminDeleteTarget === 'SUMMARY'
                ? 'The summary and its revision versions will be cleared from this call.'
                : 'The AI intelligence analysis, topics discussed, and action items will be cleared.'}
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAdminDeleteTarget(null)}
                disabled={isAdminDeleting}
                style={{ flex: '1 1 110px', minHeight: 44, justifyContent: 'center' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'var(--danger)',
                  borderColor: 'var(--danger)',
                  flex: '1 1 140px',
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'center',
                  opacity: isAdminDeleting ? 0.75 : 1,
                }}
                onClick={handleAdminDelete}
                disabled={isAdminDeleting}
              >
                {isAdminDeleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
