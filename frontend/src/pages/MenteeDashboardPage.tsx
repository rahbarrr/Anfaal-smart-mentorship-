import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck,
  CheckCircle2,
  Edit3,
  Clock,
  Flame,
  Zap,
  Trophy,
  Target,
  Users,
  Award,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Compass,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { getMenteeGrowthSummary, type MenteeGrowthSummary } from '../lib/api';
import { formatSubmissionTimestamps } from '../lib/dateTime';
import './MenteeDashboardPage.css';

const MOOD_MAP: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😞', label: 'Very difficult' },
  2: { emoji: '😕', label: 'Difficult' },
  3: { emoji: '😐', label: 'Okay' },
  4: { emoji: '🙂', label: 'Good' },
  5: { emoji: '😊', label: 'Very good' },
};

function formatDuration(min: number): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function MenteeDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MenteeGrowthSummary | null>(null);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchGrowthData = useCallback(async (offset: number) => {
    try {
      setLoadError(null);
      const res = await getMenteeGrowthSummary({ weekOffset: offset });
      setData(res);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Unable to load your mentorship growth dashboard.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGrowthData(weekOffset);
  }, [weekOffset, fetchGrowthData]);

  if (isLoading && !data) {
    return (
      <div className="mentee-growth-dashboard" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div className="anfaal-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(143,63,102,0.2)', borderTopColor: '#8f3f66' }} />
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Loading your growth journey...
          </span>
        </div>
      </div>
    );
  }

  const mentee = data?.mentee;
  const todayStatus = data?.todayStatus;
  const todayRecord = todayStatus?.record;
  const streak = data?.streak;
  const xp = data?.xp;
  const weeklyCalendar = data?.weeklyCalendar;
  const badges = data?.badges || [];
  const weeklyChallenges = data?.weeklyChallenges || [];
  const goals = data?.goals;
  const leaderboard = data?.cohortLeaderboard;
  const recentActivities = data?.recentActivities || [];

  const moodInfo = todayRecord ? MOOD_MAP[todayRecord.dayRating] || { emoji: '🙂', label: 'Good' } : null;

  return (
    <div className="mentee-growth-dashboard">
      {loadError && (
        <div className="alert alert-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} />
          <span>{loadError}</span>
        </div>
      )}

      {/* ── 1. Personalized Welcome & Growth Status Header ───────────────────── */}
      <section className="growth-welcome-card" aria-label="Welcome and current level">
        <div className="growth-welcome-glow" aria-hidden="true" />
        <div className="growth-welcome-content">
          <div className="growth-welcome-eyebrow">
            <Sparkles size={14} />
            <span>Student Growth Journey</span>
            {mentee?.makid && <span>• MAKID: {mentee.makid}</span>}
          </div>
          <h1 className="growth-welcome-title">
            Welcome back, {mentee?.name || 'Scholar'}!
          </h1>
          <p className="growth-welcome-msg">
            {streak?.motivationalMessage || 'Every daily effort compounds into extraordinary growth.'}
          </p>
        </div>

        {/* Level and Points Pill */}
        {xp && (
          <div className="growth-level-badge-box">
            <div className="growth-level-top">
              <span className="growth-level-name">Level {xp.level} · {xp.levelName}</span>
              <span className="growth-level-xp">
                <Zap size={15} fill="#facc15" color="#facc15" />
                {xp.totalXp} XP
              </span>
            </div>
            <div className="growth-level-progress-bg" title={`${xp.progressPercent}% to next level`}>
              <div
                className="growth-level-progress-fill"
                style={{ width: `${xp.progressPercent}%` }}
              />
            </div>
            <div className="growth-level-sub">
              <span>{xp.currentLevelFloor} XP</span>
              <span>Next: {xp.nextLevelThreshold} XP</span>
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Primary Action Hero: Today's Daily Performance Check-In ────────── */}
      <section
        className={`primary-checkin-hero ${todayStatus?.submitted ? 'submitted' : 'pending'}`}
        aria-label="Today's Check-in Status"
      >
        <div className="checkin-header-row">
          <div className="checkin-header-left">
            <div className={`checkin-status-icon-wrap ${todayStatus?.submitted ? 'submitted' : 'pending'}`}>
              {todayStatus?.submitted ? <CheckCircle2 size={26} /> : <CalendarCheck size={26} />}
            </div>
            <div className="checkin-title-text">
              <h3>
                {todayStatus?.submitted ? "Today's Check-in Complete!" : "Today's Daily Performance Check-in"}
              </h3>
              <p>
                {todayStatus?.submitted ? (
                  <span>
                    ✓ Submitted {formatSubmissionTimestamps(todayRecord?.submittedAt, todayRecord?.updatedAt).submittedFormatted}
                    {formatSubmissionTimestamps(todayRecord?.submittedAt, todayRecord?.updatedAt).isEdited && ' (Edited)'}
                  </span>
                ) : (
                  <span>Earn +10 XP and keep your consistency streak alive.</span>
                )}
              </p>
            </div>
          </div>

          <div>
            {todayStatus?.submitted ? (
              <button
                className="checkin-action-btn-secondary"
                onClick={() => navigate('/mentee/daily')}
              >
                <Edit3 size={15} /> Edit Today's Entry
              </button>
            ) : (
              <button
                className="checkin-action-btn-primary"
                onClick={() => navigate('/mentee/daily')}
              >
                + Complete Daily Check-in
              </button>
            )}
          </div>
        </div>

        {/* If submitted, show preview of logged accomplishments */}
        {todayStatus?.submitted && todayRecord && (
          <div>
            <div className="today-preview-metrics">
              <div className="today-metric-tile">
                <div className="today-metric-tile-lbl">Study Time</div>
                <div className="today-metric-tile-val">{formatDuration(todayRecord.studyMinutes)}</div>
                <div className="today-metric-tile-sub">Focused learning</div>
              </div>

              <div className="today-metric-tile">
                <div className="today-metric-tile-lbl">Quran Recitation</div>
                <div className="today-metric-tile-val" style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {todayRecord.quran?.ruku ?? 0} Ruku • {todayRecord.quran?.ayat ?? 0} Ayat
                </div>
                <div className="today-metric-tile-sub">{todayRecord.quran?.pages ?? 0} Pages read</div>
              </div>

              <div className="today-metric-tile">
                <div className="today-metric-tile-lbl">General Reading</div>
                <div className="today-metric-tile-val">{formatDuration(todayRecord.readingMinutes)}</div>
                <div className="today-metric-tile-sub">Books & literature</div>
              </div>

              <div className="today-metric-tile">
                <div className="today-metric-tile-lbl">Day Experience</div>
                <div className="today-metric-tile-val" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '1.05rem' }}>
                  <span>{moodInfo?.emoji}</span>
                  <span style={{ fontSize: '0.88rem' }}>{moodInfo?.label}</span>
                </div>
                <div className="today-metric-tile-sub">Overall daily rating</div>
              </div>
            </div>

            {todayRecord.dailyReflection && (
              <div className="today-reflection-pill">
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Today's Reflection: </span>
                <span style={{ fontStyle: 'italic' }}>"{todayRecord.dailyReflection}"</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 3. Gamified Metric Cards Strip ───────────────────────────────────── */}
      <section className="growth-metrics-strip" aria-label="Growth Metrics">
        {/* Streak */}
        <div className="growth-stat-card">
          <div className="growth-stat-header">
            <span className="growth-stat-title">Daily Streak</span>
            <div className="growth-stat-icon-wrap amber">
              <Flame size={20} fill="#d97706" color="#d97706" />
            </div>
          </div>
          <div className="growth-stat-val" style={{ color: '#b45309' }}>
            {streak?.currentStreak ?? 0} Days
          </div>
          <div className="growth-stat-sub">
            <span>⭐ Best: {streak?.bestStreak ?? 0} days</span>
          </div>
        </div>

        {/* Weekly Consistency */}
        <div className="growth-stat-card">
          <div className="growth-stat-header">
            <span className="growth-stat-title">Weekly Consistency</span>
            <div className="growth-stat-icon-wrap green">
              <CalendarCheck size={20} />
            </div>
          </div>
          <div className="growth-stat-val" style={{ color: '#15803d' }}>
            {streak?.daysSubmittedThisWeek ?? 0} / 7
          </div>
          <div className="growth-stat-sub">
            <div className="consistency-dots-row">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className={`consistency-dot ${i < (streak?.daysSubmittedThisWeek ?? 0) ? 'filled' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Total Earned XP */}
        <div className="growth-stat-card">
          <div className="growth-stat-header">
            <span className="growth-stat-title">Earned Points</span>
            <div className="growth-stat-icon-wrap gold">
              <Zap size={20} fill="#ca8a04" color="#ca8a04" />
            </div>
          </div>
          <div className="growth-stat-val" style={{ color: '#854d0e' }}>
            {xp?.totalXp ?? 0} XP
          </div>
          <div className="growth-stat-sub">
            <span>Level {xp?.level ?? 1} · +10 per check-in</span>
          </div>
        </div>

        {/* Growth Level */}
        <div className="growth-stat-card">
          <div className="growth-stat-header">
            <span className="growth-stat-title">Growth Tier</span>
            <div className="growth-stat-icon-wrap plum">
              <Trophy size={20} />
            </div>
          </div>
          <div className="growth-stat-val" style={{ fontSize: '1.25rem', color: '#8f3f66' }}>
            {xp?.levelName ?? 'Scholar'}
          </div>
          <div className="growth-stat-sub">
            <span>{badges.filter((b) => b.unlocked).length} badges unlocked</span>
          </div>
        </div>
      </section>

      {/* ── 4. Weekly Activity Calendar ──────────────────────────────────────── */}
      {weeklyCalendar && (
        <section className="weekly-calendar-card" aria-label="Weekly Activity Calendar">
          <div className="calendar-header-row">
            <div className="calendar-title-box">
              <h3>Weekly Activity Calendar</h3>
              <p>{weeklyCalendar.weekLabel} · {weeklyCalendar.completedCount} of 7 days completed</p>
            </div>
            <div className="calendar-nav-controls">
              <button
                className="calendar-nav-btn"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                aria-label="Previous week"
              >
                <ChevronLeft size={16} /> Prev Week
              </button>
              {weekOffset !== 0 && (
                <button
                  className="calendar-nav-btn active-current"
                  onClick={() => setWeekOffset(0)}
                >
                  Current Week
                </button>
              )}
              <button
                className="calendar-nav-btn"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                disabled={weekOffset >= 0}
                style={{ opacity: weekOffset >= 0 ? 0.5 : 1, cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer' }}
                aria-label="Next week"
              >
                Next Week <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="calendar-days-grid">
            {weeklyCalendar.days.map((day) => (
              <div
                key={day.date}
                className={`calendar-day-cell ${day.isToday ? 'is-today' : ''} ${day.submitted ? 'submitted' : ''}`}
              >
                <span className="calendar-day-name">{day.dayName}</span>
                <span className="calendar-day-num">{day.dayNumber}</span>
                <div
                  className={`calendar-day-status ${
                    day.submitted
                      ? 'completed'
                      : day.isToday
                        ? 'pending-today'
                        : day.isPast
                          ? 'missed'
                          : 'future'
                  }`}
                >
                  {day.submitted ? '✓' : day.isToday ? '●' : day.isPast ? '—' : '○'}
                </div>
                {day.submitted && day.studyMinutes > 0 ? (
                  <span className="calendar-day-minutes">{formatDuration(day.studyMinutes)}</span>
                ) : (
                  <span style={{ fontSize: '0.68rem', color: '#a0989d' }}>
                    {day.isToday ? 'Today' : day.isFuture ? 'Upcoming' : 'Rest'}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="calendar-legend-row">
            <div className="legend-item">
              <span style={{ color: '#22c55e', fontWeight: 800 }}>✓</span>
              <span>Submitted</span>
            </div>
            <div className="legend-item">
              <span style={{ color: '#b45309', fontWeight: 800 }}>●</span>
              <span>Today Due</span>
            </div>
            <div className="legend-item">
              <span style={{ color: '#b91c1c', opacity: 0.7 }}>—</span>
              <span>Missed Day</span>
            </div>
            <div className="legend-item">
              <span style={{ color: '#c7bebf' }}>○</span>
              <span>Future Day</span>
            </div>
          </div>
        </section>
      )}

      {/* ── 5. Main 2-Column Dashboard Grid ─────────────────────────────────── */}
      <div className="growth-dashboard-grid">
        {/* Left Column: Goals & Challenges */}
        <div className="growth-column">
          {/* Goals & Academic Progress */}
          <section className="growth-card" aria-label="Personal Goals">
            <div className="growth-card-header">
              <div className="growth-card-title-wrap">
                <div className="growth-card-icon">
                  <Compass size={18} />
                </div>
                <h3 className="growth-card-title">Personal Goals & Vision</h3>
              </div>
            </div>

            <div className="goals-display-list">
              {goals?.careerGoal ? (
                <div className="goal-item-box">
                  <div className="goal-item-header">
                    <span className="goal-type-tag">Primary Career Vision</span>
                  </div>
                  <h4 className="goal-item-title">{goals.careerGoal}</h4>
                  <p style={{ fontSize: '0.8rem', color: '#70676d', margin: 0 }}>
                    Aligned with your mentor to guide focus, subjects, and skill development.
                  </p>
                </div>
              ) : (
                <div className="goal-item-box" style={{ background: '#faf8f9', textAlign: 'center', padding: '16px' }}>
                  <p style={{ fontSize: '0.86rem', color: '#70676d', margin: '0 0 10px 0' }}>
                    No long-term career goal set yet. Discuss your passions with your mentor during your next call!
                  </p>
                </div>
              )}

              {goals?.semesterGoal && (
                <div className="goal-item-box">
                  <div className="goal-item-header">
                    <span className="goal-type-tag" style={{ background: 'rgba(217, 119, 6, 0.1)', color: '#b45309' }}>
                      Current Semester Goal
                    </span>
                  </div>
                  <h4 className="goal-item-title">{goals.semesterGoal}</h4>
                </div>
              )}

              {goals?.shortTermGoals && goals.shortTermGoals.length > 0 && (
                <div>
                  <h5 style={{ fontSize: '0.82rem', textTransform: 'uppercase', color: '#70676d', margin: '10px 0 8px 0', letterSpacing: '0.04em' }}>
                    Action Milestones
                  </h5>
                  {goals.shortTermGoals.slice(0, 3).map((g: any, i: number) => (
                    <div key={g.id || i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 600 }}>
                        <span>{g.title}</span>
                        <span>{g.progress || 0}%</span>
                      </div>
                      <div className="goal-progress-bar-wrap">
                        <div className="goal-progress-track">
                          <div className="goal-progress-fill" style={{ width: `${g.progress || 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Weekly Challenges */}
          <section className="growth-card" aria-label="Weekly Challenges">
            <div className="growth-card-header">
              <div className="growth-card-title-wrap">
                <div className="growth-card-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                  <Target size={18} />
                </div>
                <h3 className="growth-card-title">Weekly Growth Challenges</h3>
              </div>
            </div>

            <div>
              {weeklyChallenges.map((ch) => (
                <div key={ch.id} className="challenge-item-card">
                  <div className="challenge-top-row">
                    <h4 className="challenge-title">{ch.title}</h4>
                    <span className={`challenge-reward-badge ${ch.completed ? 'completed' : ''}`}>
                      {ch.completed ? '✓ Completed' : `+${ch.xpReward} XP`}
                    </span>
                  </div>
                  <p className="challenge-desc">{ch.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <div className="goal-progress-track" style={{ flex: 1 }}>
                      <div
                        className="goal-progress-fill"
                        style={{
                          width: `${Math.min(100, Math.round((ch.current / ch.target) * 100))}%`,
                          background: ch.completed ? '#16a34a' : '#d97706',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#70676d' }}>
                      {ch.current} / {ch.target} {ch.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Cohort Leaderboard & Achievements */}
        <div className="growth-column">
          {/* Cohort Leaderboard */}
          <section className="growth-card" aria-label="Cohort Leaderboard">
            <div className="growth-card-header">
              <div className="growth-card-title-wrap">
                <div className="growth-card-icon" style={{ background: '#fef9c3', color: '#a16207' }}>
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="growth-card-title">Cohort Leaderboard</h3>
                  <div style={{ fontSize: '0.74rem', color: '#70676d' }}>
                    {leaderboard?.mentorName ? `${leaderboard.mentorName}'s Mentorship Group` : 'Mentorship Cohort'}
                  </div>
                </div>
              </div>
            </div>

            {leaderboard?.entries && leaderboard.entries.length > 0 ? (
              <div className="leaderboard-entries-list">
                {leaderboard.entries.slice(0, 6).map((entry) => (
                  <div
                    key={entry.menteeId}
                    className={`leaderboard-row ${entry.isMe ? 'is-current-user' : ''}`}
                  >
                    <div className="leaderboard-left">
                      <div
                        className={`leaderboard-rank-badge ${
                          entry.rank === 1 ? 'top-1' : entry.rank === 2 ? 'top-2' : entry.rank === 3 ? 'top-3' : ''
                        }`}
                      >
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                      </div>
                      <div className="leaderboard-name-box">
                        <span className="leaderboard-name">{entry.name}</span>
                        {entry.isMe && <span className="leaderboard-you-tag">You</span>}
                      </div>
                    </div>

                    <div className="leaderboard-right">
                      {entry.currentStreak > 0 && (
                        <span className="leaderboard-streak" title="Active check-in streak">
                          🔥 {entry.currentStreak}d
                        </span>
                      )}
                      <span className="leaderboard-xp">{entry.totalXp} XP</span>
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: '0.72rem', color: '#8a8086', margin: '8px 0 0 0', textAlign: 'center' }}>
                  💡 Ranks celebrate consistent daily habits & active participation.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px', color: '#70676d', fontSize: '0.86rem' }}>
                Cohort ranking will populate as fellow mentees record their progress.
              </div>
            )}
          </section>

          {/* Achievement Badges Showcase */}
          <section className="growth-card" aria-label="Achievement Badges">
            <div className="growth-card-header">
              <div className="growth-card-title-wrap">
                <div className="growth-card-icon" style={{ background: '#fdf2f7', color: '#8f3f66' }}>
                  <Award size={18} />
                </div>
                <h3 className="growth-card-title">Achievements & Badges</h3>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)' }}>
                {badges.filter((b) => b.unlocked).length} / {badges.length}
              </span>
            </div>

            <div className="badges-showcase-grid">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className={`badge-item-card ${b.unlocked ? 'unlocked' : 'locked'}`}
                  title={`${b.name}: ${b.description}`}
                >
                  <div className="badge-emoji">{b.icon}</div>
                  <div className="badge-name">{b.name}</div>
                  <div className="badge-desc">{b.unlocked ? 'Unlocked ✓' : b.description}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Activity Timeline */}
          {recentActivities.length > 0 && (
            <section className="growth-card" aria-label="Recent Activity">
              <div className="growth-card-header">
                <div className="growth-card-title-wrap">
                  <div className="growth-card-icon">
                    <Activity size={18} />
                  </div>
                  <h3 className="growth-card-title">Recent Activity</h3>
                </div>
              </div>

              <div className="recent-activity-list">
                {recentActivities.map((act) => (
                  <div key={act.id} className="activity-timeline-row">
                    <div className="activity-icon-bullet">
                      {act.type === 'checkin' ? '📝' : act.type === 'call' ? '📞' : '⭐'}
                    </div>
                    <div className="activity-info-box">
                      <h5 className="activity-info-title">{act.title}</h5>
                      <p className="activity-info-sub">{act.description}</p>
                    </div>
                    <span className="activity-time">
                      {new Date(act.timestamp).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Navigation to Full Performance History */}
          <div style={{ textAlign: 'center' }}>
            <button
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', width: '100%', justifyContent: 'center' }}
              onClick={() => navigate('/mentee/history')}
            >
              <Clock size={16} /> View Full Historical Analytics <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
