import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Sparkles, CheckCircle2, Edit3, ArrowRight, History } from 'lucide-react';
import { getTodayPerformance, getWeeklyPerformance } from '../lib/api';

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

  useEffect(() => {
    Promise.all([
      getTodayPerformance().catch(() => ({ record: null })),
      getWeeklyPerformance().catch(() => ({ summary: null })),
    ]).then(([todayRes, weeklyRes]) => {
      setTodayRecord(todayRes.record ?? null);
      setWeeklySummary(weeklyRes.summary ?? null);
    });
  }, []);

  const moodInfo = todayRecord ? (MOOD_MAP[todayRecord.dayRating] ?? { emoji: '🙂', label: 'Good' }) : null;

  return (
    <div className="mentee-dashboard" style={{ display: 'grid', gap: 24, paddingBottom: 60 }}>
      {/* ── Today's Progress Hero Card (Requirement 8) ────────────────────── */}
      <div
        className="summary-card"
        style={{
          background: 'linear-gradient(135deg, rgba(143, 63, 102, 0.08) 0%, rgba(143, 63, 102, 0.02) 100%)',
          borderColor: 'var(--border)',
          padding: '28px 24px',
          borderRadius: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarCheck size={16} /> Daily Performance
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '4px 0 0', color: 'var(--text-primary)' }}>
              Today's Progress
            </h2>
          </div>

          {todayRecord ? (
            <button
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.92rem' }}
              onClick={() => navigate('/mentee/daily')}
            >
              <Edit3 size={16} /> Edit Today's Entry
            </button>
          ) : (
            <button
              className="btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1rem', padding: '12px 24px' }}
              onClick={() => navigate('/mentee/daily')}
            >
              + Record Today's Progress
            </button>
          )}
        </div>

        {/* Info Grid */}
        {todayRecord ? (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 14,
                background: '#fff',
                padding: '20px 16px',
                borderRadius: 18,
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Study</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
                  {formatDuration(todayRecord.studyMinutes)}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Quran</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
                  {todayRecord.quran?.ruku ?? 0} Ruku • {todayRecord.quran?.ayat ?? 0} Ayat
                </div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  {todayRecord.quran?.pages ?? 0} Pages
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Reading</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                  {formatDuration(todayRecord.readingMinutes)}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Day Experience</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span>{moodInfo?.emoji}</span>
                  <span style={{ fontSize: '0.95rem' }}>{moodInfo?.label}</span>
                </div>
              </div>
            </div>

            {todayRecord.dailyReflection && (
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Reflection: </span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                  "{todayRecord.dailyReflection}"
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#fff', padding: '24px 20px', borderRadius: 18, border: '1px solid var(--border)', textAlign: 'center' }}>
            <Sparkles size={32} color="var(--primary)" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>You haven't recorded your progress today</div>
            <p className="muted" style={{ fontSize: '0.9rem', maxWidth: 460, margin: '6px auto 16px' }}>
              Take a moment to record your study hours, Quran recitation, and general reading. It takes less than 2 minutes!
            </p>
            <button className="btn-primary" onClick={() => navigate('/mentee/daily')}>
              + Record Today's Progress
            </button>
          </div>
        )}
      </div>

      {/* ── Weekly Consistency & Progress Section ─────────────────────────── */}
      <div className="card-grid">
        <div className="dashboard-card">
          <div className="label">Days Submitted</div>
          <div className="value" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            {weeklySummary?.daysSubmitted ?? 0} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ 7 days</span>
          </div>
          <div className="change">This past week</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Weekly Study Time</div>
          <div className="value">{weeklySummary?.totalStudyHoursFormatted ?? '0h 0m'}</div>
          <div className="change">Total focused learning</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Weekly Quran Recitation</div>
          <div className="value" style={{ fontSize: '1.3rem' }}>
            {weeklySummary?.quran?.ruku ?? 0} Ruku • {weeklySummary?.quran?.pages ?? 0} pgs
          </div>
          <div className="change">{weeklySummary?.quran?.ayat ?? 0} Ayat completed</div>
        </div>

        <div className="dashboard-card">
          <div className="label">General Reading</div>
          <div className="value">{formatDuration(weeklySummary?.totalReadingMinutes ?? 0)}</div>
          <div className="change">Personal knowledge building</div>
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
