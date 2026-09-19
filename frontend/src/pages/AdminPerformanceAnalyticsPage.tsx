import { useState, useEffect } from 'react';
import { BookOpen, Filter, Sparkles, RefreshCw } from 'lucide-react';
import { getAdminPerformanceAnalytics, getMentors, getMentees } from '../lib/api';

const MOOD_MAP: Record<number, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊',
};

export function AdminPerformanceAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [mentors, setMentors] = useState<any[]>([]);
  const [mentees, setMentees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedMentor, setSelectedMentor] = useState('');
  const [selectedMentee, setSelectedMentee] = useState('');
  const [selectedStandard, setSelectedStandard] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadData = () => {
    setIsLoading(true);
    getAdminPerformanceAnalytics({
      mentorId: selectedMentor || undefined,
      menteeId: selectedMentee || undefined,
      standard: selectedStandard || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    })
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token') ?? '';
    Promise.all([
      getMentors(token).catch(() => ({ mentors: [] })),
      getMentees(token).catch(() => ({ mentees: [] })),
    ]).then(([mentorRes, menteeRes]) => {
      setMentors(mentorRes.mentors ?? []);
      setMentees(menteeRes.mentees ?? []);
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedMentor, selectedMentee, selectedStandard, fromDate, toDate]);

  const summary = data?.summary;

  return (
    <div className="admin-performance-page" style={{ display: 'grid', gap: 24, paddingBottom: 60 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color="var(--primary)" /> Operational Insights
          </div>
          <h2 className="page-title" style={{ fontSize: '1.8rem' }}>Mentee Performance Analytics</h2>
        </div>
        <button
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={loadData}
        >
          <RefreshCw size={15} /> Refresh Analytics
        </button>
      </div>

      {/* ── Filters Card ─────────────────────────────────────────────────── */}
      <div className="summary-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Filter size={16} color="var(--primary)" />
          <strong style={{ fontSize: '0.92rem' }}>Filter Performance Data</strong>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div className="field">
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Mentor</label>
            <select
              className="input"
              value={selectedMentor}
              onChange={(e) => setSelectedMentor(e.target.value)}
              style={{ height: 42, fontSize: '0.88rem' }}
            >
              <option value="">All Mentors</option>
              {mentors.map((m) => (
                <option key={m.id || m._id} value={m.id || m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Mentee</label>
            <select
              className="input"
              value={selectedMentee}
              onChange={(e) => setSelectedMentee(e.target.value)}
              style={{ height: 42, fontSize: '0.88rem' }}
            >
              <option value="">All Mentees</option>
              {mentees.map((m) => (
                <option key={m.id || m._id} value={m.id || m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Standard / Class</label>
            <select
              className="input"
              value={selectedStandard}
              onChange={(e) => setSelectedStandard(e.target.value)}
              style={{ height: 42, fontSize: '0.88rem' }}
            >
              <option value="">All Classes</option>
              {['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>From Date</label>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ height: 42, fontSize: '0.85rem' }}
            />
          </div>

          <div className="field">
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>To Date</label>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ height: 42, fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

      {/* ── Metric Cards (Requirement 15) ─────────────────────────────────── */}
      <div className="card-grid">
        <div className="dashboard-card">
          <div className="label">Total Active Mentees</div>
          <div className="value">{isLoading ? '—' : summary?.totalActiveMentees ?? 0}</div>
          <div className="change">Assigned across foundation</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Daily Submissions</div>
          <div className="value">{isLoading ? '—' : summary?.dailySubmissions ?? 0}</div>
          <div className="change">Logged today</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Weekly Submissions</div>
          <div className="value">{isLoading ? '—' : summary?.weeklySubmissions ?? 0}</div>
          <div className="change">Past 7 days volume</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Submission Rate</div>
          <div className="value" style={{ color: 'var(--primary)' }}>
            {isLoading ? '—' : `${summary?.submissionRate ?? 0}%`}
          </div>
          <div className="change">Expected weekly logging consistency</div>
        </div>
      </div>

      {/* ── Average Activity Metrics ─────────────────────────────────────── */}
      <div className="card-grid">
        <div className="dashboard-card">
          <div className="label">Average Study Time</div>
          <div className="value">{isLoading ? '—' : summary?.averageStudyHoursFormatted ?? '0h 0m'}</div>
          <div className="change">Per logged entry</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Average Quran Activity</div>
          <div className="value">{isLoading ? '—' : `${summary?.averageQuranPages ?? 0} pgs`}</div>
          <div className="change">Total Ruku: {summary?.totalQuranRuku ?? 0}</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Average Reading Time</div>
          <div className="value">{isLoading ? '—' : `${summary?.averageReadingMinutes ?? 0} min`}</div>
          <div className="change">Independent reading time</div>
        </div>

        <div className="dashboard-card">
          <div className="label">Average Day Rating</div>
          <div className="value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isLoading ? '—' : `${summary?.averageDayRating ?? '—'} / 5`}
            <span>{summary?.averageDayRating ? MOOD_MAP[Math.round(summary.averageDayRating)] : ''}</span>
          </div>
          <div className="change">Self-reported mood & satisfaction</div>
        </div>
      </div>

      {/* ── Organizational Privacy & Principles Notice ────────────────────── */}
      <div
        className="summary-card"
        style={{
          background: 'linear-gradient(135deg, rgba(143,63,102,0.06), rgba(143,63,102,0.02))',
          padding: 20,
          borderRadius: 18,
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <BookOpen size={18} color="var(--primary)" />
          <strong style={{ fontSize: '0.95rem' }}>Anfaal Foundation Mentorship Principles</strong>
        </div>
        <p className="muted" style={{ fontSize: '0.88rem', margin: 0, lineHeight: 1.6 }}>
          Daily performance data is intended for mentor-guided encouragement and educational support.
          Personal reflections and private notes are protected to preserve trust and mentee psychological safety.
          No competitive rankings or leaderboards are computed.
        </p>
      </div>
    </div>
  );
}
