import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, BookOpen, AlertCircle, HelpCircle, ArrowLeft, Calendar, Edit3 } from 'lucide-react';
import { submitDailyPerformance, getTodayPerformance, updateDailyPerformance } from '../lib/api';

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
  const [alreadySubmittedToday, setAlreadySubmittedToday] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Check if today already has a record on initial load
  useEffect(() => {
    getTodayPerformance(selectedDate)
      .then((res) => {
        if (res.record) {
          setExistingRecordId(res.record._id || res.record.id);
          setExistingRecordDate(res.record.date);
          setAlreadySubmittedToday(true);
        } else {
          setExistingRecordId(null);
          setAlreadySubmittedToday(false);
        }
      })
      .catch(() => {});
  }, [selectedDate]);

  const populateForEditing = (record: any) => {
    if (!record) return;
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
        await updateDailyPerformance(existingRecordId, payload);
        setSuccessMessage('Your daily progress has been updated. Your mentor can now see your updated progress.');
      } else {
        await submitDailyPerformance(payload);
        setSuccessMessage('Your daily progress has been recorded. Your mentor can now see your progress.');
      }
      setAlreadySubmittedToday(true);
      setIsEditing(false);
    } catch (err: any) {
      if (err.status === 409 || err.message?.includes('already submitted')) {
        setAlreadySubmittedToday(true);
        if (err.existingId) setExistingRecordId(err.existingId);
        setErrorMessage("Today's progress already submitted. You can edit your entry below.");
      } else {
        setErrorMessage(err.message || 'Unable to submit daily progress. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="daily-form-container" style={{ maxWidth: 740, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header Back button */}
      <button
        type="button"
        className="btn-secondary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: '0.88rem' }}
        onClick={() => navigate('/mentee')}
      >
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      {/* Page Title & Subtitle */}
      <div className="form-hero-block" style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', margin: 0 }}>
          How was your day?
        </h1>
        <p className="muted" style={{ fontSize: '1.05rem', marginTop: 8, maxWidth: 520, margin: '8px auto 0' }}>
          Take a minute to record your learning and personal progress today.
        </p>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="summary-card"
          style={{
            background: 'linear-gradient(135deg, rgba(46, 125, 50, 0.08), rgba(46, 125, 50, 0.02))',
            borderColor: '#a5d6a7',
            marginBottom: 24,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <CheckCircle2 size={40} color="#2e7d32" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ margin: 0, color: '#1b5e20', fontWeight: 800 }}>Your daily progress has been recorded.</h3>
          <p style={{ color: '#2e7d32', marginTop: 6, fontSize: '0.95rem' }}>
            "Your mentor can now see your progress."
          </p>
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
          className="summary-card"
          style={{
            background: 'linear-gradient(135deg, rgba(143, 63, 102, 0.08), rgba(143, 63, 102, 0.02))',
            borderColor: 'var(--border)',
            marginBottom: 24,
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
          <p className="muted" style={{ margin: '6px 0 18px', fontSize: '0.92rem' }}>
            You have already recorded an entry for {existingRecordDate ?? selectedDate}. Would you like to update it?
          </p>
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
        <div style={{ background: '#ffebee', color: '#c62828', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: '0.92rem', fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* The Form */}
      {(!alreadySubmittedToday || isEditing) && (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
          {/* Section A: Date */}
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color="var(--primary)" /> Date
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
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color="var(--primary)" /> Study Hours
              </h3>
            </div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 14 }}>
              How many hours did you study today?
            </p>

            {/* Quick chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {STUDY_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => {
                    setStudyMinutes(preset.minutes);
                    setCustomStudy(false);
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 24,
                    border: '1px solid',
                    borderColor: (!customStudy && studyMinutes === preset.minutes) ? 'var(--primary)' : 'var(--border)',
                    background: (!customStudy && studyMinutes === preset.minutes) ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                    color: (!customStudy && studyMinutes === preset.minutes) ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomStudy(true)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 24,
                  border: '1px solid',
                  borderColor: customStudy ? 'var(--primary)' : 'var(--border)',
                  background: customStudy ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                  color: customStudy ? 'var(--primary)' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                }}
              >
                Custom…
              </button>
            </div>

            {/* Custom Input */}
            {customStudy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
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
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(143, 63, 102, 0.05)', borderRadius: 8, display: 'inline-block' }}>
              <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recorded: </span>
              <strong style={{ color: 'var(--primary)', fontSize: '0.92rem' }}>{formatMinutes(studyMinutes)}</strong>
            </div>
          </div>

          {/* Section 2: Quran / Islamic Reading */}
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={18} color="var(--primary)" /> Quran / Islamic Reading
              </h3>
            </div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 16 }}>
              Record what you completed today. Enter whichever measurement you normally use (none are forced).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <div className="field">
                <label style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 4 }}>Ruku</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="e.g. 2"
                  value={ruku}
                  onChange={(e) => setRuku(e.target.value)}
                  style={{ height: 48, fontSize: '1rem', fontWeight: 600 }}
                />
                <small className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>How many Ruku?</small>
              </div>

              <div className="field">
                <label style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 4 }}>Ayat</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="e.g. 25"
                  value={ayat}
                  onChange={(e) => setAyat(e.target.value)}
                  style={{ height: 48, fontSize: '1rem', fontWeight: 600 }}
                />
                <small className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>How many Ayat?</small>
              </div>

              <div className="field">
                <label style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 4 }}>Pages</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="e.g. 5"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  style={{ height: 48, fontSize: '1rem', fontWeight: 600 }}
                />
                <small className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>How many Pages?</small>
              </div>
            </div>
          </div>

          {/* Section 3: General Reading */}
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color="var(--primary)" /> Reading Time
              </h3>
            </div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 14 }}>
              How much time did you spend reading today?
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {READING_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => {
                    setReadingMinutes(preset.minutes);
                    setCustomReading(false);
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 24,
                    border: '1px solid',
                    borderColor: (!customReading && readingMinutes === preset.minutes) ? 'var(--primary)' : 'var(--border)',
                    background: (!customReading && readingMinutes === preset.minutes) ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                    color: (!customReading && readingMinutes === preset.minutes) ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomReading(true)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 24,
                  border: '1px solid',
                  borderColor: customReading ? 'var(--primary)' : 'var(--border)',
                  background: customReading ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                  color: customReading ? 'var(--primary)' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                }}
              >
                Custom…
              </button>
            </div>

            {customReading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
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

            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(143, 63, 102, 0.05)', borderRadius: 8, display: 'inline-block' }}>
              <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recorded: </span>
              <strong style={{ color: 'var(--primary)', fontSize: '0.92rem' }}>{formatMinutes(readingMinutes)}</strong>
            </div>
          </div>

          {/* Section 4: Day Overall */}
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                How was your day overall?
              </h3>
            </div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 16 }}>
              Select the mood that best represents your experience today.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {MOOD_OPTIONS.map((mood) => (
                <button
                  type="button"
                  key={mood.rating}
                  onClick={() => setDayRating(mood.rating)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '14px 8px',
                    borderRadius: 16,
                    border: '1px solid',
                    borderColor: dayRating === mood.rating ? 'var(--primary)' : 'var(--border)',
                    background: dayRating === mood.rating ? 'rgba(143, 63, 102, 0.08)' : '#fff',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease',
                  }}
                >
                  <span style={{ fontSize: '2rem' }}>{mood.emoji}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: dayRating === mood.rating ? 800 : 600, color: dayRating === mood.rating ? 'var(--primary)' : 'var(--text-primary)', textAlign: 'center' }}>
                    {mood.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: Optional Daily Reflection */}
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                What did you learn or accomplish today? <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 500 }}>(Optional)</span>
              </h3>
            </div>
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 10 }}>
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

          {/* Section 6: Challenges / Support */}
          <div className="summary-card">
            <div className="summary-header" style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} color="var(--primary)" /> Challenges & Mentor Support
              </h3>
            </div>

            {/* Question 1: Faced difficulty */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, display: 'block', marginBottom: 10 }}>
                Did you face any difficulty today?
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setFacedDifficulty(false)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 20,
                    border: '1px solid',
                    borderColor: !facedDifficulty ? 'var(--primary)' : 'var(--border)',
                    background: !facedDifficulty ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                    color: !facedDifficulty ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setFacedDifficulty(true)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 20,
                    border: '1px solid',
                    borderColor: facedDifficulty ? 'var(--primary)' : 'var(--border)',
                    background: facedDifficulty ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                    color: facedDifficulty ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Yes
                </button>
              </div>

              {facedDifficulty && (
                <div style={{ marginTop: 12 }}>
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
              <label style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <HelpCircle size={16} color="var(--primary)" /> Do you need help from your mentor?
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setNeedsMentorHelp(false)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 20,
                    border: '1px solid',
                    borderColor: !needsMentorHelp ? 'var(--primary)' : 'var(--border)',
                    background: !needsMentorHelp ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                    color: !needsMentorHelp ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setNeedsMentorHelp(true)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 20,
                    border: '1px solid',
                    borderColor: needsMentorHelp ? 'var(--primary)' : 'var(--border)',
                    background: needsMentorHelp ? 'rgba(143, 63, 102, 0.12)' : '#fff',
                    color: needsMentorHelp ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Yes
                </button>
              </div>

              {needsMentorHelp && (
                <div style={{ marginTop: 12 }}>
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

          {/* Sticky Submit Bar on Mobile & Bottom Button */}
          <div
            className="submit-bar"
            style={{
              position: 'sticky',
              bottom: 16,
              background: '#fff',
              padding: '16px 20px',
              borderRadius: 20,
              boxShadow: '0 8px 30px rgba(95, 70, 81, 0.15)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              zIndex: 10,
            }}
          >
            <div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Ready to record?</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{formatMinutes(studyMinutes)} study • {dayRating}/5 mood</div>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              style={{ height: 48, padding: '0 28px', fontSize: '1rem', borderRadius: 14 }}
            >
              {isSubmitting ? 'Saving...' : isEditing ? "Update Today's Progress" : "Submit Today's Progress"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
