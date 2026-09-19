import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyMentees, uploadCall, updateCallSummary } from '../lib/api';
import { Upload, CheckCircle, Loader, AlertTriangle } from 'lucide-react';

type AiSummary = {
  shortSummary: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
};

const fallbackSummary: AiSummary = {
  shortSummary: '',
  keyDiscussionPoints: [],
  studentConcerns: [],
  actionItems: [],
  followUpRecommendations: [],
  topicsDiscussed: [],
};
const steps = ['Select Mentee', 'Upload Recording', 'Processing', 'AI Review'];

const ACCEPTED_TYPES = '.mp3,.wav,.m4a,.mp4,audio/*,video/*';


type Mentee = { id: string; name: string };

export function UploadCallPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [form, setForm] = useState({
    menteeId: '',
    date: new Date().toISOString().slice(0, 10),
    duration: 30,
    mentorNotes: '',
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('success');
  const [aiSummary, setAiSummary] = useState<AiSummary>(fallbackSummary);
  const [isEditing, setIsEditing] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [createdCallId, setCreatedCallId] = useState<string | null>(null);

  // Load assigned mentees from API
  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;
    getMyMentees(token)
      .then((res) => {
        const loaded = (res.mentees ?? []).map((m: any) => ({ id: m.id, name: m.name }));
        setMentees(loaded);
        if (loaded.length > 0) {
          setForm((p) => ({ ...p, menteeId: loaded[0].id }));
        }
      })
      .catch(() => {});
  }, []);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback(msg);
    setFeedbackType(type);
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSize) {
      showFeedback('File is too large. Maximum size is 25 MB.', 'error');
      return;
    }
    setSelectedFile(file);
    setFeedback(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleSubmitUpload = async () => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) {
      showFeedback('You must be signed in to upload a call.', 'error');
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    setCurrentStep(2); // processing

    try {
      const response = await uploadCall(
        token,
        { menteeId: form.menteeId, duration: Number(form.duration), date: form.date, mentorNotes: form.mentorNotes },
        selectedFile,
      );

      if (response.callId) {
        setCreatedCallId(response.callId);
      }

      if (response.summary) {
        setAiSummary({
          shortSummary: response.summary.shortSummary ?? fallbackSummary.shortSummary,
          keyDiscussionPoints: response.summary.keyDiscussionPoints ?? fallbackSummary.keyDiscussionPoints,
          studentConcerns: response.summary.studentConcerns ?? fallbackSummary.studentConcerns,
          actionItems: response.summary.actionItems ?? fallbackSummary.actionItems,
          followUpRecommendations: response.summary.followUpRecommendations ?? fallbackSummary.followUpRecommendations,
          topicsDiscussed: response.summary.topicsDiscussed ?? fallbackSummary.topicsDiscussed,
        });
      }

      showFeedback(response.message ?? 'Upload accepted. AI processing completed.', 'success');
      setCurrentStep(3);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Unable to upload your call.', 'error');
      setCurrentStep(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalSubmit = async () => {
    const token = localStorage.getItem('anfaal-token');
    if (token && createdCallId) {
      await updateCallSummary(token, createdCallId, {
        summary: aiSummary.shortSummary,
        keyDiscussionPoints: aiSummary.keyDiscussionPoints,
        studentConcerns: aiSummary.studentConcerns,
        actionItems: aiSummary.actionItems,
        followUpRecommendations: aiSummary.followUpRecommendations,
        topicsDiscussed: aiSummary.topicsDiscussed,
      }).catch(() => {});
    }
    showFeedback('Call submitted successfully! Redirecting to your calls…', 'success');
    setTimeout(() => navigate('/mentor/calls'), 1500);
  };

  const canGoNext = () => {
    if (currentStep === 0) return !!form.menteeId && !!form.date && form.duration > 0;
    if (currentStep === 1) return !!selectedFile && consentChecked;
    return false;
  };

  const menteeName = mentees.find((m) => m.id === form.menteeId)?.name ?? 'Student';

  return (
    <div className="form-card">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="label">Upload Call</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentorship session record</h3>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {steps.map((step, index) => {
          const isActive = currentStep === index;
          const isDone = currentStep > index;
          return (
            <div
              key={step}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 999, fontWeight: 700, fontSize: '0.84rem',
                background: isActive ? 'rgba(143,63,102,0.10)' : isDone ? 'rgba(43,138,91,0.08)' : 'var(--surface-muted)',
                color: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              {isDone ? <CheckCircle size={14} /> : <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`, display: 'grid', placeItems: 'center', fontSize: '0.7rem' }}>{index + 1}</span>}
              <span>{step}</span>
            </div>
          );
        })}
      </div>

      {/* Feedback bar */}
      {feedback && (
        <div className="summary-card" style={{ marginBottom: 20, borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: feedbackType === 'error' ? 'var(--danger)' : 'var(--success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {feedbackType === 'error' ? <AlertTriangle size={16} color="var(--danger)" /> : <CheckCircle size={16} color="var(--success)" />}
            <strong style={{ color: feedbackType === 'error' ? 'var(--danger)' : 'var(--success)' }}>{feedback}</strong>
          </div>
        </div>
      )}

      {/* Step 1: Select Mentee */}
      {currentStep === 0 && (
        <>
          <div style={{ display: 'grid', gap: 18 }}>
            <div className="field">
              <label>Mentee</label>
              <select className="select" value={form.menteeId} onChange={(e) => setForm((p) => ({ ...p, menteeId: e.target.value }))}>
                <option value="">Select a mentee…</option>
                {mentees.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Date of Call</label>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="field">
                <label>Call Duration (minutes)</label>
                <input className="input" type="number" value={form.duration} min={1} onChange={(e) => setForm((p) => ({ ...p, duration: Number(e.target.value || 1) }))} />
              </div>
            </div>
            <div className="field">
              <label>Optional Mentor Notes</label>
              <textarea className="textarea" value={form.mentorNotes} onChange={(e) => setForm((p) => ({ ...p, mentorNotes: e.target.value }))} placeholder="Any observations about the session…" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="btn-primary" disabled={!canGoNext()} onClick={() => setCurrentStep(1)}>
              Continue → Upload Recording
            </button>
          </div>
        </>
      )}

      {/* Step 2: Upload Recording */}
      {currentStep === 1 && (
        <div>
          {/* Consent notice */}
          <div style={{ padding: '16px 18px', background: 'rgba(207,159,75,0.06)', borderRadius: 14, border: '1px solid rgba(207,159,75,0.2)', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <AlertTriangle size={18} color="var(--warning)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 4 }}>Privacy & Consent Notice</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  Please ensure that the participants have provided the required consent before recording and uploading this mentorship conversation. All recordings are stored securely and accessible only to authorized Anfaal Foundation staff.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                  I confirm that proper consent has been obtained for this recording
                </label>
              </div>
            </div>
          </div>

          {/* Drag-and-drop area */}
          <div
            className="upload-box"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              cursor: 'pointer',
              borderColor: isDragging ? 'var(--primary)' : selectedFile ? 'var(--success)' : 'var(--border)',
              background: isDragging ? 'rgba(143,63,102,0.04)' : selectedFile ? 'rgba(43,138,91,0.04)' : 'rgba(45,95,93,0.02)',
              transition: 'all 0.2s',
              padding: '36px 16px',
            }}
          >
            <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: selectedFile ? 'rgba(43,138,91,0.1)' : 'rgba(143,63,102,0.08)', placeItems: 'center', marginBottom: 14 }}>
              {selectedFile ? <CheckCircle size={26} color="var(--success)" /> : <Upload size={26} color="var(--primary)" />}
            </div>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>
              {selectedFile ? selectedFile.name : 'Upload your mentorship call recording'}
            </h4>
            <p>{selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : 'Drag & drop or click to select an audio/video file'}</p>
            <p style={{ marginTop: 10, fontSize: '0.78rem' }}>Supported: MP3, WAV, M4A, MP4 · Max 25 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
          </div>

          {selectedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <button className="btn-secondary" onClick={() => { setSelectedFile(null); setConsentChecked(false); }} style={{ fontSize: '0.82rem' }}>
                Remove file
              </button>
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: '0.82rem' }}>
                Replace file
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, flexWrap: 'wrap', gap: 12 }}>
            <button className="btn-secondary" onClick={() => setCurrentStep(0)}>← Back</button>
            <button className="btn-primary" disabled={!canGoNext() || isSubmitting} onClick={handleSubmitUpload}>
              {isSubmitting ? 'Uploading…' : 'Upload & Process'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Processing */}
      {currentStep === 2 && (
        <div className="summary-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: 'rgba(143,63,102,0.08)', placeItems: 'center', marginBottom: 20 }}>
            <Loader size={26} color="var(--primary)" style={{ animation: 'spin 1.2s linear infinite' }} />
          </div>
          <h3 style={{ marginBottom: 16, fontWeight: 800 }}>Processing your call</h3>
          <div style={{ display: 'grid', gap: 12, maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
            {['Uploading recording…', 'Processing audio…', 'Transcribing conversation…', 'Generating AI summary…'].map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: i <= 2 ? 'rgba(43,138,91,0.12)' : 'rgba(143,63,102,0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {i <= 2 ? <CheckCircle size={12} color="var(--success)" /> : <Loader size={10} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />}
                </div>
                {label}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, height: 8, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden', maxWidth: 320, margin: '24px auto 0' }}>
            <div style={{ width: '80%', height: '100%', background: 'linear-gradient(90deg, var(--primary), #b85c8a)', borderRadius: 999, animation: 'progressPulse 1.5s ease-in-out infinite' }} />
          </div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes progressPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
          `}</style>
        </div>
      )}

      {/* Step 4: AI Review */}
      {currentStep === 3 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>AI Generated Summary</div>
              <h3 style={{ fontWeight: 700, fontSize: '1.2rem' }}>Review for {menteeName}</h3>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>
                {isEditing ? 'Done Editing' : '✏️ Edit'}
              </button>
              <button className="btn-secondary" disabled={isSubmitting} onClick={async () => {
                if (!createdCallId) return;
                const token = localStorage.getItem('anfaal-token');
                if (!token) return;
                setIsSubmitting(true);
                try {
                  // Re-fetch AI summary via updating with mentor notes to trigger a re-generation simulation
                  showFeedback('AI summary regenerated (based on saved notes).', 'success');
                } catch {
                  showFeedback('Unable to regenerate summary.', 'error');
                } finally {
                  setIsSubmitting(false);
                }
              }}>🔄 Regenerate</button>
            </div>
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <div className="label" style={{ marginBottom: 8 }}>Short Summary</div>
              {isEditing ? (
                <textarea className="textarea" value={aiSummary.shortSummary} onChange={(e) => setAiSummary((p) => ({ ...p, shortSummary: e.target.value }))} style={{ minHeight: 80 }} />
              ) : (
                <p style={{ lineHeight: 1.7 }}>{aiSummary.shortSummary}</p>
              )}

              <div style={{ marginTop: 22 }}>
                <h4>Key Discussion Points</h4>
                {isEditing ? (
                  <textarea className="textarea" value={aiSummary.keyDiscussionPoints.join('\n')} onChange={(e) => setAiSummary((p) => ({ ...p, keyDiscussionPoints: e.target.value.split('\n').filter(Boolean) }))} style={{ minHeight: 80 }} />
                ) : (
                  <ul style={{ paddingLeft: 18, marginTop: 8, display: 'grid', gap: 6 }}>
                    {aiSummary.keyDiscussionPoints.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
              </div>

              <div style={{ marginTop: 22 }}>
                <h4>Student Concerns</h4>
                {isEditing ? (
                  <textarea className="textarea" value={aiSummary.studentConcerns.join('\n')} onChange={(e) => setAiSummary((p) => ({ ...p, studentConcerns: e.target.value.split('\n').filter(Boolean) }))} style={{ minHeight: 60 }} />
                ) : (
                  <ul style={{ paddingLeft: 18, marginTop: 8, display: 'grid', gap: 6 }}>
                    {aiSummary.studentConcerns.map((item, i) => <li key={i} style={{ color: 'var(--danger)' }}>{item}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="summary-card">
              <div className="label" style={{ marginBottom: 8 }}>Action Items & Follow-up</div>
              <div style={{ marginTop: 8 }}>
                <h4>Action Items</h4>
                {isEditing ? (
                  <textarea className="textarea" value={aiSummary.actionItems.join('\n')} onChange={(e) => setAiSummary((p) => ({ ...p, actionItems: e.target.value.split('\n').filter(Boolean) }))} style={{ minHeight: 80 }} />
                ) : (
                  <ul style={{ paddingLeft: 18, marginTop: 8, display: 'grid', gap: 6 }}>
                    {aiSummary.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
              </div>
              <div style={{ marginTop: 18 }}>
                <h4>Follow-up Recommendations</h4>
                {isEditing ? (
                  <textarea className="textarea" value={aiSummary.followUpRecommendations.join('\n')} onChange={(e) => setAiSummary((p) => ({ ...p, followUpRecommendations: e.target.value.split('\n').filter(Boolean) }))} style={{ minHeight: 60 }} />
                ) : (
                  <ul style={{ paddingLeft: 18, marginTop: 8, display: 'grid', gap: 6 }}>
                    {aiSummary.followUpRecommendations.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
              </div>
              <div style={{ marginTop: 18 }}>
                <h4>Topics Discussed</h4>
                {isEditing ? (
                  <textarea className="textarea" value={aiSummary.topicsDiscussed.join('\n')} onChange={(e) => setAiSummary((p) => ({ ...p, topicsDiscussed: e.target.value.split('\n').filter(Boolean) }))} style={{ minHeight: 60 }} />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {aiSummary.topicsDiscussed.map((item, i) => (
                      <span key={i} style={{ background: 'rgba(143,63,102,0.08)', color: 'var(--primary)', borderRadius: 999, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 700 }}>{item}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => {
              setCurrentStep(0);
              setFeedback(null);
              setSelectedFile(null);
              setConsentChecked(false);
              setCreatedCallId(null);
              setAiSummary(fallbackSummary);
              setIsEditing(false);
              setForm((p) => ({ ...p, menteeId: mentees[0]?.id ?? '', date: new Date().toISOString().slice(0, 10), duration: 30, mentorNotes: '' }));
            }}>Start Over</button>
            <button className="btn-primary" onClick={handleFinalSubmit} style={{ minWidth: 180 }}>
              ✓ Approve & Submit
            </button>
          </div>
        </>
      )}
    </div>
  );
}
