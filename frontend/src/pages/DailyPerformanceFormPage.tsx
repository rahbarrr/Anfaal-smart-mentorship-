import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, BookOpen, AlertCircle, HelpCircle, ArrowLeft, Calendar, Edit3, Check, Loader2 } from 'lucide-react';
import { submitDailyPerformance, getTodayPerformance, updateDailyPerformance } from '../lib/api';
import { formatDateTime, formatDateOnly, formatTimeOnly } from '../lib/dateTime';
import './DailyPerformanceFormPage.css';

const STUDY_PRESETS = [
  { label: '0 hrs', minutes: 0 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hrs', minutes: 90 },
  { label: '2 hours', minutes: 120 },
  { label: '2.5 hrs', minutes: 150 },
  { label: '3 hours', minutes: 180 },
  { label: '4+ hrs', minutes: 240 },
];

const READING_PRESETS = [
  { label: '0 min', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hrs', minutes: 90 },
  { label: '2+ hrs', minutes: 120 },
];

const MOOD_OPTIONS = [
  { rating: 1, emoji: '😞', label: 'Very difficult' },
  { rating: 2, emoji: '😕', label: 'Difficult' },
  { rating: 3, emoji: '😐', label: 'Okay' },
  { rating: 4, emoji: '🙂', label: 'Good' },
  { rating: 5, emoji: '😊', label: 'Very good' },
];

function formatMinutes(min: number): string {
  if (min === 0) return '0 minutes';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m (${min} min)`;
  if (h > 0) return `${h} ${h === 1 ? 'hour' : 'hours'} (${min} min)`;
  return `${m} minutes`;
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DailyPerformanceFormPage() {
  const navigate = useNavigate();
  const todayStr = getTodayString();

  // Form states
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [studyMinutes, setStudyMinutes] = useState<number>(120);
  const [customStudy, setCustomStudy] = useState(false);
  const [customStudyHours, setCustomStudyHours] = useState('');

  // Quran
  const [ruku, setRuku] = useState<string>('');
  const [ayat, setAyat] = useState<string>('');
  const [pages, setPages] = useState<string>('');

  // General Reading
  const [readingMinutes, setReadingMinutes] = useState<number>(30);
  const [customReading, setCustomReading] = useState(false);
  const [customReadingVal, setCustomReadingVal] = useState('');

  // Day Overall
  const [dayRating, setDayRating] = useState<number>(4);

  // Reflection & Challenges
  const [dailyReflection, setDailyReflection] = useState('');
  const [facedDifficulty, setFacedDifficulty] = useState(false);
  const [difficultyNote, setDifficultyNote] = useState('');
  const [needsMentorHelp, setNeedsMentorHelp] = useState(false);
  const [mentorHelpNote, setMentorHelpNote] = useState('');

  // Submission & duplication state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [existingRecordDate, setExistingRecordDate] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<any>(null);
  const [alreadySubmittedToday, setAlreadySubmittedToday] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Check if today already has a record on initial load
  useEffect(() => {
    getTodayPerformance(selectedDate)
      .then((res) => {
        if (res.record) {
          setCurrentRecord(res.record);
          setExistingRecordId(res.record._id || res.record.id);
          setExistingRecordDate(res.record.date);
          setAlreadySubmittedToday(true);
        } else {
          setCurrentRecord(null);
          setExistingRecordId(null);
          setAlreadySubmittedToday(false);
        }
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load today\'s progress.');
      });
  }, [selectedDate]);

  const populateForEditing = (record: any) => {
    if (!record) return;
    setCurrentRecord(record);
    setStudyMinutes(record.studyMinutes ?? 0);
    setRuku(record.quran?.ruku ? String(record.quran.ruku) : '');
    setAyat(record.quran?.ayat ? String(record.quran.ayat) : '');
    setPages(record.quran?.pages ? String(record.quran.pages) : '');
    setReadingMinutes(record.readingMinutes ?? 0);
    setDayRating(record.dayRating ?? 4);
    setDailyReflection(record.dailyReflection ?? '');
    setFacedDifficulty(Boolean(record.facedDifficulty));
    setDifficultyNote(record.difficultyNote ?? '');
    setNeedsMentorHelp(Boolean(record.needsMentorHelp));
    setMentorHelpNote(record.mentorHelpNote ?? '');
    setIsEditing(true);
    setAlreadySubmittedToday(false);
  };

  const handleEditClick = async () => {
    try {
      const res = await getTodayPerformance(selectedDate);
      if (res.record) {
        populateForEditing(res.record);
      } else {
        setIsEditing(true);
        setAlreadySubmittedToday(false);
      }
    } catch {
      setIsEditing(true);
      setAlreadySubmittedToday(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const payload = {
      date: selectedDate,
      studyMinutes: Number(studyMinutes),
      quran: {
        ruku: ruku ? Math.max(0, parseInt(ruku, 10) || 0) : 0,
        ayat: ayat ? Math.max(0, parseInt(ayat, 10) || 0) : 0,
        pages: pages ? Math.max(0, parseInt(pages, 10) || 0) : 0,
      },
      readingMinutes: Number(readingMinutes),
      dayRating,
      dailyReflection: dailyReflection.trim() || undefined,
      facedDifficulty,
      difficultyNote: facedDifficulty ? difficultyNote.trim() : undefined,
      needsMentorHelp,
      mentorHelpNote: needsMentorHelp ? mentorHelpNote.trim() : undefined,
    };

    try {
      if (isEditing && existingRecordId) {
        const res = await updateDailyPerformance(existingRecordId, payload);
        setCurrentRecord(res.record || null);
        setSuccessMessage('Your daily progress has been updated. Your mentor can now see your updated progress.');
      } else {
        const res = await submitDailyPerformance(payload);
        setCurrentRecord(res.record || null);
        setSuccessMessage('Your daily progress has been recorded. Your mentor can now see your progress.');
      }
      setAlreadySubmittedToday(true);
      setIsEditing(false);
    } catch (err: any) {
      if (err.status === 409 || err.message?.includes('already submitted')) {
        setAlreadySubmittedToday(true);
        if (err.existingId) setExistingRecordId(err.existingId);
        if (err.existing) setCurrentRecord(err.existing);
        setErrorMessage("Today's progress already submitted. You can edit your entry below.");
      } else {
        setErrorMessage(err.message || 'Unable to submit daily progress. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMood = MOOD_OPTIONS.find((m) => m.rating === dayRating) || MOOD_OPTIONS[3];

  return (
    <div className="daily-form-container">
      {/* Header Back button (Desktop only, MobileHeader handles back on phones) */}
      <button
        type="button"
        className="daily-form-back-btn"
        onClick={() => navigate('/mentee')}
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Page Title & Subtitle */}
      <div className="daily-form-hero">
        <h1>How was your day?</h1>
        <p>Take a minute to record your learning and personal progress today.</p>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="daily-form-card"
          style={{
            background: 'linear-gradient(135deg, rgba(46, 125, 50, 0.08), rgba(46, 125, 50, 0.02))',
            borderColor: '#a5d6a7',
            marginBottom: 20,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <CheckCircle2 size={40} color="#2e7d32" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ margin: 0, color: '#1b5e20', fontWeight: 800 }}>
            {isEditing ? 'Your daily progress has been updated.' : 'Your daily progress has been recorded.'}
          </h3>
          <p style={{ color: '#2e7d32', marginTop: 6, fontSize: '0.95rem' }}>
            "Your mentor can now see your progress."
          </p>

          {currentRecord && (
            <div
              style={{
                marginTop: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'center',
                background: 'rgba(46, 125, 50, 0.1)',
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: '0.85rem',
                color: '#1b5e20',
                fontWeight: 600,
              }}
            >
              <span>✓ Submitted {formatDateTime(currentRecord.submittedAt || currentRecord.createdAt)}</span>
              {currentRecord.updatedAt && currentRecord.submittedAt && new Date(currentRecord.updatedAt).getTime() - new Date(currentRecord.submittedAt).getTime() > 30000 && (
                <span style={{ color: '#2e7d32' }}>• Last updated: {formatDateTime(currentRecord.updatedAt)}</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <button className="btn-secondary" onClick={() => navigate('/mentee')}>
              View Dashboard
            </button>
            <button className="btn-secondary" onClick={() => navigate('/mentee/history')}>
              View History
            </button>
          </div>
        </div>
      )}

      {/* Already Submitted Warning / Edit Banner */}
      {alreadySubmittedToday && !isEditing && !successMessage && (
        <div
          className="daily-form-card"
          style={{
            background: 'linear-gradient(135deg, rgba(143, 63, 102, 0.08), rgba(143, 63, 102, 0.02))',
            borderColor: 'var(--border)',
            marginBottom: 20,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <Calendar size={22} color="var(--primary)" />
            <h3 style={{ margin: 0, fontWeight: 800, color: 'var(--text-primary)' }}>
              Today's progress already submitted
            </h3>
          </div>
          <p className="muted" style={{ margin: '6px 0 10px', fontSize: '0.92rem' }}>
            You have already recorded an entry for {formatDateOnly(existingRecordDate ?? selectedDate)}. Would you like to update it?
          </p>

          {currentRecord && (
            <div style={{ margin: '8px 0 16px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span>Submitted: <strong style={{ color: 'var(--text-primary)' }}>{formatDateOnly(currentRecord.submittedAt || currentRecord.createdAt)} • {formatTimeOnly(currentRecord.submittedAt || currentRecord.createdAt)}</strong></span>
                {currentRecord.updatedAt && currentRecord.submittedAt && new Date(currentRecord.updatedAt).getTime() - new Date(currentRecord.submittedAt).getTime() > 30000 && (
                  <span>• Last updated: <strong style={{ color: 'var(--text-primary)' }}>{formatDateOnly(currentRecord.updatedAt)} • {formatTimeOnly(currentRecord.updatedAt)}</strong></span>
                )}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button className="btn-primary" onClick={handleEditClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Edit3 size={16} /> Edit Today's Entry
            </button>
            <button className="btn-secondary" onClick={() => navigate('/mentee')}>
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '12px 16px', borderRadius: 12, marginBottom: 18, fontSize: '0.92rem', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* The Form */}
      {(!alreadySubmittedToday || isEditing) && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Section A: Date */}
          <div className="daily-form-card">
            <div className="daily-card-header">
              <h3 className="daily-card-title">
                <Calendar size={18} /> Date
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <input
                type="date"
                className="input"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ maxWidth: 220, height: 48, fontSize: '1rem', fontWeight: 600 }}
              />
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {selectedDate === todayStr ? "(Today's date)" : '(Backdated entry)'}
              </span>
            </div>
          </div>

          {/* Section B: Study Hours */}
          <div className="daily-form-card">
            <div className="daily-card-header">
              <h3 className="daily-card-title">
                <Clock size={18} /> Study Hours
              </h3>
            </div>
            <p className="daily-card-desc">
              How many hours did you study today?
            </p>

            {/* Quick chips */}
            <div className="daily-chips-row">
              {STUDY_PRESETS.map((preset) => {
                const isActive = !customStudy && studyMinutes === preset.minutes;
                return (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => {
                      setStudyMinutes(preset.minutes);
                      setCustomStudy(false);
                    }}
                    className={`daily-preset-chip ${isActive ? 'active' : ''}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomStudy(true)}
                className={`daily-preset-chip ${customStudy ? 'active' : ''}`}
              >
                Custom…
              </button>
            </div>

            {/* Custom Input */}
            {customStudy && (
              <div className="daily-custom-input-row">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  className="input"
                  placeholder="Minutes (e.g. 150)"
                  value={customStudyHours}
                  onChange={(e) => {
                    setCustomStudyHours(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setStudyMinutes(val);
                  }}
                  style={{ width: 180, height: 46 }}
                />
                <span className="muted" style={{ fontSize: '0.85rem' }}>minutes</span>
              </div>
            )}

            {/* Display formatted */}
            <div className="daily-recorded-badge">
              <span>Recorded:</span>
              <strong>{formatMinutes(studyMinutes)}</strong>
            </div>
          </div>

          {/* Section C: Quran / Islamic Reading */}
          <div className="daily-form-card">
            <div className="daily-card-header">
              <h3 className="daily-card-title">
                <BookOpen size={18} /> Quran / Islamic Reading
              </h3>
            </div>
            <p className="daily-card-desc">
              Record what you completed today. Enter whichever measurement you normally use (none are forced).
            </p>

            <div className="daily-quran-grid">
              <div className="daily-quran-field">
                <label>Ruku</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="e.g. 2"
                  value={ruku}
                  onChange={(e) => setRuku(e.target.value)}
                />
                <small>How many Ruku?</small>
              </div>

              <div className="daily-quran-field">
                <label>Ayat</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="e.g. 25"
                  value={ayat}
                  onChange={(e) => setAyat(e.target.value)}
                />
                <small>How many Ayat?</small>
              </div>

              <div className="daily-quran-field">
                <label>Pages</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="e.g. 5"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                />
                <small>How many Pages?</small>
              </div>
            </div>
          </div>

          {/* Section D: Reading Time */}
          <div className="daily-form-card">
            <div className="daily-card-header">
              <h3 className="daily-card-title">
                <Clock size={18} /> Reading Time
              </h3>
            </div>
            <p className="daily-card-desc">
              How much time did you spend reading today?
            </p>

            <div className="daily-chips-row">
              {READING_PRESETS.map((preset) => {
                const isActive = !customReading && readingMinutes === preset.minutes;
                return (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => {
                      setReadingMinutes(preset.minutes);
                      setCustomReading(false);
                    }}
                    className={`daily-preset-chip ${isActive ? 'active' : ''}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomReading(true)}
                className={`daily-preset-chip ${customReading ? 'active' : ''}`}
              >
                Custom…
              </button>
            </div>

            {customReading && (
              <div className="daily-custom-input-row">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  className="input"
                  placeholder="Minutes (e.g. 40)"
                  value={customReadingVal}
                  onChange={(e) => {
                    setCustomReadingVal(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setReadingMinutes(val);
                  }}
                  style={{ width: 180, height: 46 }}
                />
                <span className="muted" style={{ fontSize: '0.85rem' }}>minutes</span>
              </div>
            )}

            <div className="daily-recorded-badge">
              <span>Recorded:</span>
              <strong>{formatMinutes(readingMinutes)}</strong>
            </div>
          </div>

          {/* Section E: Day Overall / Mood Selector (Responsive Grid) */}
          <div className="daily-form-card">
            <div className="daily-card-header">
              <h3 className="daily-card-title">
                How was your day overall?
              </h3>
            </div>
            <p className="daily-card-desc">
              Select the mood that best represents your experience today.
            </p>

            <div
              className="daily-mood-grid"
              role="radiogroup"
              aria-label="How was your day overall?"
            >
              {MOOD_OPTIONS.map((mood) => {
                const isSelected = dayRating === mood.rating;
                return (
                  <button
                    type="button"
                    key={mood.rating}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${mood.label} (${mood.rating} of 5)`}
                    onClick={() => setDayRating(mood.rating)}
                    className={`daily-mood-card ${isSelected ? 'selected' : ''}`}
                  >
                    {isSelected && (
                      <span className="daily-mood-badge" aria-hidden="true">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    <span className="daily-mood-emoji" aria-hidden="true">{mood.emoji}</span>
                    <span className="daily-mood-label">
                      {mood.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section F: Optional Daily Reflection */}
          <div className="daily-form-card">
            <div className="daily-card-header">
              <h3 className="daily-card-title">
                What did you learn or accomplish today? <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 500 }}>(Optional)</span>
              </h3>
            </div>
            <p className="daily-card-desc">
              Share something you learned, completed, or felt proud of today…
            </p>
            <textarea
              className="input"
              rows={3}
              maxLength={1000}
              placeholder="Share something you learned, completed, or felt proud of today..."
              value={dailyReflection}
              onChange={(e) => setDailyReflection(e.target.value)}
              style={{ width: '100%', fontSize: '0.95rem', padding: 12, height: 90 }}
            />
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <small className="muted" style={{ fontSize: '0.75rem' }}>{dailyReflection.length} / 1000 characters</small>
            </div>
          </div>

          {/* Section G: Challenges / Mentor Support */}
          <div className="daily-form-card">
            <div className="daily-card-header" style={{ marginBottom: 12 }}>
              <h3 className="daily-card-title">
                <AlertCircle size={18} /> Challenges & Mentor Support
              </h3>
            </div>

            {/* Question 1: Faced difficulty */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
                Did you face any difficulty today?
              </label>
              <div className="daily-toggle-group">
                <button
                  type="button"
                  onClick={() => setFacedDifficulty(false)}
                  className={`daily-toggle-btn ${!facedDifficulty ? 'active' : ''}`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setFacedDifficulty(true)}
                  className={`daily-toggle-btn ${facedDifficulty ? 'active' : ''}`}
                >
                  Yes
                </button>
              </div>

              {facedDifficulty && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    What difficulty did you face?
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={1000}
                    placeholder="e.g. I had difficulty concentrating during my studies."
                    value={difficultyNote}
                    onChange={(e) => setDifficultyNote(e.target.value)}
                    style={{ width: '100%', fontSize: '0.9rem', padding: 10 }}
                  />
                </div>
              )}
            </div>

            {/* Question 2: Need mentor help */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-primary)' }}>
                <HelpCircle size={16} color="var(--primary)" /> Do you need help from your mentor?
              </label>
              <div className="daily-toggle-group">
                <button
                  type="button"
                  onClick={() => setNeedsMentorHelp(false)}
                  className={`daily-toggle-btn ${!needsMentorHelp ? 'active' : ''}`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setNeedsMentorHelp(true)}
                  className={`daily-toggle-btn ${needsMentorHelp ? 'active' : ''}`}
                >
                  Yes
                </button>
              </div>

              {needsMentorHelp && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    What would you like help with?
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={1000}
                    placeholder="e.g. Organizing my study schedule or questions on mathematics..."
                    value={mentorHelpNote}
                    onChange={(e) => setMentorHelpNote(e.target.value)}
                    style={{ width: '100%', fontSize: '0.9rem', padding: 10 }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section H: Compact Natural-Flow Submission Card */}
          <div className="daily-submission-card">
            <div className="daily-submission-summary">
              <div className="daily-submission-summary-header">
                <span className="daily-submission-summary-tag">Ready to record?</span>
                <span className="daily-submission-summary-date">{formatDateOnly(selectedDate)}</span>
              </div>
              <div className="daily-submission-pills">
                <span className="daily-summary-pill">
                  <Clock size={13} /> {formatMinutes(studyMinutes)} study
                </span>
                {readingMinutes > 0 && (
                  <span className="daily-summary-pill">
                    <BookOpen size={13} /> {formatMinutes(readingMinutes)} reading
                  </span>
                )}
                <span className="daily-summary-pill">
                  <span>{selectedMood.emoji}</span> {selectedMood.label} ({dayRating}/5)
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="daily-submit-btn"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="daily-spinner" />
                  <span>Submitting Today's Progress...</span>
                </>
              ) : isEditing ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>Update Today's Progress</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Submit Today's Progress</span>
                </>
              )}
            </button>

            <p className="daily-submit-hint">
              Your entry will be saved and visible to your mentor.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
