import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getMenteeProfile,
  getMentors,
  updateMentee,
  updateMentee360,
  addMenteeNote,
  deleteMenteeNote,
  deleteMentee,
  getMenteePerformance,
  getMenteeAiInsights,
  deleteDailyPerformance,
  bulkDeleteDailyPerformance,
  fetchMenteeSuggestions,
  reviewMenteeSuggestion,
  bulkReviewMenteeSuggestions,
  extractProfileFromCall,
} from '../lib/api';
import {
  ArrowLeft,
  BookOpen,
  CheckSquare,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Clock,
  Star,
  Trash2,
  Edit3,
  Target,
  GraduationCap,
  Briefcase,
  Compass,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  Plus,
  Flame,
  ShieldAlert,
  UserCheck,
  MapPin,
  ListTodo,
  Activity,
  Award,
  FileText,
  Phone,
} from 'lucide-react';
import type { Mentee360Profile, ShortTermGoal, MenteeChallenge, AiInsightsResult, ProfileSuggestion } from '../types';
import { formatDateTime, formatDateOnly, formatSubmissionTimestamps } from '../lib/dateTime';

type TabType = 'overview' | 'academic' | 'goals' | 'routine' | 'career' | 'challenges' | 'calls' | 'timeline';

type CallRecord = {
  id: string;
  mentorId: string;
  mentorName: string;
  date: string;
  uploadedAt?: string;
  duration: number;
  reviewStatus: string;
  processingStatus: string;
  recordingStatus: string;
  recordingUrl?: string;
  summary?: string;
  aiSummary?: {
    status?: string;
    shortSummary?: string;
    keyDiscussionPoints?: string[];
    academicProgress?: string;
    personalDevelopment?: string;
    challenges?: string[];
    achievements?: string[];
    actionItems?: string[];
    mentorCommitments?: string[];
    menteeCommitments?: string[];
    followUpTopics?: string[];
    topicsDiscussed?: string[];
  };
  transcript?: string;
  keyDiscussionPoints: string[];
  studentConcerns: string[];
  actionItems: string[];
  followUpRecommendations: string[];
  topicsDiscussed: string[];
};

const MOOD_MAP: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😞', label: 'Very difficult' },
  2: { emoji: '😕', label: 'Difficult' },
  3: { emoji: '😐', label: 'Okay' },
  4: { emoji: '🙂', label: 'Good' },
  5: { emoji: '😊', label: 'Very good' },
};

