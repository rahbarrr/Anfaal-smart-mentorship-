import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyMentees,
  getPresignedUploadUrl,
  uploadFileDirectToS3,
  uploadCall,
  completeCallUpload,
  retryCallProcessing,
  getCallJobStatus,
  getCallDetail,
  approveCallSummary,
  updateCallSummary,
} from '../lib/api';
import {
  Upload,
  CheckCircle,
  Loader,
  AlertTriangle,
  Mic,
  Brain,
  FileText,
  Clock,
  ChevronRight,
  Sparkles,
  User,
  Calendar,
  ThumbsUp,
  Edit3,
  X,
  Plus,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
type Mentee = { id: string; name: string };

type AiSummary = {
  shortSummary: string;
  keyDiscussionPoints: string[];
  academicProgress: string;
  personalDevelopment: string;
  challenges: string[];
  achievements: string[];
  actionItems: string[];
  mentorCommitments: string[];
  menteeCommitments: string[];
  followUpTopics: string[];
  topicsDiscussed: string[];
};

type JobStatus = {
  stage: 'UPLOAD' | 'TRANSCRIPTION' | 'SUMMARY' | 'COMPLETE';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  stageStatus: {
    upload: string;
    audioProcessing: string;
    transcription: string;
    summary: string;
    mentorReview: string;
  };
  error?: string;
};

const WIZARD_STEPS = ['Record Details', 'Upload Audio', 'AI Processing', 'Review & Approve'];
const ACCEPTED_TYPES = '.mp3,.wav,.m4a,.mp4,audio/*,video/*';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const SERVER_UPLOAD_FALLBACK_MAX_SIZE = 25 * 1024 * 1024;

// Browsers and mobile share sheets may report an empty or generic MIME type
// for valid audio files. Send a stable audio MIME type inferred from the name.
function getRecordingMimeType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    mp3: 'audio/mpeg', mpeg: 'audio/mpeg', mpga: 'audio/mpeg',
    wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4',
    ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac',
  };
  if (file.type.startsWith('audio/') || file.type.startsWith('video/')) return file.type;
  return (extension && mimeByExtension[extension]) || 'audio/mpeg';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem('');
    }
  };

  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  const updateItem = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? value : item)));

  return (
    <div className="editable-list">
      <label className="field-label">{label}</label>
      <div className="editable-list-items">
        {items.map((item, i) => (
          <div key={i} className="editable-list-row">
            <input
              className="editable-list-input"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
            />
            <button
              className="editable-list-remove"
              onClick={() => removeItem(i)}
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="editable-list-add-row">
          <input
            className="editable-list-input"
            placeholder={`Add ${label.toLowerCase()}…`}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={addItem}>
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline progress bar ────────────────────────────────────────────────────
function PipelineProgress({ job }: { job: JobStatus }) {
  const stages = [
    { key: 'upload', label: 'Upload', icon: Upload },
    { key: 'audioProcessing', label: 'Audio Processing', icon: Mic },
    { key: 'transcription', label: 'Transcription', icon: FileText },
    { key: 'summary', label: 'AI Summary', icon: Brain },
  ];

  return (
    <div className="pipeline-wrapper">
      <div className="pipeline-bar-outer">
        <div
          className="pipeline-bar-fill"
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <p className="pipeline-percent">{job.progress}%</p>
      <div className="pipeline-stages">
        {stages.map(({ key, label, icon: Icon }) => {
          const status = job.stageStatus[key as keyof JobStatus['stageStatus']];
          const isCompleted = status === 'COMPLETED';
          const isProcessing = status === 'PROCESSING';
          const isFailed = status === 'FAILED';
          return (
            <div
              key={key}
              className={`pipeline-stage ${isCompleted ? 'stage-done' : isProcessing ? 'stage-active' : isFailed ? 'stage-failed' : 'stage-pending'}`}
            >
              {isProcessing ? (
                <Loader size={18} className="spin" />
              ) : isCompleted ? (
                <CheckCircle size={18} />
              ) : isFailed ? (
                <AlertTriangle size={18} />
              ) : (
                <Icon size={18} />
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function UploadCallPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [form, setForm] = useState({
    menteeId: '',
    date: new Date().toISOString().slice(0, 10),
    duration: 30,
    mentorNotes: '',
  });
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCallId, setCreatedCallId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [callDetail, setCallDetail] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState<AiSummary | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  // Load mentees
  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;
    getMyMentees(token)
      .then((res) => {
        const loaded = (res.mentees ?? []).map((m: any) => ({ id: m.id, name: m.name }));
        setMentees(loaded);
        if (loaded.length > 0) setForm((p) => ({ ...p, menteeId: loaded[0].id }));
      })
      .catch(() => {});
  }, []);

  // Poll job status
  const startPolling = useCallback(
    (callId: string) => {
      const token = localStorage.getItem('anfaal-token') ?? '';
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);

      pollTimerRef.current = setInterval(async () => {
        try {
          const job = await getCallJobStatus(token, callId);
          setJobStatus(job);

          if (job.status === 'COMPLETED') {
            clearInterval(pollTimerRef.current!);
            // Load full call detail for review
            const detail = await getCallDetail(token, callId);
            setCallDetail(detail.call);
            setEditedSummary(detail.call?.aiSummary ?? null);
            setCurrentStep(3);
          } else if (job.status === 'FAILED') {
            clearInterval(pollTimerRef.current!);
            setFeedback({ msg: `Processing failed: ${job.error ?? 'Unknown error'}`, type: 'error' });
          }
        } catch (_) {
          // Silently retry
        }
      }, 5000);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setFeedback({ msg: 'File is too large. Maximum size is 100 MB.', type: 'error' });
      return;
    }
    setSelectedFile(file);
    setFeedback(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFileSelect(file);
  };

  const handleRetry = async () => {
    if (!createdCallId) return;
    const token = localStorage.getItem('anfaal-token') ?? '';
    setIsRetrying(true);
    setFeedback(null);
    try {
      await retryCallProcessing(token, createdCallId);
      setJobStatus((prev) =>
        prev
          ? { ...prev, status: 'PROCESSING', error: undefined }
          : { stage: 'UPLOAD', status: 'PROCESSING', progress: 10, stageStatus: { upload: 'COMPLETED', audioProcessing: 'PROCESSING', transcription: 'PENDING', summary: 'PENDING', mentorReview: 'PENDING' } },
      );
      startPolling(createdCallId);
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Retry failed', type: 'error' });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSubmit = async () => {
    const token = localStorage.getItem('anfaal-token') ?? '';
    if (!form.menteeId) {
      setFeedback({ msg: 'Please select a mentee.', type: 'error' });
      return;
    }
    if (!consentChecked) {
      setFeedback({ msg: 'Please confirm the mentee consented to this recording.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    setCurrentStep(2);

    try {
      let storageKey: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      let mimeType: string | undefined;
      let result: { callId: string } | undefined;

      if (selectedFile) {
        setUploadStatusText('Requesting secure direct S3 upload credentials…');
        const presignRes = await getPresignedUploadUrl(token, {
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: getRecordingMimeType(selectedFile),
          menteeId: form.menteeId,
        });

        storageKey = presignRes.storageKey;
        fileName = presignRes.fileName;
        fileSize = presignRes.fileSize;
        mimeType = presignRes.mimeType;

        setUploadStatusText('Uploading recording directly to private S3 bucket…');
        try {
          await uploadFileDirectToS3(presignRes.uploadUrl, selectedFile, mimeType, (pct) => {
            setUploadProgress(pct);
          });
        } catch (error) {
          const isS3Forbidden = error instanceof Error && /direct s3 upload failed with status 403/i.test(error.message);
          if (!isS3Forbidden || selectedFile.size > SERVER_UPLOAD_FALLBACK_MAX_SIZE) {
            throw error;
          }

          // A bucket CORS rule can reject an otherwise valid browser presigned PUT.
          // For smaller recordings, use the authenticated API instead; it uploads to
          // S3 server-to-server and therefore does not depend on browser bucket CORS.
          setUploadStatusText('Direct S3 upload was blocked; uploading securely through the server…');
          result = await uploadCall(
            token,
            {
              menteeId: form.menteeId,
              duration: form.duration,
              date: form.date,
              mentorNotes: form.mentorNotes,
            },
            selectedFile,
          );
        }
      }

      if (!result) {
        setUploadStatusText('Finalizing call session & queueing background AI pipeline…');
        result = await completeCallUpload(token, {
          storageKey,
          fileName,
          fileSize,
          mimeType,
          menteeId: form.menteeId,
          duration: form.duration,
          date: form.date,
          mentorNotes: form.mentorNotes,
        });
      }

      setCreatedCallId(result.callId);
      setJobStatus({
        stage: 'UPLOAD',
        status: 'PROCESSING',
        progress: 5,
        stageStatus: {
          upload: 'COMPLETED',
          audioProcessing: 'PENDING',
          transcription: 'PENDING',
          summary: 'PENDING',
          mentorReview: 'PENDING',
        },
      });
      startPolling(result.callId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed.';
      setFeedback({ msg, type: 'error' });
      setCurrentStep(1);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleApprove = async () => {
    if (!createdCallId) return;
    const token = localStorage.getItem('anfaal-token') ?? '';
    setIsApproving(true);
    try {
      await approveCallSummary(token, createdCallId, editedSummary as any);
      setFeedback({ msg: 'Summary approved and saved as the official record!', type: 'success' });
      setTimeout(() => navigate('/mentor/calls'), 2000);
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Approval failed.', type: 'error' });
    } finally {
      setIsApproving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!createdCallId || !editedSummary) return;
    const token = localStorage.getItem('anfaal-token') ?? '';
    try {
      await updateCallSummary(token, createdCallId, {
        summary: editedSummary.shortSummary,
        keyDiscussionPoints: editedSummary.keyDiscussionPoints,
        actionItems: editedSummary.actionItems,
        followUpRecommendations: editedSummary.followUpTopics,
        topicsDiscussed: editedSummary.topicsDiscussed,
      });
      setFeedback({ msg: 'Draft saved.', type: 'success' });
      setIsEditing(false);
    } catch (err) {
      setFeedback({ msg: err instanceof Error ? err.message : 'Save failed.', type: 'error' });
    }
  };

  const selectedMenteeName = mentees.find((m) => m.id === form.menteeId)?.name ?? 'Unknown Mentee';

  return (
    <div className="upload-call-page">
      {/* Header */}
      <div className="upload-header">
        <div className="upload-header-icon">
          <Mic size={28} />
        </div>
        <div>
          <h1 className="upload-title">Upload Mentorship Call</h1>
          <p className="upload-subtitle">AI will transcribe and summarise the call for your review</p>
        </div>
      </div>

      {/* Wizard Steps */}
      <div className="wizard-steps">
        {WIZARD_STEPS.map((step, index) => (
          <div
            key={index}
            className={`wizard-step ${index === currentStep ? 'wizard-step-active' : index < currentStep ? 'wizard-step-done' : 'wizard-step-pending'}`}
          >
            <div className="wizard-step-circle">
              {index < currentStep ? <CheckCircle size={16} /> : <span>{index + 1}</span>}
            </div>
            <span className="wizard-step-label">{step}</span>
            {index < WIZARD_STEPS.length - 1 && <ChevronRight size={16} className="wizard-step-arrow" />}
          </div>
        ))}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`alert-banner ${feedback.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          {feedback.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          {feedback.msg}
        </div>
      )}

      {/* ── STEP 0: Record Details ───────────────────────────────────────── */}
      {currentStep === 0 && (
        <div className="wizard-card">
          <h2 className="wizard-card-title">
            <User size={20} /> Call Details
          </h2>

          <div className="form-grid-2">
            <div className="form-field">
              <label className="field-label">Mentee *</label>
              <select
                className="field-select"
                value={form.menteeId}
                onChange={(e) => setForm((p) => ({ ...p, menteeId: e.target.value }))}
              >
                <option value="">Select a mentee…</option>
                {mentees.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {mentees.length === 0 && (
                <p className="field-hint">No mentees assigned yet. Contact your administrator.</p>
              )}
            </div>

            <div className="form-field">
              <label className="field-label">
                <Calendar size={14} /> Call Date
              </label>
              <input
                type="date"
                className="field-input"
                value={form.date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            <div className="form-field">
              <label className="field-label">
                <Clock size={14} /> Duration (minutes) *
              </label>
              <input
                type="number"
                className="field-input"
                value={form.duration}
                min={1}
                max={300}
                onChange={(e) => setForm((p) => ({ ...p, duration: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="form-field">
            <label className="field-label">Mentor Notes (optional)</label>
            <textarea
              className="field-textarea"
              rows={4}
              placeholder="Any notes before the AI processes the call — context, focus areas, key concerns…"
              value={form.mentorNotes}
              onChange={(e) => setForm((p) => ({ ...p, mentorNotes: e.target.value }))}
            />
            <p className="field-hint">
              These notes help the AI generate a more accurate summary. They will NOT appear verbatim in the final record.
            </p>
          </div>

          <button
            id="upload-call-next-btn"
            className="btn btn-primary"
            disabled={!form.menteeId || !form.duration}
            onClick={() => setCurrentStep(1)}
          >
            Next: Upload Recording <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── STEP 1: Upload Audio ─────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="wizard-card">
          <h2 className="wizard-card-title">
            <Upload size={20} /> Upload Recording
          </h2>

          {/* Dropzone */}
          <div
            id="dropzone"
            className={`dropzone ${isDragging ? 'dropzone-dragging' : ''} ${selectedFile ? 'dropzone-has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <div className="dropzone-file-info">
                <div className="dropzone-file-icon">
                  <Mic size={32} />
                </div>
                <div>
                  <p className="dropzone-file-name">{selectedFile.name}</p>
                  <p className="dropzone-file-size">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <Upload size={40} className="dropzone-icon" />
                <p className="dropzone-heading">Drag & drop your recording here</p>
                <p className="dropzone-hint">MP3, WAV, M4A, MP4, WebM — up to 100 MB</p>
                <span className="btn btn-outline btn-sm">Browse Files</span>
              </>
            )}
          </div>

          <p className="field-hint" style={{ marginTop: '0.5rem' }}>
            No recording? You can still submit with mentor notes only — the AI will use your notes to generate a summary.
          </p>

          {/* Consent checkbox */}
          <div className="consent-box">
            <input
              type="checkbox"
              id="consent-check"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
            />
            <label htmlFor="consent-check">
              I confirm the mentee has given consent for this call recording to be processed by AI for the purposes of mentorship reporting.
            </label>
          </div>

          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={() => setCurrentStep(0)}>
              ← Back
            </button>
            <button
              id="upload-call-submit-btn"
              className="btn btn-primary"
              disabled={isSubmitting || !consentChecked}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} className="spin" /> Uploading…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Submit & Process
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: AI Processing (progress polling) ─────────────────────── */}
      {currentStep === 2 && (
        <div className="wizard-card processing-card">
          <div className="processing-header">
            <div className="processing-pulse" />
            <h2 className="wizard-card-title">
              <Brain size={22} /> AI is processing your call…
            </h2>
          </div>
          {uploadStatusText && (
            <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: 12 }}>
              {uploadStatusText}
            </p>
          )}
          {uploadProgress !== null && uploadProgress < 100 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>Direct S3 Upload</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="pipeline-bar-outer">
                <div className="pipeline-bar-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          <p className="processing-subtitle">
            This typically takes 1–5 minutes depending on recording length. You can stay on this page or come back later.
          </p>
          {jobStatus && <PipelineProgress job={jobStatus} />}
          {jobStatus?.status === 'FAILED' && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="alert-banner alert-error" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Call Processing Failed</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>{jobStatus.error ?? 'An unexpected error occurred during processing.'}</p>
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
          )}
        </div>
      )}

      {/* ── STEP 3: Review & Approve ─────────────────────────────────────── */}
      {currentStep === 3 && callDetail && editedSummary && (
        <div className="review-wrapper">
          {/* Header banner */}
          <div className="review-ai-banner">
            <Sparkles size={18} />
            <div>
              <strong>AI Summary Ready for Review</strong>
              <p>
                This summary was generated by AI and has not been confirmed. Review it carefully before approving — your approval makes it the official record.
              </p>
            </div>
          </div>

          <div className="review-grid">
            {/* Left: Summary */}
            <div className="review-col">
              <div className="review-section">
                <div className="review-section-header">
                  <h3>
                    <FileText size={16} /> Session Summary
                  </h3>
                  {!isEditing && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
                      <Edit3 size={14} /> Edit
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <textarea
                    className="field-textarea"
                    rows={5}
                    value={editedSummary.shortSummary}
                    onChange={(e) =>
                      setEditedSummary((p) => p && { ...p, shortSummary: e.target.value })
                    }
                  />
                ) : (
                  <p className="review-text">{editedSummary.shortSummary}</p>
                )}
              </div>

              {editedSummary.academicProgress && (
                <div className="review-section">
                  <h3>Academic Progress</h3>
                  {isEditing ? (
                    <textarea
                      className="field-textarea"
                      rows={3}
                      value={editedSummary.academicProgress}
                      onChange={(e) =>
                        setEditedSummary((p) => p && { ...p, academicProgress: e.target.value })
                      }
                    />
                  ) : (
                    <p className="review-text">{editedSummary.academicProgress}</p>
                  )}
                </div>
              )}

              {editedSummary.personalDevelopment && (
                <div className="review-section">
                  <h3>Personal Development</h3>
                  {isEditing ? (
                    <textarea
                      className="field-textarea"
                      rows={3}
                      value={editedSummary.personalDevelopment}
                      onChange={(e) =>
                        setEditedSummary((p) => p && { ...p, personalDevelopment: e.target.value })
                      }
                    />
                  ) : (
                    <p className="review-text">{editedSummary.personalDevelopment}</p>
                  )}
                </div>
              )}

              {isEditing && (
                <div className="edit-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleSaveDraft}>
                    Save Draft
                  </button>
                </div>
              )}
            </div>

            {/* Right: Lists */}
            <div className="review-col">
              {isEditing ? (
                <>
                  <EditableList
                    label="Key Discussion Points"
                    items={editedSummary.keyDiscussionPoints}
                    onChange={(items) => setEditedSummary((p) => p && { ...p, keyDiscussionPoints: items })}
                  />
                  <EditableList
                    label="Challenges"
                    items={editedSummary.challenges}
                    onChange={(items) => setEditedSummary((p) => p && { ...p, challenges: items })}
                  />
                  <EditableList
                    label="Achievements"
                    items={editedSummary.achievements}
                    onChange={(items) => setEditedSummary((p) => p && { ...p, achievements: items })}
                  />
                  <EditableList
                    label="Action Items (Mentee)"
                    items={editedSummary.actionItems}
                    onChange={(items) => setEditedSummary((p) => p && { ...p, actionItems: items })}
                  />
                  <EditableList
                    label="Mentor Commitments"
                    items={editedSummary.mentorCommitments}
                    onChange={(items) => setEditedSummary((p) => p && { ...p, mentorCommitments: items })}
                  />
                  <EditableList
                    label="Follow-Up Topics"
                    items={editedSummary.followUpTopics}
                    onChange={(items) => setEditedSummary((p) => p && { ...p, followUpTopics: items })}
                  />
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

              {/* Topics tags */}
              {editedSummary.topicsDiscussed?.length > 0 && (
                <div className="review-section">
                  <h3>Topics Discussed</h3>
                  <div className="tag-group">
                    {editedSummary.topicsDiscussed.map((t, i) => (
                      <span key={i} className="tag">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Approval bar */}
          <div className="approval-bar">
            <div className="approval-bar-info">
              <strong>Ready to approve?</strong>
              <span>Once approved, this becomes the official mentorship record for {selectedMenteeName}.</span>
            </div>
            <div className="approval-bar-actions">
              <button className="btn btn-ghost" onClick={() => navigate('/mentor/calls')}>
                Save & Exit
              </button>
              <button
                id="approve-summary-btn"
                className="btn btn-success"
                disabled={isApproving}
                onClick={handleApprove}
              >
                {isApproving ? (
                  <>
                    <Loader size={16} className="spin" /> Approving…
                  </>
                ) : (
                  <>
                    <ThumbsUp size={16} /> Approve Summary
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

// ─── Helper: summary list card ────────────────────────────────────────────────
function SummaryList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div className={`review-section summary-list summary-list-${color}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
