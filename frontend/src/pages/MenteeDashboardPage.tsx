import { useState, useEffect, useMemo } from 'react';
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
  Award,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Compass,
  AlertCircle,
  Activity,
  HelpCircle,
  X,
  Search,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import {
  getMenteeGrowthSummary,
  getLeaderboard,
  updateLeaderboardPrivacy,
  type MenteeGrowthSummary,
  type LeaderboardData,
} from '../lib/api';
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

  // Leaderboard interactive state
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'weekly' | 'alltime'>('weekly');
  const [customLeaderboardData, setCustomLeaderboardData] = useState<LeaderboardData | null>(null);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(false);
  const [fullLeaderboardOpen, setFullLeaderboardOpen] = useState<boolean>(false);
  const [scoringInfoOpen, setScoringInfoOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState<boolean>(false);
  const [privacyToast, setPrivacyToast] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const res = await getMenteeGrowthSummary({ weekOffset });
        if (!isMounted) return;
        setData(res);
        setLoadError(null);
        if (res.leaderboard) {
          setCustomLeaderboardData(res.leaderboard);
        }
      } catch (error) {
        if (!isMounted) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to load your mentorship growth dashboard.',
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [weekOffset]);

  const handlePeriodChange = async (period: 'weekly' | 'alltime') => {
    setLeaderboardPeriod(period);
    setIsLoadingLeaderboard(true);
    try {
      const res = await getLeaderboard({ period, weekOffset });
      setCustomLeaderboardData(res);
    } catch (err) {
      console.error('Failed to change leaderboard period', err);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handleTogglePrivacy = async () => {
    const currentBoard = customLeaderboardData || data?.leaderboard;
    if (!currentBoard) return;
    setIsUpdatingPrivacy(true);
    setPrivacyToast(null);
    try {
      const nextOptOut = !currentBoard.optedOut;
      await updateLeaderboardPrivacy(nextOptOut);
      const updated = await getLeaderboard({ period: leaderboardPeriod, weekOffset });
      setCustomLeaderboardData(updated);
      setPrivacyToast(
        nextOptOut
          ? 'Your name is now masked as "Anonymous Learner" on the public leaderboard.'
          : 'Your profile name is now visible to peers on the leaderboard.',
      );
      setTimeout(() => setPrivacyToast(null), 4000);
    } catch (err) {
      console.error('Failed to update privacy preference', err);
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const activeLeaderboard: LeaderboardData | undefined =
    customLeaderboardData || data?.leaderboard;

  const filteredEntries = useMemo(() => {
    if (!activeLeaderboard?.entries) return [];
    if (!searchQuery.trim()) return activeLeaderboard.entries;
    const q = searchQuery.toLowerCase().trim();
    return activeLeaderboard.entries.filter((e) =>
      e.name.toLowerCase().includes(q),
    );
  }, [activeLeaderboard, searchQuery]);

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
                  {goals.shortTermGoals.slice(0, 3).map((g, i: number) => (
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

        {/* Right Column: Leaderboard & Achievements */}
        <div className="growth-column">
          {/* Leaderboard Card */}
          <section className="growth-card leaderboard-main-card" aria-label="Mentee Leaderboard">
            <div className="growth-card-header leaderboard-card-header">
              <div className="growth-card-title-wrap">
                <div className="growth-card-icon" style={{ background: '#fef9c3', color: '#a16207' }}>
                  <Trophy size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 className="growth-card-title">Leaderboard</h3>
                    <span className="leaderboard-period-badge">
                      {leaderboardPeriod === 'weekly'
                        ? activeLeaderboard?.period?.label || 'This Week'
                        : 'All-Time'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#70676d', marginTop: 2 }}>
                    Eligible active mentees in the Anfaal mentorship network
                  </div>
                </div>
              </div>

              <div className="leaderboard-header-actions">
                <button
                  type="button"
                  className="leaderboard-info-trigger-btn"
                  onClick={() => setScoringInfoOpen(true)}
                  title="How leaderboard scoring works"
                  aria-label="How leaderboard scoring works"
                >
                  <HelpCircle size={15} />
                  <span>Rules</span>
                </button>
              </div>
            </div>

            {/* Period Switcher Tabs */}
            <div className="leaderboard-period-tabs" role="tablist" aria-label="Ranking period selection">
              <button
                type="button"
                role="tab"
                aria-selected={leaderboardPeriod === 'weekly'}
                className={`period-tab-btn ${leaderboardPeriod === 'weekly' ? 'active' : ''}`}
                onClick={() => void handlePeriodChange('weekly')}
              >
                This Week
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={leaderboardPeriod === 'alltime'}
                className={`period-tab-btn ${leaderboardPeriod === 'alltime' ? 'active' : ''}`}
                onClick={() => void handlePeriodChange('alltime')}
              >
                All-Time XP
              </button>
            </div>

            {isLoadingLeaderboard ? (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <div className="anfaal-spinner" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
                <span style={{ fontSize: '0.82rem', color: '#70676d' }}>Updating standings...</span>
              </div>
            ) : activeLeaderboard?.entries && activeLeaderboard.entries.length > 0 ? (
              <div>
                {/* 1. Top 3 Podium Showcase */}
                {activeLeaderboard.topThree && activeLeaderboard.topThree.length > 0 && (
                  <div className="leaderboard-podium-showcase" aria-label="Top 3 Mentees">
                    {activeLeaderboard.topThree.map((topEntry) => (
                      <div
                        key={topEntry.menteeId}
                        className={`podium-card rank-${topEntry.rank} ${topEntry.isMe ? 'is-me' : ''}`}
                      >
                        <div className="podium-medal-badge">
                          {topEntry.rank === 1 ? '🥇' : topEntry.rank === 2 ? '🥈' : '🥉'}
                        </div>
                        <div className="podium-rank-label">Rank #{topEntry.rank}</div>
                        <div className="podium-name" title={topEntry.name}>
                          {topEntry.name}
                        </div>
                        {topEntry.isMe && <span className="leaderboard-you-tag">You</span>}
                        <div className="podium-points">
                          {leaderboardPeriod === 'weekly'
                            ? `${topEntry.weeklyPoints} pts`
                            : `${topEntry.totalXp} XP`}
                        </div>
                        {topEntry.currentStreak > 0 && (
                          <div className="podium-streak" title={`${topEntry.currentStreak}-day active streak`}>
                            🔥 {topEntry.currentStreak}d
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Compact Ranked List (Next positions: Ranks 4 to 6) */}
                {activeLeaderboard.entries.filter((e) => e.rank > 3).slice(0, 4).length > 0 && (
                  <div className="leaderboard-entries-list">
                    {activeLeaderboard.entries
                      .filter((e) => e.rank > 3)
                      .slice(0, 4)
                      .map((entry) => (
                        <div
                          key={entry.menteeId}
                          className={`leaderboard-row ${entry.isMe ? 'is-current-user' : ''}`}
                        >
                          <div className="leaderboard-left">
                            <div className="leaderboard-rank-badge">
                              {entry.rank}
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
                            <span className="leaderboard-xp">
                              {leaderboardPeriod === 'weekly'
                                ? `${entry.weeklyPoints} pts`
                                : `${entry.totalXp} XP`}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* 3. Signed-In Mentee Outside Visible List Standing Banner */}
                {activeLeaderboard.myEntry && activeLeaderboard.myRank > 7 && (
                  <div className="leaderboard-my-standing-banner">
                    <div className="my-standing-left">
                      <div className="my-standing-badge">#{activeLeaderboard.myRank}</div>
                      <div>
                        <div className="my-standing-title">Your Current Standing</div>
                        <div className="my-standing-sub">
                          {leaderboardPeriod === 'weekly'
                            ? `${activeLeaderboard.myWeeklyPoints} pts this week`
                            : `${activeLeaderboard.myLifetimeXp} Lifetime XP`}
                          {activeLeaderboard.myEntry.currentStreak > 0 &&
                            ` • 🔥 ${activeLeaderboard.myEntry.currentStreak}d streak`}
                        </div>
                      </div>
                    </div>
                    <button
                      className="my-standing-action-btn"
                      onClick={() => navigate('/mentee/daily')}
                    >
                      + Log Check-in
                    </button>
                  </div>
                )}

                {/* 4. Action bar with View Full Standings */}
                <div className="leaderboard-card-footer">
                  <button
                    type="button"
                    className="view-full-leaderboard-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setFullLeaderboardOpen(true);
                    }}
                  >
                    <span>View Full Standings ({activeLeaderboard.totalEligibleMentees} Mentees)</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="leaderboard-empty-state">
                <Trophy size={32} color="#ca8a04" style={{ margin: '0 auto 10px', opacity: 0.8 }} />
                <h4>No submissions recorded yet for this week</h4>
                <p>Be the first mentee to complete today's daily check-in and take the lead!</p>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 12, padding: '8px 16px', fontSize: '0.85rem' }}
                  onClick={() => navigate('/mentee/daily')}
                >
                  + Complete Today's Check-in
                </button>
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

      {/* ── Full Leaderboard Modal Dialog ───────────────────────────────────── */}
      {fullLeaderboardOpen && activeLeaderboard && (
        <div
          className="leaderboard-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="full-leaderboard-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFullLeaderboardOpen(false);
          }}
        >
          <div className="leaderboard-modal-card">
            <div className="leaderboard-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="growth-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <Trophy size={20} />
                </div>
                <div>
                  <h3 id="full-leaderboard-title" style={{ margin: 0, fontSize: '1.15rem', color: '#231e21' }}>
                    Anfaal Mentee Leaderboard
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#70676d' }}>
                    {activeLeaderboard.period?.label} · Verified Participation Rankings
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="leaderboard-modal-close-btn"
                onClick={() => setFullLeaderboardOpen(false)}
                aria-label="Close leaderboard modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick summary strip */}
            <div className="modal-summary-strip">
              <div className="modal-summary-pill">
                <span className="lbl">Active Mentees</span>
                <span className="val">{activeLeaderboard.totalEligibleMentees}</span>
              </div>
              <div className="modal-summary-pill">
                <span className="lbl">Your Rank</span>
                <span className="val highlight">#{activeLeaderboard.myRank || '—'}</span>
              </div>
              <div className="modal-summary-pill">
                <span className="lbl">Your Score</span>
                <span className="val">
                  {leaderboardPeriod === 'weekly'
                    ? `${activeLeaderboard.myWeeklyPoints} pts`
                    : `${activeLeaderboard.myLifetimeXp} XP`}
                </span>
              </div>
            </div>

            {/* Modal Controls: Period Switch & Search */}
            <div className="modal-controls-row">
              <div className="leaderboard-period-tabs" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`period-tab-btn ${leaderboardPeriod === 'weekly' ? 'active' : ''}`}
                  onClick={() => void handlePeriodChange('weekly')}
                >
                  This Week
                </button>
                <button
                  type="button"
                  className={`period-tab-btn ${leaderboardPeriod === 'alltime' ? 'active' : ''}`}
                  onClick={() => void handlePeriodChange('alltime')}
                >
                  All-Time
                </button>
              </div>

              <div className="modal-search-box">
                <Search size={15} color="#8a8086" />
                <input
                  type="text"
                  placeholder="Search mentee name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="modal-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#8a8086' }}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Full Ranked Table / List */}
            <div className="modal-leaderboard-list">
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => (
                  <div
                    key={entry.menteeId}
                    className={`modal-leaderboard-row ${entry.isMe ? 'is-me' : ''}`}
                  >
                    <div className="modal-rank-col">
                      <span
                        className={`modal-rank-badge ${
                          entry.rank === 1 ? 'gold' : entry.rank === 2 ? 'silver' : entry.rank === 3 ? 'bronze' : ''
                        }`}
                      >
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                      </span>
                    </div>

                    <div className="modal-name-col">
                      <span className="modal-mentee-name">{entry.name}</span>
                      {entry.isMe && <span className="leaderboard-you-tag">You</span>}
                      {entry.isAnonymous && <span className="anonymous-indicator-tag">Private</span>}
                    </div>

                    <div className="modal-stats-col">
                      {entry.currentStreak > 0 && (
                        <span className="modal-streak-badge" title="Active check-in streak">
                          🔥 {entry.currentStreak}d
                        </span>
                      )}
                      {leaderboardPeriod === 'weekly' && (
                        <span className="modal-days-badge" title="Days submitted this week">
                          {entry.weeklySubmissions}/7d
                        </span>
                      )}
                      <span className="modal-score-badge">
                        {leaderboardPeriod === 'weekly' ? `${entry.weeklyPoints} pts` : `${entry.totalXp} XP`}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#70676d' }}>
                  No mentees found matching "{searchQuery}"
                </div>
              )}
            </div>

            {/* Privacy Opt-Out Toggle Box */}
            <div className="modal-privacy-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {activeLeaderboard.optedOut ? <EyeOff size={18} color="#8f3f66" /> : <Eye size={18} color="#15803d" />}
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#231e21' }}>
                    Leaderboard Privacy
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#70676d' }}>
                    {activeLeaderboard.optedOut
                      ? 'You are appearing anonymously as "Anonymous Learner" to fellow mentees.'
                      : 'Your real name is currently visible on the public leaderboard.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`privacy-toggle-btn ${activeLeaderboard.optedOut ? 'is-opted-out' : ''}`}
                onClick={() => void handleTogglePrivacy()}
                disabled={isUpdatingPrivacy}
              >
                {isUpdatingPrivacy
                  ? 'Saving...'
                  : activeLeaderboard.optedOut
                    ? 'Show My Real Name'
                    : 'Appear Anonymously'}
              </button>
            </div>

            {privacyToast && (
              <div className="modal-privacy-toast">
                ✓ {privacyToast}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scoring Rules Explanation Modal ──────────────────────────────────── */}
      {scoringInfoOpen && (
        <div
          className="leaderboard-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scoring-rules-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setScoringInfoOpen(false);
          }}
        >
          <div className="leaderboard-modal-card" style={{ maxWidth: 480 }}>
            <div className="leaderboard-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="growth-card-icon" style={{ background: '#fdf2f7', color: '#8f3f66' }}>
                  <HelpCircle size={20} />
                </div>
                <div>
                  <h3 id="scoring-rules-title" style={{ margin: 0, fontSize: '1.1rem', color: '#231e21' }}>
                    How Leaderboard Scoring Works
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: '#70676d' }}>
                    Fair, transparent, verified participation rules
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="leaderboard-modal-close-btn"
                onClick={() => setScoringInfoOpen(false)}
                aria-label="Close scoring rules modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="scoring-rules-body">
              <div className="rule-explanation-tile">
                <div className="rule-badge">+10 pts</div>
                <div>
                  <div className="rule-name">Daily Performance Check-in</div>
                  <div className="rule-desc">
                    Awarded for each verified daily check-in (maximum 1 per calendar day). Simply opening the dashboard does not award points.
                  </div>
                </div>
              </div>

              <div className="rule-explanation-tile">
                <div className="rule-badge milestone">+50 pts</div>
                <div>
                  <div className="rule-name">Weekly Consistency Milestone</div>
                  <div className="rule-desc">
                    Earned automatically when you log 5 or more daily check-ins during the current Monday–Sunday week.
                  </div>
                </div>
              </div>

              <div className="rule-explanation-tile">
                <div className="rule-badge streak">🔥 Habit</div>
                <div>
                  <div className="rule-name">Active Streak Multiplier</div>
                  <div className="rule-desc">
                    Consecutive daily check-ins build and preserve your streak. Streaks break ties when mentees have identical points.
                  </div>
                </div>
              </div>

              <div className="rule-explanation-tile">
                <div className="rule-badge tie">⚖️ Ties</div>
                <div>
                  <div className="rule-name">Fair Tie-Breaking System</div>
                  <div className="rule-desc">
                    Rankings are sorted by: 1) Points, 2) Number of weekly check-ins, 3) Current active streak, 4) Alphabetical order.
                  </div>
                </div>
              </div>

              <div className="rule-privacy-note">
                <ShieldCheck size={16} color="var(--primary)" />
                <span>
                  Academic marks, mentor notes, and private reflections are <strong>never</strong> used as leaderboard scoring inputs.
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right', marginTop: 14, padding: '0 20px 16px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '8px 20px', fontSize: '0.88rem' }}
                onClick={() => setScoringInfoOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