function formatDuration(min: number): string {
  if (min === 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Approved' || status === 'Completed' || status === 'active'
    ? 'status-completed'
    : status === 'Rejected' || status === 'inactive' || status === 'failed'
    ? 'status-failed'
    : status === 'Pending Review' || status === 'In Progress'
    ? 'status-pending'
    : 'status-processing';
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

export function MenteeProfilePage() {
  const { menteeId } = useParams<{ menteeId: string }>();
  const navigate = useNavigate();

  // Core mentee & calls data
  const [mentee, setMentee] = useState<Mentee360Profile | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [perfSummary, setPerfSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [mentorsList, setMentorsList] = useState<Array<{ id: string; name: string }>>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Audio player state
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Modals state
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [editAcademicModalOpen, setEditAcademicModalOpen] = useState(false);
  const [editGoalsModalOpen, setEditGoalsModalOpen] = useState(false);
  const [editRoutineModalOpen, setEditRoutineModalOpen] = useState(false);
  const [editCareerModalOpen, setEditCareerModalOpen] = useState(false);
  const [goalModal, setGoalModal] = useState<{ isOpen: boolean; mode: 'add' | 'edit'; goal?: ShortTermGoal | null }>({ isOpen: false, mode: 'add' });
  const [challengeModal, setChallengeModal] = useState<{ isOpen: boolean; mode: 'add' | 'edit'; challenge?: MenteeChallenge | null }>({ isOpen: false, mode: 'add' });
  const [activeCallModal, setActiveCallModal] = useState<{ isOpen: boolean; mode: 'summary' | 'transcript'; call: CallRecord } | null>(null);
  const [deleteMenteeConfirmOpen, setDeleteMenteeConfirmOpen] = useState(false);
  const [isDeletingMentee, setIsDeletingMentee] = useState(false);

  // Notes state
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState('Academic');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Daily Performance records view (Routine tab expandable)
  const [showDetailedDailyLogs, setShowDetailedDailyLogs] = useState(false);
  const [perfData, setPerfData] = useState<any>(null);
  const [selectedPerfIds, setSelectedPerfIds] = useState<Set<string>>(new Set());
  const [perfDeleteTarget, setPerfDeleteTarget] = useState<any | 'BULK' | null>(null);
  const [isPerfDeleting, setIsPerfDeleting] = useState(false);
  const selectAllPerfRef = useRef<HTMLInputElement | null>(null);

  const user = (() => {
    try {
      const u = localStorage.getItem('anfaal-user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })();
  const isAdmin = user?.role === 'ADMIN';
  const token = localStorage.getItem('anfaal-token') || '';

  // Supportive Intelligence (AI Insights)
  const [aiInsights, setAiInsights] = useState<AiInsightsResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const handleGenerateAiInsights = async () => {
    if (!menteeId) return;
    setIsGeneratingAi(true);
    try {
      const res = await getMenteeAiInsights(menteeId);
      setAiInsights(res);
      setFeedback({ msg: 'Weekly AI progress insights generated successfully.', type: 'success' });
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Unable to generate AI insights.', type: 'error' });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // AI Suggestions state
  const [suggestions, setSuggestions] = useState<ProfileSuggestion[]>([]);
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState<number>(0);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [suggestionsModalOpen, setSuggestionsModalOpen] = useState(false);
  const [isReviewingSuggestion, setIsReviewingSuggestion] = useState(false);

  const loadSuggestions = async () => {
    if (!token || !menteeId) return;
    try {
      setIsSuggestionsLoading(true);
      const res = await fetchMenteeSuggestions(token, menteeId);
      setSuggestions(res.suggestions || []);
      setPendingSuggestionsCount(res.pendingCount || 0);
    } catch {
      // Non-blocking
    } finally {
      setIsSuggestionsLoading(false);
    }
  };

  const handleReviewSuggestion = async (
    suggestionId: string,
    action: 'approve' | 'edit' | 'reject',
    editedValue?: any,
  ) => {
    if (!token || !menteeId) return;
    setIsReviewingSuggestion(true);
    try {
      await reviewMenteeSuggestion(token, menteeId, suggestionId, action, editedValue);
      setFeedback({ msg: `Suggestion ${action}d successfully.`, type: 'success' });
      await loadProfile();
      await loadSuggestions();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Unable to review suggestion', type: 'error' });
    } finally {
      setIsReviewingSuggestion(false);
    }
  };

  const handleBulkReview = async (action: 'approve' | 'reject') => {
    if (!token || !menteeId) return;
    const pendingIds = suggestions.filter((s) => s.status === 'pending').map((s) => s._id);
    if (pendingIds.length === 0) return;
    setIsReviewingSuggestion(true);
    try {
      await bulkReviewMenteeSuggestions(token, menteeId, action, pendingIds);
      setFeedback({ msg: `Successfully ${action}d ${pendingIds.length} suggestions.`, type: 'success' });
      await loadProfile();
      await loadSuggestions();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Unable to bulk review suggestions', type: 'error' });
    } finally {
      setIsReviewingSuggestion(false);
    }
  };

  // Load Mentee 360 Profile
  const loadProfile = async () => {
    if (!token || !menteeId) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await getMenteeProfile(token, menteeId, 100);
      setMentee(res.mentee ?? null);
      if (res.mentee?.pendingSuggestionsCount !== undefined) {
        setPendingSuggestionsCount(res.mentee.pendingSuggestionsCount);
      }
      setCalls(res.calls ?? []);
      setPerfSummary(res.dailyPerformanceSummary ?? null);
      setTimeline(res.timeline ?? []);
      loadSuggestions();
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load mentee profile.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();

    if (isAdmin && token) {
      getMentors(token)
        .then((res) => setMentorsList((res.mentors || []).map((m: any) => ({ id: m.id || m._id, name: m.name }))))
        .catch(() => {});
    }

    if (menteeId) {
      getMenteePerformance(menteeId)
        .then((res) => setPerfData(res))
        .catch(() => {});
    }
  }, [menteeId, token]);

  // Audio Playback Handler
  const togglePlayAudio = (callId: string, url?: string) => {
    if (!url) return;
    if (playingCallId === callId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingCallId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
      setPlayingCallId(callId);
    }
  };

  // Note Submission
  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newNoteText.trim() || !menteeId) return;
    setIsAddingNote(true);
    try {
      const res = await addMenteeNote(token, menteeId, {
        note: newNoteText.trim(),
        category: newNoteCategory,
      });
      setMentee((prev) => prev ? { ...prev, notes: res.notes } : prev);
      setNewNoteText('');
      setFeedback({ msg: 'Mentor note recorded successfully.', type: 'success' });
      loadProfile();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to add note.', type: 'error' });
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!menteeId) return;
    try {
      const res = await deleteMenteeNote(token, menteeId, noteId);
      setMentee((prev) => prev ? { ...prev, notes: res.notes } : prev);
      setFeedback({ msg: 'Note removed successfully.', type: 'success' });
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to delete note.', type: 'error' });
    }
  };

  // Save Goal
  const handleSaveGoal = async (goalData: Partial<ShortTermGoal>) => {
    if (!mentee || !menteeId) return;
    try {
      const existingGoals = mentee.goals?.shortTermGoals || [];
      let updatedGoals: ShortTermGoal[];
      if (goalModal.mode === 'add') {
        const newGoal: ShortTermGoal = {
          id: `g-${Date.now()}`,
          title: goalData.title || 'Untitled Goal',
          description: goalData.description || '',
          progress: Number(goalData.progress ?? 0),
          deadline: goalData.deadline || '',
          status: (goalData.status as any) || 'In Progress',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        updatedGoals = [newGoal, ...existingGoals];
      } else {
        updatedGoals = existingGoals.map((g) =>
          g.id === goalModal.goal?.id
            ? { ...g, ...goalData, updatedAt: new Date().toISOString() }
            : g
        );
      }

      await updateMentee360(token, menteeId, {
        goals: {
          ...mentee.goals,
          shortTermGoals: updatedGoals,
        },
      });

      setMentee((prev) => prev ? { ...prev, goals: { ...prev.goals, shortTermGoals: updatedGoals } } : prev);
      setGoalModal({ isOpen: false, mode: 'add' });
      setFeedback({ msg: 'Goal saved successfully.', type: 'success' });
      loadProfile();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to save goal.', type: 'error' });
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!mentee || !menteeId) return;
    try {
      const updatedGoals = (mentee.goals?.shortTermGoals || []).filter((g) => g.id !== goalId);
      await updateMentee360(token, menteeId, {
        goals: {
          ...mentee.goals,
          shortTermGoals: updatedGoals,
        },
      });
      setMentee((prev) => prev ? { ...prev, goals: { ...prev.goals, shortTermGoals: updatedGoals } } : prev);
      setFeedback({ msg: 'Goal removed successfully.', type: 'success' });
      loadProfile();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to delete goal.', type: 'error' });
    }
  };

  // Save Challenge
  const handleSaveChallenge = async (challengeData: Partial<MenteeChallenge>) => {
    if (!mentee || !menteeId) return;
    try {
      const existingChallenges = mentee.challenges || [];
      let updatedChallenges: MenteeChallenge[];
      if (challengeModal.mode === 'add') {
        const newChallenge: MenteeChallenge = {
          id: `ch-${Date.now()}`,
          title: challengeData.title || 'Untitled Challenge',
          description: challengeData.description || '',
          priority: (challengeData.priority as any) || 'Medium',
          status: (challengeData.status as any) || 'In Progress',
          mentorAction: challengeData.mentorAction || '',
          progress: Number(challengeData.progress ?? 0),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        updatedChallenges = [newChallenge, ...existingChallenges];
      } else {
        updatedChallenges = existingChallenges.map((ch) =>
          ch.id === challengeModal.challenge?.id
            ? { ...ch, ...challengeData, updatedAt: new Date().toISOString() }
            : ch
        );
      }

      await updateMentee360(token, menteeId, { challenges: updatedChallenges });
      setMentee((prev) => prev ? { ...prev, challenges: updatedChallenges } : prev);
      setChallengeModal({ isOpen: false, mode: 'add' });
      setFeedback({ msg: 'Challenge saved successfully.', type: 'success' });
      loadProfile();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to save challenge.', type: 'error' });
    }
  };

  const handleDeleteChallenge = async (challengeId: string) => {
    if (!mentee || !menteeId) return;
    try {
      const updatedChallenges = (mentee.challenges || []).filter((ch) => ch.id !== challengeId);
      await updateMentee360(token, menteeId, { challenges: updatedChallenges });
      setMentee((prev) => prev ? { ...prev, challenges: updatedChallenges } : prev);
      setFeedback({ msg: 'Challenge removed successfully.', type: 'success' });
      loadProfile();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to delete challenge.', type: 'error' });
    }
  };

  // Delete Mentee (Admin Only)
  const handleDeleteMentee = async () => {
    if (!menteeId || !isAdmin) return;
    setIsDeletingMentee(true);
    try {
      await deleteMentee(token, menteeId);
      navigate('/admin/mentees');
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Unable to delete mentee profile.', type: 'error' });
      setIsDeletingMentee(false);
      setDeleteMenteeConfirmOpen(false);
    }
  };

  // Execute Daily Performance delete
  const executeDeletePerformance = async () => {
    if (!perfDeleteTarget) return;
    setIsPerfDeleting(true);
    try {
      if (perfDeleteTarget === 'BULK') {
        const ids = Array.from(selectedPerfIds);
        const res = await bulkDeleteDailyPerformance(token, ids);
        setPerfData((prev: any) => {
          if (!prev) return prev;
          const newHistory = (prev.history ?? []).filter((r: any) => !selectedPerfIds.has(String(r._id || r.id)));
          return { ...prev, history: newHistory };
        });
        setSelectedPerfIds(new Set());
        setFeedback({ msg: res.message || `${ids.length} records deleted.`, type: 'success' });
      } else {
        const targetId = String(perfDeleteTarget._id || perfDeleteTarget.id);
        const res = await deleteDailyPerformance(token, targetId);
        setPerfData((prev: any) => {
          if (!prev) return prev;
          const newHistory = (prev.history ?? []).filter((r: any) => String(r._id || r.id) !== targetId);
          return { ...prev, history: newHistory };
        });
        setSelectedPerfIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        setFeedback({ msg: res.message || 'Record deleted.', type: 'success' });
      }
      setPerfDeleteTarget(null);
      loadProfile();
    } catch (err: any) {
      setFeedback({ msg: err.message || 'Failed to delete record.', type: 'error' });
    } finally {
      setIsPerfDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3.5px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Loading Mentee 360° Profile…</div>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Gathering academic records, goals, calls, and intelligence.</p>
      </div>
    );
  }

  if (!mentee) {
    return (
      <div className="summary-card" style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 480, margin: '60px auto' }}>
        <ShieldAlert size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontWeight: 800, marginBottom: 8 }}>Mentee Profile Unavailable</h3>
        <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 20 }}>{loadError || 'This mentee record could not be found or you do not have permission to view it.'}</p>
        <button className="btn-secondary" onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={15} /> Go back
        </button>
      </div>
    );
  }

  const lastCall = calls[0];
  const initials = mentee.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hidden audio element for inline playback */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingCallId(null)}
        onError={() => setPlayingCallId(null)}
      />

      {/* Back button */}
      <div>
        <button
          type="button"
          className="btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', padding: '6px 10px', color: 'var(--text-secondary)' }}
          onClick={() => navigate(isAdmin ? '/admin/mentees' : '/mentor/mentees')}
        >
          <ArrowLeft size={15} /> Back to Mentees
        </button>
      </div>

      {/* Toast Feedback */}
      {feedback && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: feedback.type === 'success' ? 'rgba(43,138,91,0.08)' : 'rgba(201,87,87,0.08)',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(43,138,91,0.2)' : 'rgba(201,87,87,0.2)'}`,
            color: feedback.type === 'success' ? 'var(--success)' : 'var(--danger)',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>{feedback.msg}</span>
          <button type="button" onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          1. MENTEE 360° PROFILE HEADER
      ────────────────────────────────────────────────────────────────────────── */}
      <div
        className="summary-card"
        style={{
          padding: '24px',
          borderRadius: 'var(--radius)',
          background: 'linear-gradient(135deg, rgba(143,63,102,0.04) 0%, rgba(255,255,255,0.95) 100%)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {/* Avatar and Primary Identity */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary) 0%, #a85d82 100%)',
                color: '#fff',
                fontSize: '1.6rem',
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 8px 16px rgba(143,63,102,0.22)',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {mentee.name}
                </h1>
                <StatusBadge status={mentee.status} />
              </div>

              {/* Badges / Metadata row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', marginTop: 8, fontSize: '0.85rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(143,63,102,0.08)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 8, fontWeight: 700 }}>
                  <span>MAKID:</span> <span>{mentee.makid || 'Not assigned'}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                  <GraduationCap size={15} color="var(--primary)" />
                  <strong style={{ color: 'var(--text-primary)' }}>Class:</strong> {mentee.standard}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                  <MapPin size={14} color="var(--primary)" />
                  <strong style={{ color: 'var(--text-primary)' }}>Location:</strong> {mentee.location || 'Not provided'}
                  <ProvenanceBadge
                    fieldKey="location"
                    provenance={mentee.profileProvenance}
                    hasPending={suggestions.some((s) => s.status === 'pending' && s.fieldKey === 'location')}
                  />
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                  <UserCheck size={14} color="var(--primary)" />
                  <strong style={{ color: 'var(--text-primary)' }}>Mentor:</strong> {mentee.assignedMentor || 'Unassigned'}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                  <Clock size={14} />
                  <span>Last active: {formatDateTime(mentee.lastActivity)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-outline btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', padding: '6px 12px', minHeight: 38 }}
              onClick={() => setActiveTab('calls')}
            >
              <MessageSquare size={14} /> + Add Note
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', padding: '6px 12px', minHeight: 38 }}
                  onClick={() => setEditProfileModalOpen(true)}
                >
                  <Edit3 size={14} /> Edit Profile
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', padding: '6px 12px', minHeight: 38, color: 'var(--danger)', borderColor: 'rgba(201,87,87,0.3)' }}
                  onClick={() => setDeleteMenteeConfirmOpen(true)}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. MENTEE 360° NAVIGATION TABS
      ────────────────────────────────────────────────────────────────────────── */}
      <div className="profile-tabs-wrapper">
        <nav className="profile-tabs" role="tablist">
          {[
            { id: 'overview', label: 'Overview', icon: BookOpen },
            { id: 'academic', label: 'Academic', icon: GraduationCap },
            { id: 'goals', label: 'Goals', icon: Target },
            { id: 'routine', label: 'Routine', icon: Clock },
            { id: 'career', label: 'Career & Interests', icon: Briefcase },
            { id: 'challenges', label: 'Challenges', icon: AlertCircle },
            { id: 'calls', label: 'Calls & Notes', icon: Phone },
            { id: 'timeline', label: 'Timeline', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                className={`profile-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id as TabType)}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                {tab.id === 'overview' && pendingSuggestionsCount > 0 && (
                  <span
                    style={{
                      background: '#f59e0b',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 10,
                      marginLeft: 4,
                    }}
                  >
                    {pendingSuggestionsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: OVERVIEW
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Profile Information Status Compact Section */}
          {(() => {
            const provKeys = Object.keys(mentee.profileProvenance || {});
            const verifiedCount = provKeys.length;
            const coreFields = [
              mentee.location,
              mentee.academic?.previousPercentage,
              mentee.academic?.latestPercentage,
              mentee.academic?.targetPercentage,
              mentee.goals?.careerGoal,
              mentee.routine?.selfStudyHours,
            ];
            const missingCount = coreFields.filter(
              (v) => v === undefined || v === null || v === '',
            ).length;
            const pendingCount = suggestions.filter((s) => s.status === 'pending').length;

            return (
              <div
                className="summary-card"
                style={{
                  background: 'linear-gradient(135deg, var(--surface) 0%, rgba(99, 102, 241, 0.04) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.22)',
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'rgba(99, 102, 241, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                      }}
                    >
                      <Activity size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0 }}>Profile Information Status</h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Canonical 360° mentee profile data verified by mentors and AI transcript extraction
                      </div>
                    </div>
                  </div>

                  {pendingCount > 0 ? (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        borderRadius: 10,
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      }}
                      onClick={() => setSuggestionsModalOpen(true)}
                    >
                      <Sparkles size={16} />
                      Review AI Suggestions ({pendingCount})
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        borderRadius: 8,
                      }}
                      onClick={() => setSuggestionsModalOpen(true)}
                    >
                      <Sparkles size={14} />
                      AI Suggestions ({suggestions.length})
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-muted)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Verified Information
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--success)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={16} />
                      {verifiedCount} fields
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-muted)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Awaiting Review
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: pendingCount > 0 ? '#f59e0b' : 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={16} />
                      {pendingCount} suggestions
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-muted)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Missing Information
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: missingCount > 0 ? '#f59e0b' : 'var(--success)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertCircle size={16} />
                      {missingCount} fields
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-muted)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Last Profile Update
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                      {mentee.lastProfileUpdate ? formatDateTime(mentee.lastProfileUpdate) : 'Never'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Top Row: Academic Snapshot & Current Goals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            {/* Key Academic Snapshot */}
            <div className="summary-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GraduationCap size={18} color="var(--primary)" /> Academic Snapshot
                  </h3>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: '0.78rem', padding: '2px 6px', color: 'var(--primary)', fontWeight: 700 }}
                    onClick={() => setActiveTab('academic')}
                  >
                    View Details →
                  </button>
                </div>

                {/* Score Comparison Visual */}
                <div style={{ background: 'var(--surface-muted)', padding: '14px 16px', borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Previous</div>
                      <div
                        style={{
                          fontSize: mentee.academic?.previousPercentage != null ? '1.3rem' : '0.92rem',
                          fontWeight: mentee.academic?.previousPercentage != null ? 800 : 600,
                          color: 'var(--text-secondary)',
                          marginTop: 4,
                        }}
                      >
                        {mentee.academic?.previousPercentage != null
                          ? `${mentee.academic.previousPercentage}%`
                          : 'Not available'}
                      </div>
                    </div>
                    <div style={{ borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: mentee.academic?.latestPercentage != null ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: 700 }}>Latest Exam</div>
                      <div
                        style={{
                          fontSize: mentee.academic?.latestPercentage != null ? '1.3rem' : '0.92rem',
                          fontWeight: mentee.academic?.latestPercentage != null ? 800 : 600,
                          color: mentee.academic?.latestPercentage != null ? 'var(--primary)' : 'var(--text-secondary)',
                          marginTop: 4,
                        }}
                      >
                        {mentee.academic?.latestPercentage != null
                          ? `${mentee.academic.latestPercentage}%`
                          : 'Not available'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: mentee.academic?.targetPercentage != null ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 700 }}>Target</div>
                      <div
                        style={{
                          fontSize: mentee.academic?.targetPercentage != null ? '1.3rem' : '0.92rem',
                          fontWeight: mentee.academic?.targetPercentage != null ? 800 : 600,
                          color: mentee.academic?.targetPercentage != null ? 'var(--success)' : 'var(--text-secondary)',
                          marginTop: 4,
                        }}
                      >
                        {mentee.academic?.targetPercentage != null
                          ? `${mentee.academic.targetPercentage}%`
                          : 'Not set'}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar toward target */}
                  {mentee.academic?.latestPercentage !== undefined && mentee.academic?.targetPercentage ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.round((mentee.academic.latestPercentage / mentee.academic.targetPercentage) * 100))}%`,
                            background: 'linear-gradient(90deg, var(--primary) 0%, var(--success) 100%)',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        <span>Progress toward target</span>
                        <span>{Math.min(100, Math.round((mentee.academic.latestPercentage / mentee.academic.targetPercentage) * 100))}% achieved</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      No benchmark target progress available yet.
                    </div>
                  )}
                </div>

                {/* Metrics pair */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85rem' }}>
                  <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Self-study Hours</span>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: 2 }}>
                      {mentee.routine?.selfStudyHours !== undefined && mentee.routine?.selfStudyHours !== null
                        ? `${mentee.routine.selfStudyHours} hrs / day`
                        : 'Not provided'}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Attendance</span>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--success)', marginTop: 2 }}>
                      {mentee.academic?.attendancePercentage !== undefined && mentee.academic?.attendancePercentage !== null
                        ? `${mentee.academic.attendancePercentage}%`
                        : 'Not available'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Weak / Strong Subjects snippet */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--success)' }}>Strong:</strong>
                  <span>{(mentee.academic?.favouriteSubjects && mentee.academic.favouriteSubjects.length > 0) ? mentee.academic.favouriteSubjects.join(', ') : 'Not provided'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <strong style={{ color: '#e65100' }}>Needs Focus:</strong>
                  <span>{(mentee.academic?.weakSubjects && mentee.academic.weakSubjects.length > 0) ? mentee.academic.weakSubjects.join(', ') : 'None flagged'}</span>
                </div>
              </div>
            </div>

            {/* Current Goals Snapshot */}
            <div className="summary-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Target size={18} color="var(--primary)" /> Active Goals
                  </h3>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: '0.78rem', padding: '2px 6px', color: 'var(--primary)', fontWeight: 700 }}
                    onClick={() => setActiveTab('goals')}
                  >
                    View All →
                  </button>
                </div>

                {/* Career & Semester Goal Callout */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: '10px 12px', background: 'rgba(143,63,102,0.04)', border: '1px solid rgba(143,63,102,0.12)', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 700 }}>Semester Goal</div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', marginTop: 2, color: 'var(--text-primary)' }}>
                      {mentee.goals?.semesterGoal || 'Not set'}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px', background: 'rgba(93,126,184,0.05)', border: '1px solid rgba(93,126,184,0.15)', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--info)', fontWeight: 700 }}>Final Career Aspiration</div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', marginTop: 2, color: 'var(--text-primary)' }}>
                      {mentee.goals?.careerGoal || mentee.careerInterests?.primaryGoal || 'Not set'}
                    </div>
                  </div>
                </div>

                {/* Top Short-term Goals */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Active Milestones
                  </div>
                  {(mentee.goals?.shortTermGoals || []).length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '6px 0' }}>
                      No short-term milestones set yet.
                    </div>
                  ) : (
                    (mentee.goals?.shortTermGoals || []).slice(0, 2).map((g) => (
                      <div key={g.id} style={{ padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: 8, fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{g.title}</span>
                          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.8rem' }}>{g.progress}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginTop: 6 }}>
                          <div style={{ height: '100%', width: `${g.progress}%`, background: 'var(--primary)', borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  style={{ width: '100%', fontSize: '0.8rem' }}
                  onClick={() => setGoalModal({ isOpen: true, mode: 'add' })}
                >
                  + Add New Goal
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Current Challenges & Recent Mentor Interaction */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            {/* Current Challenges */}
            <div className="summary-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={18} color="#e65100" /> Active Challenges
                  </h3>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: '0.78rem', padding: '2px 6px', color: 'var(--primary)', fontWeight: 700 }}
                    onClick={() => setActiveTab('challenges')}
                  >
                    View All →
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(mentee.challenges || []).length === 0 ? (
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>
                      No active challenges flagged yet.
                    </div>
                  ) : (
                    (mentee.challenges || []).slice(0, 2).map((ch) => (
                    <div
                      key={ch.id}
                      style={{
                        padding: '12px 14px',
                        background: 'var(--surface-muted)',
                        borderLeft: `4px solid ${ch.priority === 'High' ? 'var(--danger)' : ch.priority === 'Medium' ? '#e65100' : 'var(--info)'}`,
                        borderRadius: '0 10px 10px 0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{ch.title}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: ch.priority === 'High' ? 'rgba(201,87,87,0.1)' : 'rgba(230,81,0,0.1)',
                            color: ch.priority === 'High' ? 'var(--danger)' : '#e65100',
                          }}
                        >
                          {ch.priority} Priority
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 8px', lineHeight: 1.4 }}>
                        {ch.description}
                      </p>
                      {ch.mentorAction && (
                        <div style={{ fontSize: '0.78rem', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                          <strong style={{ color: 'var(--primary)' }}>Mentor Action:</strong> {ch.mentorAction}
                        </div>
                      )}
                    </div>
                  ))
                )}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  style={{ width: '100%', fontSize: '0.8rem' }}
                  onClick={() => setChallengeModal({ isOpen: true, mode: 'add' })}
                >
                  + Add Challenge
                </button>
              </div>
            </div>

            {/* Recent Mentor Interaction */}
            <div className="summary-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={18} color="var(--primary)" /> Last Mentor Session
                  </h3>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: '0.78rem', padding: '2px 6px', color: 'var(--primary)', fontWeight: 700 }}
                    onClick={() => setActiveTab('calls')}
                  >
                    All Calls ({calls.length}) →
                  </button>
                </div>

                {lastCall ? (
                  <div>
                    {/* Call Meta Banner */}
                    <div style={{ padding: '12px 14px', background: 'var(--surface-muted)', borderRadius: 12, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                            {formatDateOnly(lastCall.date)} • {new Date(lastCall.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            Duration: {lastCall.duration} min • Mentor: {lastCall.mentorName || mentee.assignedMentor}
                          </div>
                        </div>
                        <StatusBadge status={lastCall.reviewStatus} />
                      </div>

                      {/* AI Summary snippet */}
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-primary)', margin: '10px 0 0', lineHeight: 1.45 }}>
                        "{lastCall.aiSummary?.shortSummary || lastCall.summary || 'Session successfully recorded.'}"
                      </p>
                    </div>

                    {/* Action Items preview */}
                    {lastCall.actionItems && lastCall.actionItems.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                          Pending Action Items
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {lastCall.actionItems.slice(0, 2).map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem' }}>
                              <CheckCircle2 size={14} color="var(--primary)" style={{ marginTop: 2, flexShrink: 0 }} />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {lastCall.recordingUrl && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          onClick={() => togglePlayAudio(lastCall.id, lastCall.recordingUrl)}
                        >
                          {playingCallId === lastCall.id ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                          {playingCallId === lastCall.id ? 'Pause Audio' : 'Play Recording'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => setActiveCallModal({ isOpen: true, mode: 'summary', call: lastCall })}
                      >
                        <Sparkles size={13} /> View Summary
                      </button>
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => navigate(isAdmin ? `/admin/calls/${lastCall.id}` : `/mentor/calls/${lastCall.id}`)}
                      >
                        Intelligence
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                    <p style={{ fontSize: '0.88rem' }}>No mentorship calls logged yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Supportive Intelligence: Weekly AI Progress Insights */}
            <WeeklyAiInsightsCard
              aiInsights={aiInsights}
              isGeneratingAi={isGeneratingAi}
              onGenerate={handleGenerateAiInsights}
            />
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: ACADEMIC
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'academic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Academic Profile</h2>
              <p className="muted" style={{ fontSize: '0.85rem' }}>Track examination benchmarks, subject strengths, and portion completion.</p>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setEditAcademicModalOpen(true)}
            >
              <Edit3 size={14} /> Edit Academic Details
            </button>
          </div>

          {/* Academic Snapshot Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
            <div className="summary-card" style={{ textAlign: 'center', padding: '18px 14px' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Current Class</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>{mentee.standard}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>{mentee.academic?.academicLevel || 'Class Standard'}</div>
            </div>
            <div className="summary-card" style={{ textAlign: 'center', padding: '18px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Previous Exam</span>
                <ProvenanceBadge
                  fieldKey="academic.previousPercentage"
                  provenance={mentee.profileProvenance}
                  hasPending={suggestions.some((s) => s.status === 'pending' && s.fieldKey === 'academic.previousPercentage')}
                />
              </div>
              <div
                style={{
                  fontSize: mentee.academic?.previousPercentage != null ? '1.4rem' : '1.05rem',
                  fontWeight: mentee.academic?.previousPercentage != null ? 800 : 600,
                  marginTop: mentee.academic?.previousPercentage != null ? 4 : 8,
                  color: 'var(--text-secondary)',
                }}
              >
                {mentee.academic?.previousPercentage != null
                  ? `${mentee.academic.previousPercentage}%`
                  : 'Not available'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: mentee.academic?.previousPercentage != null ? 2 : 4 }}>
                {mentee.academic?.previousPercentage != null ? 'Baseline percentage' : 'No baseline recorded'}
              </div>
            </div>
            <div
              className="summary-card"
              style={{
                textAlign: 'center',
                padding: '18px 14px',
                border: mentee.academic?.latestPercentage != null ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                background: mentee.academic?.latestPercentage != null ? 'rgba(143,63,102,0.02)' : 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: mentee.academic?.latestPercentage != null ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: 700 }}>
                  Latest Exam
                </span>
                <ProvenanceBadge
                  fieldKey="academic.latestPercentage"
                  provenance={mentee.profileProvenance}
                  hasPending={suggestions.some((s) => s.status === 'pending' && s.fieldKey === 'academic.latestPercentage')}
                />
              </div>
              <div
                style={{
                  fontSize: mentee.academic?.latestPercentage != null ? '1.4rem' : '1.05rem',
                  fontWeight: mentee.academic?.latestPercentage != null ? 800 : 600,
                  marginTop: mentee.academic?.latestPercentage != null ? 4 : 8,
                  color: mentee.academic?.latestPercentage != null ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {mentee.academic?.latestPercentage != null
                  ? `${mentee.academic.latestPercentage}%`
                  : 'Not available'}
              </div>
              {mentee.academic?.latestPercentage != null && mentee.academic?.previousPercentage != null ? (
                <div style={{ fontSize: '0.76rem', color: (mentee.academic.latestPercentage - mentee.academic.previousPercentage) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700, marginTop: 2 }}>
                  {(mentee.academic.latestPercentage - mentee.academic.previousPercentage) >= 0 ? '+' : ''}{mentee.academic.latestPercentage - mentee.academic.previousPercentage}% improvement
                </div>
              ) : (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: mentee.academic?.latestPercentage != null ? 2 : 4 }}>
                  {mentee.academic?.latestPercentage != null ? 'Latest examination' : 'No exam recorded'}
                </div>
              )}
            </div>
            <div className="summary-card" style={{ textAlign: 'center', padding: '18px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: mentee.academic?.targetPercentage != null ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 700 }}>
                  Target Exam
                </span>
                <ProvenanceBadge
                  fieldKey="academic.targetPercentage"
                  provenance={mentee.profileProvenance}
                  hasPending={suggestions.some((s) => s.status === 'pending' && s.fieldKey === 'academic.targetPercentage')}
                />
              </div>
              <div
                style={{
                  fontSize: mentee.academic?.targetPercentage != null ? '1.4rem' : '1.05rem',
                  fontWeight: mentee.academic?.targetPercentage != null ? 800 : 600,
                  marginTop: mentee.academic?.targetPercentage != null ? 4 : 8,
                  color: mentee.academic?.targetPercentage != null ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                {mentee.academic?.targetPercentage != null
                  ? `${mentee.academic.targetPercentage}%`
                  : 'Not set'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: mentee.academic?.targetPercentage != null ? 2 : 4 }}>
                {mentee.academic?.targetPercentage != null ? 'Aim for semester' : 'No target configured'}
              </div>
            </div>
          </div>

          {(!mentee.academic || (mentee.academic.previousPercentage == null && mentee.academic.latestPercentage == null && mentee.academic.targetPercentage == null)) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                padding: '14px 18px',
                borderRadius: 12,
                background: 'rgba(143,63,102,0.03)',
                border: '1px dashed rgba(143,63,102,0.25)',
                fontSize: '0.86rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BookOpen size={18} color="var(--primary)" />
                <span style={{ color: 'var(--text-secondary)' }}>
                  No academic exam records or targets added yet for this mentee.
                </span>
              </div>
              <button
                type="button"
                className="btn-outline btn-sm"
                style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                onClick={() => setEditAcademicModalOpen(true)}
              >
                + Add Academic Information
              </button>
            </div>
          )}

          {/* Subjects Dual Section: Strong vs Focus */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20 }}>
            {/* Strong / Favourite Subjects */}
            <div className="summary-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Star size={18} color="var(--success)" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Strong / Favourite Subjects</h3>
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>Subjects where mentee demonstrates natural aptitude and high confidence.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(mentee.academic?.favouriteSubjects && mentee.academic.favouriteSubjects.length > 0) ? (
                  mentee.academic.favouriteSubjects.map((sub) => (
                    <span
                      key={sub}
                      style={{
                        background: 'rgba(43,138,91,0.08)',
                        border: '1px solid rgba(43,138,91,0.2)',
                        color: 'var(--success)',
                        padding: '6px 12px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      ★ {sub}
                    </span>
                  ))
                ) : (
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>No favourite subjects specified yet.</p>
                )}
              </div>
            </div>

            {/* Subjects Needing Improvement */}
            <div className="summary-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertCircle size={18} color="#e65100" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Subjects Needing Improvement</h3>
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>Prioritized for weekly mentor revision and active remediation.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(mentee.academic?.weakSubjects && mentee.academic.weakSubjects.length > 0) ? (
                  mentee.academic.weakSubjects.map((sub) => (
                    <span
                      key={sub}
                      style={{
                        background: 'rgba(230,81,0,0.08)',
                        border: '1px solid rgba(230,81,0,0.25)',
                        color: '#e65100',
                        padding: '6px 12px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      ⚠️ {sub}
                    </span>
                  ))
                ) : (
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>No improvement areas flagged yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Exam Progress Portion Completion */}
          <div className="summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  Exam Preparation: {mentee.academic?.currentExam || 'Not specified'}
                </h3>
                <p className="muted" style={{ fontSize: '0.82rem' }}>Portion completion progress per syllabus topic</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(mentee.academic?.examProgress && mentee.academic.examProgress.length > 0) ? (
                mentee.academic.examProgress.map((prog) => (
                  <div key={prog.subject} style={{ padding: '10px 14px', background: 'var(--surface-muted)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{prog.subject}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 8,
                            background: prog.portionCompleted >= 70 ? 'rgba(43,138,91,0.1)' : prog.portionCompleted >= 50 ? 'rgba(93,126,184,0.1)' : 'rgba(230,81,0,0.1)',
                            color: prog.portionCompleted >= 70 ? 'var(--success)' : prog.portionCompleted >= 50 ? 'var(--info)' : '#e65100',
                          }}
                        >
                          {prog.status || (prog.portionCompleted >= 70 ? 'Ahead' : prog.portionCompleted >= 50 ? 'In Progress' : 'Needs Focus')}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', minWidth: 42, textAlign: 'right' }}>
                          {prog.portionCompleted}%
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${prog.portionCompleted}%`,
                          background: prog.portionCompleted >= 70 ? 'var(--success)' : prog.portionCompleted >= 50 ? 'var(--primary)' : '#e65100',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  No syllabus or exam portion records added yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: GOALS
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'goals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Mentee Goal Framework</h2>
              <p className="muted" style={{ fontSize: '0.85rem' }}>Long-term career aspirations, semester targets, and weekly milestones.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setEditGoalsModalOpen(true)}
              >
                <Edit3 size={14} /> Edit High-Level Goals
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setGoalModal({ isOpen: true, mode: 'add' })}
              >
                <Plus size={15} /> Add Short-Term Goal
              </button>
            </div>
          </div>

          {/* High-Level Goals Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
            {/* Final Career Goal */}
            <div className="summary-card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Award size={14} /> Final Career Goal</span>
                <ProvenanceBadge
                  fieldKey="goals.careerGoal"
                  provenance={mentee.profileProvenance}
                  hasPending={suggestions.some((s) => s.status === 'pending' && (s.fieldKey === 'goals.careerGoal' || s.fieldKey === 'careerGoal'))}
                />
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 6, color: 'var(--text-primary)' }}>
                {mentee.goals?.careerGoal || mentee.careerInterests?.primaryGoal || 'Not set'}
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                Overarching long-term professional goal guiding academic subject selection.
              </p>
            </div>

            {/* Semester Goal */}
            <div className="summary-card" style={{ borderLeft: '4px solid var(--success)' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--success)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Target size={14} /> Semester Goal</span>
                <ProvenanceBadge
                  fieldKey="goals.semesterGoal"
                  provenance={mentee.profileProvenance}
                  hasPending={suggestions.some((s) => s.status === 'pending' && (s.fieldKey === 'goals.semesterGoal' || s.fieldKey === 'semesterGoal'))}
                />
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 6, color: 'var(--text-primary)' }}>
                {mentee.goals?.semesterGoal || 'Not set'}
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                Primary milestone for the current academic session.
              </p>
            </div>
          </div>

          {/* Short-Term Goals List */}
          <div className="summary-card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListTodo size={18} color="var(--primary)" /> Short-Term Goals & Action Plans
            </h3>

            {(mentee.goals?.shortTermGoals || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-secondary)' }}>
                <p>No short-term goals added yet.</p>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => setGoalModal({ isOpen: true, mode: 'add' })}
                >
                  + Add First Goal
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {(mentee.goals?.shortTermGoals || []).map((g) => (
                  <div
                    key={g.id}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.98rem' }}>{g.title}</span>
                          <StatusBadge status={g.status} />
                        </div>
                        {g.description && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
                            {g.description}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                          onClick={() => setGoalModal({ isOpen: true, mode: 'edit', goal: g })}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '4px 8px', color: 'var(--danger)' }}
                          onClick={() => handleDeleteGoal(g.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Progress Slider / Bar */}
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        <span>Progress: {g.progress}%</span>
                        {g.deadline && <span>Deadline: {formatDateOnly(g.deadline)}</span>}
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${g.progress}%`,
                            background: g.progress >= 100 ? 'var(--success)' : 'var(--primary)',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 4: ROUTINE
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'routine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Routine & Engagement</h2>
              <p className="muted" style={{ fontSize: '0.85rem' }}>Self-study schedule, daily habits, and engagement tracking.</p>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setEditRoutineModalOpen(true)}
            >
              <Edit3 size={14} /> Edit Study Routine
            </button>
          </div>

          {/* Daily Engagement Summary (Prompt requirement 6) */}
          <div className="summary-card" style={{ background: 'linear-gradient(135deg, rgba(143,63,102,0.03) 0%, rgba(255,255,255,1) 100%)' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={18} color="var(--primary)" /> Daily Engagement Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, textAlign: 'center' }}>
              <div style={{ padding: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Responses This Week</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
                  {perfSummary?.responsesThisWeek || '0/7'}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Average Study Time</span>
                  <ProvenanceBadge
                    fieldKey="routine.selfStudyHours"
                    provenance={mentee.profileProvenance}
                    hasPending={suggestions.some((s) => s.status === 'pending' && s.fieldKey === 'routine.selfStudyHours')}
                  />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                  {perfSummary?.avgStudyTimeHours || (mentee.routine?.selfStudyHours ? `${mentee.routine.selfStudyHours} hrs` : 'Not provided')}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Task Completion</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>
                  {perfSummary?.taskCompletion || '0%'}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Current Streak</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e65100', marginTop: 4 }}>
                  {perfSummary?.currentStreak ? `🔥 ${perfSummary.currentStreak}` : '0 days'}
                </div>
              </div>
            </div>

            {/* View Daily Responses Trigger */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-outline"
                style={{ fontSize: '0.85rem', padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setShowDetailedDailyLogs((prev) => !prev)}
              >
                <BookOpen size={15} />
                {showDetailedDailyLogs ? 'Hide Daily Responses' : 'View Daily Responses Logs'}
              </button>
            </div>
          </div>

          {/* Supportive Intelligence: Weekly AI Progress Insights */}
          <WeeklyAiInsightsCard
            aiInsights={aiInsights}
            isGeneratingAi={isGeneratingAi}
            onGenerate={handleGenerateAiInsights}
          />

          {/* Study Routine & Habits */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            {/* Study Schedule */}
            <div className="summary-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color="var(--primary)" /> Daily Study Schedule
              </h3>
              <div style={{ background: 'var(--surface-muted)', padding: '14px 16px', borderRadius: 12, whiteSpace: 'pre-line', fontSize: '0.88rem', lineHeight: 1.6, color: mentee.routine?.schedule ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {mentee.routine?.schedule || 'No study schedule provided yet.'}
              </div>
            </div>

            {/* Study Habits */}
            <div className="summary-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckSquare size={18} color="var(--success)" /> Core Study Habits
              </h3>
              {(mentee.routine?.habits || []).length === 0 ? (
                <div className="muted" style={{ fontSize: '0.88rem', padding: '12px 0' }}>
                  No core study habits added yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(mentee.routine?.habits || []).map((habit, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: 8, fontSize: '0.85rem' }}>
                      <CheckCircle2 size={16} color="var(--success)" />
                      <span>{habit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Daily Responses Table (Expanded when requested) */}
          {showDetailedDailyLogs && (
            <div className="summary-card" style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Daily Response History</h3>
                  <p className="muted" style={{ fontSize: '0.82rem' }}>All mentee daily submissions with server timestamps</p>
                </div>
                {isAdmin && selectedPerfIds.size > 0 && (
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => setPerfDeleteTarget('BULK')}
                  >
                    Delete Selected ({selectedPerfIds.size})
                  </button>
                )}
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead style={{ background: 'var(--surface-muted)' }}>
                    <tr>
                      {isAdmin && (
                        <th style={{ width: 40, textAlign: 'center', padding: '10px 12px' }}>
                          <input
                            type="checkbox"
                            ref={selectAllPerfRef}
                            checked={(perfData?.history ?? []).length > 0 && selectedPerfIds.size === (perfData?.history ?? []).length}
                            onChange={() => {
                              const history = perfData?.history ?? [];
                              if (selectedPerfIds.size === history.length) setSelectedPerfIds(new Set());
                              else setSelectedPerfIds(new Set(history.map((r: any) => String(r._id || r.id))));
                            }}
                          />
                        </th>
                      )}
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date & Timestamps</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Study Time</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Quran</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Reading</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Mood</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Reflection</th>
                      {isAdmin && <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(perfData?.history ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>
                          No daily responses found.
                        </td>
                      </tr>
                    ) : (
                      (perfData?.history ?? []).map((r: any) => {
                        const recId = String(r._id || r.id);
                        const isSelected = selectedPerfIds.has(recId);
                        const ts = formatSubmissionTimestamps(r.submittedAt || r.createdAt, r.updatedAt);
                        return (
                          <tr key={recId} style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'rgba(143,63,102,0.04)' : undefined }}>
                            {isAdmin && (
                              <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedPerfIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(recId)) next.delete(recId);
                                      else next.add(recId);
                                      return next;
                                    });
                                  }}
                                />
                              </td>
                            )}
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 700 }}>{formatDateOnly(r.date)}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Submitted: {ts.submittedFormatted}</div>
                              {ts.isEdited && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Updated: {ts.updatedFormatted}</div>}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)' }}>
                              {formatDuration(r.studyMinutes)}
                            </td>
                            <td style={{ padding: '10px 12px' }}>{r.quran?.ruku || 0} Ruku, {r.quran?.pages || 0} pgs</td>
                            <td style={{ padding: '10px 12px' }}>{formatDuration(r.readingMinutes)}</td>
                            <td style={{ padding: '10px 12px', fontSize: '1.2rem' }}>{MOOD_MAP[r.dayRating]?.emoji || '😐'}</td>
                            <td style={{ padding: '10px 12px', maxWidth: 220, fontSize: '0.82rem' }}>{r.dailyReflection || '—'}</td>
                            {isAdmin && (
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ color: 'var(--danger)', padding: '4px 8px', fontSize: '0.78rem' }}
                                  onClick={() => setPerfDeleteTarget(r)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 5: CAREER & INTERESTS
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'career' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Career, Skills & Interests</h2>
              <p className="muted" style={{ fontSize: '0.85rem' }}>Exploration paths, development areas, hobbies, and recommended courses.</p>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setEditCareerModalOpen(true)}
            >
              <Edit3 size={14} /> Edit Interests & Skills
            </button>
          </div>

          {/* Career Goals & Exploration */}
          <div className="summary-card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={18} color="var(--primary)" /> Career Pathways
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
              <div style={{ padding: '14px', background: 'var(--surface-muted)', borderRadius: 10 }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 800 }}>Primary Career Target</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: mentee.careerInterests?.primaryGoal ? 'var(--text-primary)' : 'var(--text-secondary)', marginTop: 4 }}>
                  {mentee.careerInterests?.primaryGoal || 'Not set'}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--surface-muted)', borderRadius: 10 }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800 }}>Secondary Interests</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {(mentee.careerInterests?.secondaryInterests || []).length === 0 ? (
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Not provided</span>
                  ) : (
                    (mentee.careerInterests?.secondaryInterests || []).map((item) => (
                      <span key={item} style={{ background: '#fff', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600 }}>
                        {item}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--surface-muted)', borderRadius: 10 }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800 }}>Explored Careers</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {(mentee.careerInterests?.otherExplored || []).length === 0 ? (
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Not provided</span>
                  ) : (
                    (mentee.careerInterests?.otherExplored || []).map((item) => (
                      <span key={item} style={{ background: '#fff', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600 }}>
                        {item}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interests & Skills Dual Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            {/* Interests & Hobbies */}
            <div className="summary-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Compass size={18} color="var(--primary)" /> Interests & Hobbies
              </h3>
              {(mentee.careerInterests?.hobbies || []).length === 0 ? (
                <p className="muted" style={{ fontSize: '0.88rem', margin: '8px 0' }}>No hobbies or interests added yet.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(mentee.careerInterests?.hobbies || []).map((hobby) => (
                    <span
                      key={hobby}
                      style={{
                        background: 'rgba(143,63,102,0.06)',
                        color: 'var(--primary)',
                        border: '1px solid rgba(143,63,102,0.15)',
                        padding: '6px 12px',
                        borderRadius: 14,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      🎨 {hobby}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Skills Profile */}
            <div className="summary-card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={18} color="var(--success)" /> Skills & Development
              </h3>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>Existing Skills</div>
                {(mentee.careerInterests?.skills || []).length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 14px' }}>None recorded yet</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {(mentee.careerInterests?.skills || []).map((s) => (
                      <span key={s} style={{ background: 'rgba(43,138,91,0.08)', color: 'var(--success)', padding: '4px 10px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600 }}>
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>Skills to Develop</div>
                {(mentee.careerInterests?.skillsToDevelop || []).length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>None recorded yet</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(mentee.careerInterests?.skillsToDevelop || []).map((s) => (
                      <span key={s} style={{ background: 'rgba(93,126,184,0.08)', color: 'var(--info)', padding: '4px 10px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600 }}>
                        ⚡ {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recommended / Assigned Courses */}
          <div className="summary-card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={18} color="var(--primary)" /> Recommended & Assigned Courses
            </h3>
            {(mentee.careerInterests?.recommendedCourses || []).length === 0 ? (
              <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>No recommended courses added yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                {(mentee.careerInterests?.recommendedCourses || []).map((c, idx) => (
                  <div key={idx} style={{ padding: '12px 14px', background: 'var(--surface-muted)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{c.provider || 'Anfaal Platform'}</div>
                    </div>
                    <StatusBadge status={c.status || 'Enrolled'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 6: CHALLENGES
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'challenges' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Challenges & Action Plans</h2>
              <p className="muted" style={{ fontSize: '0.85rem' }}>Structured remediation for academic hurdles, habits, and exam anxiety.</p>
            </div>
            <button
              type="button"
              className="btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setChallengeModal({ isOpen: true, mode: 'add' })}
            >
              <Plus size={15} /> Add Challenge
            </button>
          </div>

          {/* Challenges List */}
          {(mentee.challenges || []).length === 0 ? (
            <div className="summary-card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={36} color="var(--success)" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontWeight: 700, marginBottom: 6 }}>No Active Challenges</h3>
              <p className="muted" style={{ fontSize: '0.88rem' }}>The student is progressing smoothly with no reported difficulties.</p>
              <button
                type="button"
                className="btn-outline btn-sm"
                style={{ marginTop: 14 }}
                onClick={() => setChallengeModal({ isOpen: true, mode: 'add' })}
              >
                + Log Challenge
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {(mentee.challenges || []).map((ch) => (
                <div
                  key={ch.id}
                  className="summary-card"
                  style={{
                    borderLeft: `5px solid ${ch.priority === 'High' ? 'var(--danger)' : ch.priority === 'Medium' ? '#e65100' : 'var(--info)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{ch.title}</span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: ch.priority === 'High' ? 'rgba(201,87,87,0.1)' : ch.priority === 'Medium' ? 'rgba(230,81,0,0.1)' : 'rgba(93,126,184,0.1)',
                            color: ch.priority === 'High' ? 'var(--danger)' : ch.priority === 'Medium' ? '#e65100' : 'var(--info)',
                          }}
                        >
                          {ch.priority} Priority
                        </span>
                        <StatusBadge status={ch.status} />
                      </div>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                        {ch.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                        onClick={() => setChallengeModal({ isOpen: true, mode: 'edit', challenge: ch })}
                      >
                        <Edit3 size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => handleDeleteChallenge(ch.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Mentor Action Callout Box (Prompt requirement 8) */}
                  {ch.mentorAction && (
                    <div style={{ padding: '10px 14px', background: 'rgba(143,63,102,0.04)', border: '1px solid rgba(143,63,102,0.14)', borderRadius: 10 }}>
                      <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 800 }}>Mentor Action Plan</div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: 2 }}>
                        {ch.mentorAction}
                      </div>
                    </div>
                  )}

                  {/* Remediation Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>
                      <span>Resolution Progress</span>
                      <span>{ch.progress}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${ch.progress}%`,
                          background: ch.progress >= 100 ? 'var(--success)' : 'var(--primary)',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 7: CALLS & NOTES
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'calls' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Unified Mentor Notes Section */}
          <div className="summary-card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={18} color="var(--primary)" /> Unified Mentor Notes
            </h3>

            {/* Quick Add Note Form */}
            <form onSubmit={handleAddNote} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  rows={2}
                  className="input-field"
                  placeholder="Type an insightful observation, action recommendation, or milestone update..."
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Category:</span>
                    <select
                      className="input-field"
                      style={{ fontSize: '0.82rem', padding: '4px 10px' }}
                      value={newNoteCategory}
                      onChange={(e) => setNewNoteCategory(e.target.value)}
                    >
                      <option value="Academic">Academic</option>
                      <option value="Personal">Personal</option>
                      <option value="Career">Career</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="btn-primary btn-sm"
                    disabled={isAddingNote || !newNoteText.trim()}
                    style={{ minHeight: 36, padding: '4px 16px' }}
                  >
                    {isAddingNote ? 'Saving…' : 'Post Note'}
                  </button>
                </div>
              </div>
            </form>

            {/* Notes List (Latest First) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(mentee.notes || []).length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                  No mentor notes recorded yet.
                </p>
              ) : (
                (mentee.notes || []).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{n.mentorName}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: 'rgba(143,63,102,0.08)',
                            color: 'var(--primary)',
                          }}
                        >
                          {n.category || 'General'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          {formatDateTime(n.createdAt)}
                        </span>
                        {(isAdmin || user?.name === n.mentorName) && (
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ padding: '2px 4px', color: 'var(--danger)' }}
                            onClick={() => handleDeleteNote(n.id)}
                            title="Delete note"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '4px 0 0', lineHeight: 1.45 }}>
                      {n.note}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mentorship Calls History */}
          <div className="summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Mentorship Session Recordings</h3>
                <p className="muted" style={{ fontSize: '0.82rem' }}>All recorded sessions with AI summaries and transcripts</p>
              </div>
              <span className="muted" style={{ fontSize: '0.85rem' }}>{calls.length} total call{calls.length !== 1 ? 's' : ''}</span>
            </div>

            {calls.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                <Phone size={32} color="var(--primary)" style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                <p style={{ fontSize: '0.88rem' }}>No calls logged for this mentee yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {calls.map((call, idx) => (
                  <div
                    key={call.id}
                    style={{
                      padding: '16px',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.96rem' }}>
                            Call #{String(calls.length - idx).padStart(2, '0')} • {formatDateOnly(call.date)}
                          </span>
                          <StatusBadge status={call.reviewStatus} />
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Uploaded: {formatDateTime(call.uploadedAt)} • Duration: {call.duration} min • Mentor: {call.mentorName}
                        </div>
                      </div>

                      {/* Call Action Buttons */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {call.recordingUrl && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={() => togglePlayAudio(call.id, call.recordingUrl)}
                          >
                            {playingCallId === call.id ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                            {playingCallId === call.id ? 'Pause' : 'Play'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setActiveCallModal({ isOpen: true, mode: 'summary', call })}
                        >
                          <Sparkles size={13} /> Summary
                        </button>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setActiveCallModal({ isOpen: true, mode: 'transcript', call })}
                        >
                          <FileText size={13} /> Transcript
                        </button>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)' }}
                          title="Extract mentee profile fields from this call"
                          onClick={async () => {
                            try {
                              setFeedback({ msg: 'Extracting mentee profile suggestions...', type: 'success' });
                              const res = await extractProfileFromCall(token, call.id);
                              setFeedback({ msg: `Extraction complete: ${res.extractedCount} suggestions found.`, type: 'success' });
                              await loadProfile();
                              await loadSuggestions();
                              setSuggestionsModalOpen(true);
                            } catch (err: any) {
                              setFeedback({ msg: err.message || 'Extraction failed', type: 'error' });
                            }
                          }}
                        >
                          <Sparkles size={13} /> Extract Profile
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          style={{ fontSize: '0.78rem' }}
                          onClick={() => navigate(isAdmin ? `/admin/calls/${call.id}` : `/mentor/calls/${call.id}`)}
                        >
                          Details
                        </button>
                      </div>
                    </div>

                    {/* Summary Snippet */}
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.45 }}>
                      {call.aiSummary?.shortSummary || call.summary || 'Summary processing…'}
                    </p>

                    {/* Action items and student concerns */}
                    {(call.actionItems?.length > 0 || call.studentConcerns?.length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 8, fontSize: '0.82rem', paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        {call.actionItems?.length > 0 && (
                          <div>
                            <strong style={{ color: 'var(--primary)' }}>Action Items:</strong>
                            <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                              {call.actionItems.slice(0, 2).join(' • ')}
                            </div>
                          </div>
                        )}
                        {call.studentConcerns?.length > 0 && (
                          <div>
                            <strong style={{ color: 'var(--danger)' }}>Student Concerns:</strong>
                            <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                              {call.studentConcerns.slice(0, 2).join(' • ')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 8: TIMELINE
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'timeline' && (
        <div className="summary-card">
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Mentee Activity Timeline</h2>
            <p className="muted" style={{ fontSize: '0.85rem' }}>Complete chronological timeline of daily responses, mentorship calls, goal adjustments, and notes.</p>
          </div>

          {timeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <Activity size={32} color="var(--primary)" style={{ opacity: 0.4, margin: '0 auto 8px' }} />
              <p>No activity logged yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 24, borderLeft: '2px solid var(--border)', marginLeft: 8 }}>
              {timeline.map((item, idx) => {
                const iconColor =
                  item.type === 'daily_performance'
                    ? 'var(--success)'
                    : item.type === 'call'
                    ? 'var(--primary)'
                    : item.type === 'goal'
                    ? 'var(--info)'
                    : item.type === 'challenge'
                    ? '#e65100'
                    : 'var(--text-secondary)';

                return (
                  <div key={item.id || idx} style={{ position: 'relative' }}>
                    {/* Circle Node on Timeline */}
                    <div
                      style={{
                        position: 'absolute',
                        left: -33,
                        top: 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        border: `3px solid ${iconColor}`,
                        boxSizing: 'border-box',
                      }}
                    />

                    <div style={{ padding: '12px 14px', background: 'var(--surface-muted)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                          {item.title}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          {formatDateTime(item.timestamp)}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.45 }}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          AI SUGGESTIONS REVIEW MODAL
      ────────────────────────────────────────────────────────────────────────── */}
      {suggestionsModalOpen && (
        <ReviewSuggestionsModal
          isOpen={suggestionsModalOpen}
          onClose={() => setSuggestionsModalOpen(false)}
          suggestions={suggestions}
          onReview={handleReviewSuggestion}
          onBulkReview={handleBulkReview}
          isReviewing={isReviewingSuggestion || isSuggestionsLoading}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 1: EDIT PROFILE (ADMIN ONLY)
      ────────────────────────────────────────────────────────────────────────── */}
      {editProfileModalOpen && (
        <EditProfileModal
          mentee={mentee}
          mentorsList={mentorsList}
          onClose={() => setEditProfileModalOpen(false)}
          onSave={async (updatedFields) => {
            try {
              await updateMentee(token, mentee.id, updatedFields);
              setEditProfileModalOpen(false);
              setFeedback({ msg: 'Mentee profile updated successfully.', type: 'success' });
              loadProfile();
            } catch (err: any) {
              setFeedback({ msg: err.message || 'Failed to update profile.', type: 'error' });
            }
          }}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 2: EDIT ACADEMIC DETAILS
      ────────────────────────────────────────────────────────────────────────── */}
      {editAcademicModalOpen && (
        <EditAcademicModal
          academic={mentee.academic}
          onClose={() => setEditAcademicModalOpen(false)}
          onSave={async (academicData) => {
            try {
              await updateMentee360(token, mentee.id, { academic: academicData });
              setMentee((prev) => prev ? { ...prev, academic: { ...prev.academic, ...academicData } } : prev);
              setEditAcademicModalOpen(false);
              setFeedback({ msg: 'Academic details updated successfully.', type: 'success' });
            } catch (err: any) {
              setFeedback({ msg: err.message || 'Failed to update academic details.', type: 'error' });
            }
          }}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 3: EDIT HIGH-LEVEL GOALS
      ────────────────────────────────────────────────────────────────────────── */}
      {editGoalsModalOpen && (
        <EditGoalsModal
          goals={mentee.goals}
          onClose={() => setEditGoalsModalOpen(false)}
          onSave={async (goalsData) => {
            try {
              await updateMentee360(token, mentee.id, {
                goals: { ...mentee.goals, ...goalsData },
              });
              setMentee((prev) => prev ? { ...prev, goals: { ...prev.goals, ...goalsData } } : prev);
              setEditGoalsModalOpen(false);
              setFeedback({ msg: 'High-level goals updated.', type: 'success' });
            } catch (err: any) {
              setFeedback({ msg: err.message || 'Failed to update goals.', type: 'error' });
            }
          }}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 4: ADD / EDIT SHORT-TERM GOAL
      ────────────────────────────────────────────────────────────────────────── */}
      {goalModal.isOpen && (
        <GoalDetailModal
          mode={goalModal.mode}
          goal={goalModal.goal}
          onClose={() => setGoalModal({ isOpen: false, mode: 'add' })}
          onSave={handleSaveGoal}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 5: ADD / EDIT CHALLENGE
      ────────────────────────────────────────────────────────────────────────── */}
      {challengeModal.isOpen && (
        <ChallengeDetailModal
          mode={challengeModal.mode}
          challenge={challengeModal.challenge}
          onClose={() => setChallengeModal({ isOpen: false, mode: 'add' })}
          onSave={handleSaveChallenge}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 6: EDIT ROUTINE
      ────────────────────────────────────────────────────────────────────────── */}
      {editRoutineModalOpen && (
        <EditRoutineModal
          routine={mentee.routine}
          onClose={() => setEditRoutineModalOpen(false)}
          onSave={async (routineData) => {
            try {
              await updateMentee360(token, mentee.id, { routine: routineData });
              setMentee((prev) => prev ? { ...prev, routine: routineData } : prev);
              setEditRoutineModalOpen(false);
              setFeedback({ msg: 'Study routine updated.', type: 'success' });
            } catch (err: any) {
              setFeedback({ msg: err.message || 'Failed to update routine.', type: 'error' });
            }
          }}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 7: EDIT CAREER & INTERESTS
      ────────────────────────────────────────────────────────────────────────── */}
      {editCareerModalOpen && (
        <EditCareerModal
          career={mentee.careerInterests}
          onClose={() => setEditCareerModalOpen(false)}
          onSave={async (careerData) => {
            try {
              await updateMentee360(token, mentee.id, { careerInterests: careerData });
              setMentee((prev) => prev ? { ...prev, careerInterests: careerData } : prev);
              setEditCareerModalOpen(false);
              setFeedback({ msg: 'Interests & skills updated.', type: 'success' });
            } catch (err: any) {
              setFeedback({ msg: err.message || 'Failed to update interests.', type: 'error' });
            }
          }}
        />
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 8: CALL SUMMARY / TRANSCRIPT VIEWER
      ────────────────────────────────────────────────────────────────────────── */}
      {activeCallModal?.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: 16,
          }}
          onClick={() => setActiveCallModal(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 600,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                {activeCallModal.mode === 'summary' ? 'Call Summary' : 'Call Transcript'}
              </h3>
              <button type="button" className="btn-ghost" onClick={() => setActiveCallModal(null)}>✕</button>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              {formatDateOnly(activeCallModal.call.date)} • {activeCallModal.call.duration} min • Mentor: {activeCallModal.call.mentorName}
            </div>

            {activeCallModal.mode === 'summary' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: 10, fontSize: '0.9rem', lineHeight: 1.55 }}>
                  {activeCallModal.call.aiSummary?.shortSummary || activeCallModal.call.summary || 'Summary unavailable.'}
                </div>
                {activeCallModal.call.keyDiscussionPoints?.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '8px 0 4px' }}>Key Discussion Points</h4>
                    <ul style={{ paddingLeft: 18, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                      {activeCallModal.call.keyDiscussionPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                    </ul>
                  </div>
                )}
                {activeCallModal.call.actionItems?.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '8px 0 4px', color: 'var(--primary)' }}>Action Items</h4>
                    <ul style={{ paddingLeft: 18, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                      {activeCallModal.call.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-line', fontSize: '0.88rem', lineHeight: 1.6, background: 'var(--surface-muted)', padding: '14px 16px', borderRadius: 10, maxHeight: 360, overflowY: 'auto' }}>
                {activeCallModal.call.transcript || 'No transcript text available for this recording.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 9: DELETE PERFORMANCE ENTRY CONFIRM
      ────────────────────────────────────────────────────────────────────────── */}
      {perfDeleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: 16,
          }}
          onClick={() => setPerfDeleteTarget(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 420,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--danger)', marginBottom: 8 }}>Confirm Deletion</h3>
            <p className="muted" style={{ fontSize: '0.88rem', marginBottom: 20 }}>
              {perfDeleteTarget === 'BULK'
                ? `Are you sure you want to delete ${selectedPerfIds.size} daily performance logs? This cannot be undone.`
                : 'Are you sure you want to delete this daily performance log?'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setPerfDeleteTarget(null)}>Cancel</button>
              <button
                type="button"
                className="btn-danger"
                disabled={isPerfDeleting}
                onClick={executeDeletePerformance}
              >
                {isPerfDeleting ? 'Deleting…' : 'Delete Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 10: DELETE MENTEE PERMANENTLY CONFIRM (ADMIN ONLY)
      ────────────────────────────────────────────────────────────────────────── */}
      {deleteMenteeConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: 16,
          }}
          onClick={() => setDeleteMenteeConfirmOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 460,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger)', marginBottom: 8 }}>
              Permanently Delete Mentee?
            </h3>
            <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.5, marginBottom: 20 }}>
              This will permanently delete <strong>{mentee.name}</strong> and all linked data including
              mentorship assignments and call records. This action cannot be reversed.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setDeleteMenteeConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={isDeletingMentee}
                onClick={handleDeleteMentee}
              >
                {isDeletingMentee ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-MODAL COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function EditProfileModal({
  mentee,
  mentorsList,
  onClose,
  onSave,
}: {
  mentee: Mentee360Profile;
  mentorsList: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [name, setName] = useState(mentee.name);
  const [standard, setStandard] = useState(mentee.standard);
  const [makid, setMakid] = useState(mentee.makid);
  const [location, setLocation] = useState(mentee.location || '');
  const [phone, setPhone] = useState(mentee.phone || '');
  const [guardian, setGuardian] = useState(mentee.guardian || '');
  const [status, setStatus] = useState<'active' | 'inactive'>(mentee.status);
  const [assignedMentorId, setAssignedMentorId] = useState(mentee.assignedMentorId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({
      name,
      standard,
      makid,
      location,
      phone,
      guardian,
      status,
      assignedMentorId,
    });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Edit Mentee Profile</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Full Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>MAKID</label>
              <input className="input-field" value={makid} onChange={(e) => setMakid(e.target.value)} placeholder="e.g. MAK10245" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Class / Standard</label>
              <input className="input-field" value={standard} onChange={(e) => setStandard(e.target.value)} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Location</label>
              <input className="input-field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Area, City" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Status</label>
              <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Guardian Name</label>
              <input className="input-field" value={guardian} onChange={(e) => setGuardian(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Phone Number</label>
              <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Assigned Mentor</label>
            <select className="input-field" value={assignedMentorId} onChange={(e) => setAssignedMentorId(e.target.value)}>
              <option value="">Unassigned</option>
              {mentorsList.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAcademicModal({
  academic,
  onClose,
  onSave,
}: {
  academic?: Mentee360Profile['academic'];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [previousPercentage, setPreviousPercentage] = useState<string>(
    academic?.previousPercentage !== undefined && academic?.previousPercentage !== null ? String(academic.previousPercentage) : ''
  );
  const [latestPercentage, setLatestPercentage] = useState<string>(
    academic?.latestPercentage !== undefined && academic?.latestPercentage !== null ? String(academic.latestPercentage) : ''
  );
  const [targetPercentage, setTargetPercentage] = useState<string>(
    academic?.targetPercentage !== undefined && academic?.targetPercentage !== null ? String(academic.targetPercentage) : ''
  );
  const [attendancePercentage, setAttendancePercentage] = useState<string>(
    academic?.attendancePercentage !== undefined && academic?.attendancePercentage !== null ? String(academic.attendancePercentage) : ''
  );
  const [academicLevel, setAcademicLevel] = useState(academic?.academicLevel ?? '');
  const [currentExam, setCurrentExam] = useState(academic?.currentExam ?? '');
  const [favSubjectsStr, setFavSubjectsStr] = useState((academic?.favouriteSubjects ?? []).join(', '));
  const [weakSubjectsStr, setWeakSubjectsStr] = useState((academic?.weakSubjects ?? []).join(', '));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({
      previousPercentage: previousPercentage.trim() !== '' ? Number(previousPercentage) : undefined,
      latestPercentage: latestPercentage.trim() !== '' ? Number(latestPercentage) : undefined,
      targetPercentage: targetPercentage.trim() !== '' ? Number(targetPercentage) : undefined,
      attendancePercentage: attendancePercentage.trim() !== '' ? Number(attendancePercentage) : undefined,
      academicLevel: academicLevel.trim() || undefined,
      currentExam: currentExam.trim() || undefined,
      favouriteSubjects: favSubjectsStr.split(',').map((s) => s.trim()).filter(Boolean),
      weakSubjects: weakSubjectsStr.split(',').map((s) => s.trim()).filter(Boolean),
      examProgress: academic?.examProgress || [],
    });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Edit Academic Details</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Previous %</label>
              <input type="number" className="input-field" value={previousPercentage} onChange={(e) => setPreviousPercentage(e.target.value)} placeholder="e.g. 68" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Latest Exam %</label>
              <input type="number" className="input-field" value={latestPercentage} onChange={(e) => setLatestPercentage(e.target.value)} placeholder="e.g. 74" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Target %</label>
              <input type="number" className="input-field" value={targetPercentage} onChange={(e) => setTargetPercentage(e.target.value)} placeholder="e.g. 85" />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Attendance %</label>
              <input type="number" className="input-field" value={attendancePercentage} onChange={(e) => setAttendancePercentage(e.target.value)} placeholder="e.g. 90" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Academic Level</label>
              <input className="input-field" placeholder="e.g. Secondary / 10th" value={academicLevel} onChange={(e) => setAcademicLevel(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Current Exam</label>
              <input className="input-field" placeholder="e.g. Semester Examination" value={currentExam} onChange={(e) => setCurrentExam(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Strong Subjects (comma-separated)</label>
            <input className="input-field" value={favSubjectsStr} onChange={(e) => setFavSubjectsStr(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Subjects Needing Focus (comma-separated)</label>
            <input className="input-field" value={weakSubjectsStr} onChange={(e) => setWeakSubjectsStr(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditGoalsModal({
  goals,
  onClose,
  onSave,
}: {
  goals?: Mentee360Profile['goals'];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [careerGoal, setCareerGoal] = useState(goals?.careerGoal || '');
  const [semesterGoal, setSemesterGoal] = useState(goals?.semesterGoal || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({ careerGoal, semesterGoal });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>High-Level Targets</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Final Career Goal</label>
            <input className="input-field" value={careerGoal} onChange={(e) => setCareerGoal(e.target.value)} placeholder="e.g. AI Engineer & Technologist" />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Semester Goal</label>
            <textarea rows={2} className="input-field" value={semesterGoal} onChange={(e) => setSemesterGoal(e.target.value)} placeholder="e.g. Achieve 80% in semester examination" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GoalDetailModal({
  mode,
  goal,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  goal?: ShortTermGoal | null;
  onClose: () => void;
  onSave: (data: Partial<ShortTermGoal>) => Promise<void>;
}) {
  const [title, setTitle] = useState(goal?.title || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [progress, setProgress] = useState(goal?.progress ?? 0);
  const [deadline, setDeadline] = useState(goal?.deadline || '');
  const [status, setStatus] = useState<ShortTermGoal['status']>(goal?.status || 'In Progress');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({ title, description, progress: Number(progress), deadline, status });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{mode === 'add' ? 'Add Short-Term Goal' : 'Edit Goal'}</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Goal Title</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Description</label>
            <textarea rows={2} className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Progress ({progress}%)</label>
              <input type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Status</label>
              <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Deadline</label>
            <input type="date" className="input-field" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>Save Goal</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChallengeDetailModal({
  mode,
  challenge,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  challenge?: MenteeChallenge | null;
  onClose: () => void;
  onSave: (data: Partial<MenteeChallenge>) => Promise<void>;
}) {
  const [title, setTitle] = useState(challenge?.title || '');
  const [description, setDescription] = useState(challenge?.description || '');
  const [priority, setPriority] = useState<MenteeChallenge['priority']>(challenge?.priority || 'Medium');
  const [status, setStatus] = useState<MenteeChallenge['status']>(challenge?.status || 'In Progress');
  const [mentorAction, setMentorAction] = useState(challenge?.mentorAction || '');
  const [progress, setProgress] = useState(challenge?.progress ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({ title, description, priority, status, mentorAction, progress: Number(progress) });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 500, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{mode === 'add' ? 'Log New Challenge' : 'Edit Challenge'}</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Challenge Title</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Marathi writing speed" />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Description</label>
            <textarea rows={2} className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe difficulty observed..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Priority</label>
              <select className="input-field" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Status</label>
              <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Mentor Action Plan</label>
            <textarea rows={2} className="input-field" value={mentorAction} onChange={(e) => setMentorAction(e.target.value)} placeholder="Action items assigned to mentee..." />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Resolution Progress ({progress}%)</label>
            <input type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>Save Challenge</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditRoutineModal({
  routine,
  onClose,
  onSave,
}: {
  routine?: Mentee360Profile['routine'];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [selfStudyHours, setSelfStudyHours] = useState<string>(
    routine?.selfStudyHours !== undefined && routine?.selfStudyHours !== null ? String(routine.selfStudyHours) : ''
  );
  const [schedule, setSchedule] = useState(routine?.schedule ?? '');
  const [habitsStr, setHabitsStr] = useState((routine?.habits || []).join('\n'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({
      selfStudyHours: selfStudyHours.trim() !== '' ? Number(selfStudyHours) : undefined,
      schedule,
      habits: habitsStr.split('\n').map((h) => h.trim()).filter(Boolean),
    });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 500, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Edit Study Routine</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Daily Self-Study Hours</label>
            <input type="number" step="0.5" className="input-field" value={selfStudyHours} onChange={(e) => setSelfStudyHours(e.target.value)} placeholder="e.g. 2.5" />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Study Schedule</label>
            <textarea rows={3} className="input-field" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Study Habits (1 per line)</label>
            <textarea rows={3} className="input-field" value={habitsStr} onChange={(e) => setHabitsStr(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>Save Routine</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditCareerModal({
  career,
  onClose,
  onSave,
}: {
  career?: Mentee360Profile['careerInterests'];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [primaryGoal, setPrimaryGoal] = useState(career?.primaryGoal ?? '');
  const [secondaryStr, setSecondaryStr] = useState((career?.secondaryInterests || []).join(', '));
  const [otherStr, setOtherStr] = useState((career?.otherExplored || []).join(', '));
  const [hobbiesStr, setHobbiesStr] = useState((career?.hobbies || []).join(', '));
  const [skillsStr, setSkillsStr] = useState((career?.skills || []).join(', '));
  const [skillsToDevelopStr, setSkillsToDevelopStr] = useState((career?.skillsToDevelop || []).join(', '));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave({
      primaryGoal,
      secondaryInterests: secondaryStr.split(',').map((s) => s.trim()).filter(Boolean),
      otherExplored: otherStr.split(',').map((s) => s.trim()).filter(Boolean),
      hobbies: hobbiesStr.split(',').map((s) => s.trim()).filter(Boolean),
      skills: skillsStr.split(',').map((s) => s.trim()).filter(Boolean),
      skillsToDevelop: skillsToDevelopStr.split(',').map((s) => s.trim()).filter(Boolean),
      recommendedCourses: career?.recommendedCourses || [],
    });
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Edit Career & Interests</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Primary Career Goal</label>
            <input className="input-field" value={primaryGoal} onChange={(e) => setPrimaryGoal(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Secondary Interests (comma-separated)</label>
            <input className="input-field" value={secondaryStr} onChange={(e) => setSecondaryStr(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Other Explored Careers (comma-separated)</label>
            <input className="input-field" value={otherStr} onChange={(e) => setOtherStr(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Hobbies (comma-separated)</label>
            <input className="input-field" value={hobbiesStr} onChange={(e) => setHobbiesStr(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Existing Skills (comma-separated)</label>
            <input className="input-field" value={skillsStr} onChange={(e) => setSkillsStr(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Skills to Develop (comma-separated)</label>
            <input className="input-field" value={skillsToDevelopStr} onChange={(e) => setSkillsToDevelopStr(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WeeklyAiInsightsCard({
  aiInsights,
  isGeneratingAi,
  onGenerate,
}: {
  aiInsights: AiInsightsResult | null;
  isGeneratingAi: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="summary-card" style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
      <div className="ai-insights-header">
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)', fontWeight: 800 }}>
            <Sparkles size={15} color="var(--primary)" /> Supportive Intelligence
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 0' }}>Weekly AI Progress Insights</h3>
        </div>

        <button
          type="button"
          className="btn-primary ai-insights-btn"
          disabled={isGeneratingAi}
          onClick={onGenerate}
        >
          <Sparkles size={16} />
          {isGeneratingAi ? 'Analyzing Data…' : aiInsights ? 'Regenerate Insights' : 'Generate Weekly AI Insights'}
        </button>
      </div>

      {aiInsights ? (
        <div style={{ display: 'grid', gap: 16, minWidth: 0, width: '100%', maxWidth: '100%' }}>
          <div style={{ padding: '14px 16px', background: 'rgba(143,63,102,0.05)', borderRadius: 14, border: '1px solid var(--border)', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)' }}>
              Weekly Progress Summary
            </h4>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              {aiInsights.weeklySummary}
            </p>
          </div>

          <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 800 }}>
              Suggested Mentor Discussion Points
            </h4>
            <ul style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 8 }}>
              {aiInsights.discussionPoints.map((point, idx) => (
                <li key={idx} style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            ℹ️ AI suggestions are strictly informational and supportive. They do not diagnose or evaluate medical/psychological wellbeing.
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px 20px', background: '#fdfbfb', borderRadius: 12, border: '1px dashed var(--border)', textAlign: 'center', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Click "Generate Weekly AI Insights" to generate a supportive summary and suggested talking points for your next mentorship check-in.
          </p>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Provenance Badge Component (Source Indicator)
// ────────────────────────────────────────────────────────────────────────────
function ProvenanceBadge({
  fieldKey,
  provenance,
  hasPending,
}: {
  fieldKey: string;
  provenance?: Record<string, any>;
  hasPending?: boolean;
}) {
  if (hasPending) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.68rem',
          padding: '2px 7px',
          borderRadius: 10,
          background: 'rgba(245, 158, 11, 0.12)',
          color: '#d97706',
          fontWeight: 700,
        }}
      >
        <Clock size={11} /> Awaiting review
      </span>
    );
  }
  const entry = provenance?.[fieldKey];
  if (!entry) return null;
  if (entry.method === 'ai_approved') {
    return (
      <span
        title={`Extracted from call & approved by ${entry.updatedByName || 'mentor'}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.68rem',
          padding: '2px 7px',
          borderRadius: 10,
          background: 'rgba(99, 102, 241, 0.1)',
          color: 'var(--primary)',
          fontWeight: 700,
        }}
      >
        <Sparkles size={11} /> Call Extracted
      </span>
    );
  }
  if (entry.method === 'manual') {
    return (
      <span
        title={`Confirmed by ${entry.updatedByName || 'mentor'}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.68rem',
          padding: '2px 7px',
          borderRadius: 10,
          background: 'rgba(16, 185, 129, 0.1)',
          color: 'var(--success)',
          fontWeight: 700,
        }}
      >
        <CheckCircle2 size={11} /> Confirmed by mentor
      </span>
    );
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Review Suggestions Modal Component
// ────────────────────────────────────────────────────────────────────────────
function ReviewSuggestionsModal({
  isOpen,
  onClose,
  suggestions,
  onReview,
  onBulkReview,
  isReviewing,
}: {
  isOpen: boolean;
  onClose: () => void;
  suggestions: ProfileSuggestion[];
  onReview: (suggestionId: string, action: 'approve' | 'edit' | 'reject', editedValue?: any) => Promise<void>;
  onBulkReview: (action: 'approve' | 'reject') => Promise<void>;
  isReviewing: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>('');

  if (!isOpen) return null;

  const pendingList = suggestions.filter((s) => s.status === 'pending');
  const reviewedList = suggestions.filter((s) => s.status !== 'pending');
  const displayedList =
    filter === 'pending' ? pendingList : filter === 'reviewed' ? reviewedList : suggestions;

  const startEdit = (s: ProfileSuggestion) => {
    setEditingId(s._id);
    setEditVal(
      typeof s.extractedValue === 'object'
        ? JSON.stringify(s.extractedValue)
        : String(s.extractedValue),
    );
  };

  const saveEdit = async (s: ProfileSuggestion) => {
    let parsed: any = editVal;
    if (typeof s.extractedValue === 'number') {
      parsed = Number(editVal);
    } else if (Array.isArray(s.extractedValue)) {
      parsed = editVal.split(',').map((item) => item.trim());
    }
    await onReview(s._id, 'edit', parsed);
    setEditingId(null);
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="modal-container"
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                AI Profile Suggestions
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Review, edit, or approve mentee profile updates extracted from call conversations
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: '1.1rem', padding: '4px 8px', borderRadius: 6 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Filter & Bulk Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', borderRadius: 8, padding: '4px 10px' }}
              onClick={() => setFilter('pending')}
            >
              Pending ({pendingList.length})
            </button>
            <button
              type="button"
              className={`btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', borderRadius: 8, padding: '4px 10px' }}
              onClick={() => setFilter('all')}
            >
              All ({suggestions.length})
            </button>
            <button
              type="button"
              className={`btn-sm ${filter === 'reviewed' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', borderRadius: 8, padding: '4px 10px' }}
              onClick={() => setFilter('reviewed')}
            >
              Reviewed ({reviewedList.length})
            </button>
          </div>

          {filter === 'pending' && pendingList.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={isReviewing}
                style={{
                  fontSize: '0.78rem',
                  padding: '5px 12px',
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'var(--success)',
                  borderColor: 'var(--success)',
                }}
                onClick={() => onBulkReview('approve')}
              >
                <CheckCircle2 size={13} /> Approve All ({pendingList.length})
              </button>
              <button
                type="button"
                className="btn-outline btn-sm"
                disabled={isReviewing}
                style={{
                  fontSize: '0.78rem',
                  padding: '5px 10px',
                  borderRadius: 8,
                  color: 'var(--danger)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                }}
                onClick={() => onBulkReview('reject')}
              >
                Reject All
              </button>
            </div>
          )}
        </div>

        {/* Suggestions List Content */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayedList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-secondary)' }}>
              <Sparkles size={32} color="var(--primary)" style={{ opacity: 0.3, margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No suggestions in this view.</p>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                New profile suggestions are automatically proposed after call recordings are transcribed.
              </p>
            </div>
          ) : (
            displayedList.map((s) => {
              const isEditing = editingId === s._id;
              const isPending = s.status === 'pending';

              return (
                <div
                  key={s._id}
                  style={{
                    border: s.conflictFlag ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 14,
                    background: s.conflictFlag ? 'rgba(245, 158, 11, 0.02)' : 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          textTransform: 'uppercase',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(99, 102, 241, 0.1)',
                          color: 'var(--primary)',
                        }}
                      >
                        {s.category}
                      </span>
                      <strong style={{ fontSize: '0.94rem' }}>{s.label}</strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      <span>Source: {s.sourceType}</span>
                      <span>•</span>
                      <span>{Math.round(s.confidence * 100)}% confidence</span>
                      {s.callDate && (
                        <>
                          <span>•</span>
                          <span>{formatDateOnly(s.callDate)}</span>
                        </>
                      )}
                      {!isPending && (
                        <span
                          style={{
                            marginLeft: 4,
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            background: s.status === 'approved' || s.status === 'modified' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: s.status === 'approved' || s.status === 'modified' ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {s.status.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Conflict Notice */}
                  {s.conflictFlag && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        fontSize: '0.78rem',
                        color: '#b45309',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <AlertCircle size={15} />
                      <span>{s.conflictDetails || 'Differs from existing profile value.'}</span>
                    </div>
                  )}

                  {/* Side-by-side comparison */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Current Profile Value
                      </div>
                      <div style={{ marginTop: 4, fontSize: '0.88rem', fontWeight: 600, color: s.currentValue != null ? 'var(--text)' : 'var(--text-secondary)' }}>
                        {s.currentValue != null
                          ? typeof s.currentValue === 'object'
                            ? JSON.stringify(s.currentValue)
                            : String(s.currentValue)
                          : 'Not set (empty)'}
                      </div>
                    </div>

                    <div style={{ padding: '8px 12px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Proposed Extracted Value
                      </div>
                      {isEditing ? (
                        <div style={{ marginTop: 4 }}>
                          <input
                            type="text"
                            className="input-field"
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            style={{ fontSize: '0.86rem', padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div style={{ marginTop: 4, fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)' }}>
                          {typeof s.extractedValue === 'object'
                            ? JSON.stringify(s.extractedValue)
                            : String(s.extractedValue)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Evidence quote */}
                  {s.evidence && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-muted)', fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                      💬 "{s.evidence}"
                    </div>
                  )}

                  {/* Actions Bar */}
                  {isPending && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            style={{ fontSize: '0.78rem' }}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            style={{ fontSize: '0.78rem' }}
                            disabled={isReviewing}
                            onClick={() => saveEdit(s)}
                          >
                            Save & Approve
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            style={{ fontSize: '0.78rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            disabled={isReviewing}
                            onClick={() => onReview(s._id, 'reject')}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ fontSize: '0.78rem' }}
                            disabled={isReviewing}
                            onClick={() => startEdit(s)}
                          >
                            <Edit3 size={13} style={{ marginRight: 3 }} /> Edit
                          </button>
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            style={{ fontSize: '0.78rem', background: 'var(--success)', borderColor: 'var(--success)' }}
                            disabled={isReviewing}
                            onClick={() => onReview(s._id, 'approve')}
                          >
                            <CheckCircle2 size={13} style={{ marginRight: 3 }} /> Approve
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}


