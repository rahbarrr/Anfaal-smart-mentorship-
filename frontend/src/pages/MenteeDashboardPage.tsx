import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Edit3, ArrowRight, History, Clock, BookOpen, BookMarked, Star, CircleDot } from 'lucide-react';
import { getTodayPerformance, getWeeklyPerformance } from '../lib/api';
import { formatSubmissionTimestamps } from '../lib/dateTime';

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

export function MenteeDashboardPage() {
  const navigate = useNavigate();
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getTodayPerformance(), getWeeklyPerformance()]).then(([todayRes, weeklyRes]) => {
      setTodayRecord(todayRes.record ?? null);
      setWeeklySummary(weeklyRes.summary ?? null);
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'Unable to load your performance data.');
    });
  }, []);

  const moodInfo = todayRecord ? (MOOD_MAP[todayRecord.dayRating] ?? { emoji: '🙂', label: 'Good' }) : null;

  return (
    <div className="mentee-dashboard" style={{ display: 'grid', gap: 24, paddingBottom: 24, minWidth: 0, width: '100%', maxWidth: '100%' }}>
      {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
      {/* ── Today's Progress Hero Card (Requirement 8) ────────────────────── */}
      <div className="today-status-card">
        <div className="today-status-header">
          <div className="today-status-title-group">
            <div className="today-status-eyebrow">
              <CalendarCheck size={14} className="metric-icon" />
              <span>Daily Performance</span>
            </div>
            <h2 className="today-status-title" style={{ fontSize: '1.45rem' }}>
              Today's Progress
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div className={`today-status-badge ${todayRecord ? 'submitted' : 'pending'}`}>
                <span className="status-badge-dot" />
                <span>{todayRecord ? 'Submitted' : 'Status: Not submitted'}</span>
              </div>
              {todayRecord && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  <span style={{ color: '#2e7d32', fontWeight: 600 }}>✓ Submitted {formatSubmissionTimestamps(todayRecord.submittedAt || todayRecord.createdAt, todayRecord.updatedAt).submittedFormatted}</span>
                  {formatSubmissionTimestamps(todayRecord.submittedAt || todayRecord.createdAt, todayRecord.updatedAt).isEdited && (
                    <span> • Updated {formatSubmissionTimestamps(todayRecord.submittedAt || todayRecord.createdAt, todayRecord.updatedAt).updatedFormatted}</span>
                  )}
                </div>
              )}
            </div>

            {todayRecord ? (
              <button
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.86rem', padding: '6px 14px' }}
                onClick={() => navigate('/mentee/daily')}
              >
                <Edit3 size={15} /> Edit Today's Entry
              </button>
            ) : (
              <button
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.9rem', padding: '8px 18px' }}
                onClick={() => navigate('/mentee/daily')}
              >
                + Record Today's Progress
              </button>
            )}
          </div>
        </div>

        {/* Info Grid */}
        {todayRecord ? (
          <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
            <div className="today-perf-metrics-grid">
              <div>
                <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Study</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>
                  {formatDuration(todayRecord.studyMinutes)}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quran</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 2, color: 'var(--text-primary)' }}>
                  {todayRecord.quran?.ruku ?? 0} Ruku • {todayRecord.quran?.ayat ?? 0} Ayat
                </div>
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  {todayRecord.quran?.pages ?? 0} Pages
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reading</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>
                  {formatDuration(todayRecord.readingMinutes)}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Day Experience</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>{moodInfo?.emoji}</span>
                  <span style={{ fontSize: '0.9rem' }}>{moodInfo?.label}</span>
                </div>
              </div>
            </div>

            {todayRecord.dailyReflection && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
                <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Reflection: </span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                  "{todayRecord.dailyReflection}"
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="today-status-empty-box">
            <div className="today-status-indicator-row">
              <CircleDot size={16} className="status-indicator-icon" />
              <span className="status-indicator-title">No entry for today</span>
            </div>
            <p className="today-status-desc">
              No daily performance has been submitted for today yet. Take a moment to log your study hours, recitation, and reading!
            </p>
          </div>
        )}
      </div>

      {/* ── Weekly Consistency & Progress Section ─────────────────────────── */}
      <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
        <div className="weekly-section-header">
          <div className="eyebrow" style={{ marginBottom: 2 }}>Overview</div>
          <h3 className="weekly-section-title">Weekly Progress</h3>
          <p className="weekly-section-subtitle">Your activity and consistency this week</p>
        </div>

        <div className="metric-grid">
          {/* Card 1: Study Time */}
          <div className="metric-card">
            <div className="metric-card-top">
              <div className="metric-card-label">
                <Clock size={14} className="metric-icon" />
                <span>Study Time</span>
              </div>
            </div>
            <div className="metric-card-value">
              {weeklySummary?.totalStudyHoursFormatted ?? '0h 0m'}
            </div>
            <div className="metric-card-footer">
              <span className="metric-card-desc">
                {(weeklySummary?.totalStudyHours ?? 0) > 0 ? 'This past week' : 'No study time logged yet'}
              </span>
            </div>
          </div>

          {/* Card 2: Quran Recitation */}
          <div className="metric-card">
            <div className="metric-card-top">
              <div className="metric-card-label">
                <BookOpen size={14} className="metric-icon" />
                <span>Quran Recitation</span>
              </div>
            </div>
            <div className="metric-card-value">
              {weeklySummary?.quran?.ruku ?? 0} Ruku • {weeklySummary?.quran?.pages ?? 0} pgs
            </div>
            <div className="metric-card-footer">
              <span className="metric-card-desc">
                {(weeklySummary?.quran?.ruku ?? 0) > 0 || (weeklySummary?.quran?.pages ?? 0) > 0 || (weeklySummary?.quran?.ayat ?? 0) > 0
                  ? `${weeklySummary?.quran?.ayat ?? 0} Ayat completed`
                  : 'No recitation logged yet'}
              </span>
            </div>
          </div>

          {/* Card 3: Reading Time */}
          <div className="metric-card">
            <div className="metric-card-top">
              <div className="metric-card-label">
                <BookMarked size={14} className="metric-icon" />
                <span>Reading Time</span>
              </div>
            </div>
            <div className="metric-card-value">
              {formatDuration(weeklySummary?.totalReadingMinutes ?? 0)}
            </div>
            <div className="metric-card-footer">
              <span className="metric-card-desc">
                {(weeklySummary?.totalReadingMinutes ?? 0) > 0 ? 'General reading' : 'No reading time logged yet'}
              </span>
            </div>
          </div>

          {/* Card 4: Consistency / Days Submitted */}
          <div className="metric-card">
            <div className="metric-card-top">
              <div className="metric-card-label">
                <Star size={14} className="metric-icon" />
                <span>Consistency</span>
              </div>
            </div>
            <div className="metric-card-value" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              {weeklySummary?.daysSubmitted ?? 0} <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>/ 7 days</span>
            </div>
            <div className="metric-card-footer">
              <span className="metric-card-desc">
                {weeklySummary?.daysSubmitted ? `${weeklySummary.daysSubmitted} of 7 days submitted` : '0 of 7 days submitted'}
              </span>
              <div className="day-dots-indicator" aria-label={`${weeklySummary?.daysSubmitted ?? 0} of 7 days submitted`} title={`${weeklySummary?.daysSubmitted ?? 0} of 7 days submitted`}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    className={`day-dot ${i < (weeklySummary?.daysSubmitted ?? 0) ? 'active' : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Encouragement & Quick Navigation Card ─────────────────────────── */}
      <div
        className="summary-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              background: 'rgba(46, 125, 50, 0.1)',
              display: 'grid',
              placeItems: 'center',
              color: '#2e7d32',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              Consistent Effort Over Time
            </div>
            <div className="muted" style={{ fontSize: '0.88rem', marginTop: 2 }}>
              Your recorded progress helps your mentor understand your routine and support your goals.
            </div>
          </div>
        </div>

        <button
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}
          onClick={() => navigate('/mentee/history')}
        >
          <History size={16} /> View Performance History <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
