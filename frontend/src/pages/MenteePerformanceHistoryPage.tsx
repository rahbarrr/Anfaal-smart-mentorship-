import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, Plus } from 'lucide-react';
import { getPerformanceHistory } from '../lib/api';
import { formatDateOnly, formatSubmissionTimestamps } from '../lib/dateTime';

const MOOD_MAP: Record<number, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊',
};

function formatDuration(min: number): string {
  if (min === 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function MenteePerformanceHistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'weekly' | 'monthly' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const fetchRecords = (from?: string, to?: string) => {
    setIsLoading(true);
    getPerformanceHistory({ from, to, limit: 100 })
      .then((res) => setRecords(res.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (filterMode === 'all') {
      fetchRecords();
    } else if (filterMode === 'weekly') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      fetchRecords(d.toISOString().slice(0, 10));
    } else if (filterMode === 'monthly') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      fetchRecords(d.toISOString().slice(0, 10));
    } else if (filterMode === 'custom' && customFrom && customTo) {
      fetchRecords(customFrom, customTo);
    }
  }, [filterMode, customFrom, customTo]);

  return (
    <div className="mentee-history-page" style={{ display: 'grid', gap: 20, paddingBottom: 60 }}>
      {/* Back button & page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}
          onClick={() => navigate('/mentee')}
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <button
          type="button"
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => navigate('/mentee/daily')}
        >
          <Plus size={16} /> Record Today's Progress
        </button>
      </div>

      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Tracking & Consistency</div>
          <h2 className="page-title" style={{ fontSize: '1.8rem' }}>Performance History</h2>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        className="summary-card"
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Filter size={16} color="var(--primary)" />
          <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Timeframe:</span>
          {(['all', 'weekly', 'monthly', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              style={{
                background: filterMode === mode ? 'var(--primary)' : '#fff',
                color: filterMode === mode ? '#fff' : 'var(--text-primary)',
                border: '1px solid',
                borderColor: filterMode === mode ? 'var(--primary)' : 'var(--border)',
                padding: '6px 14px',
                borderRadius: 16,
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'all' ? 'All Time' : mode === 'weekly' ? 'Last 7 Days' : mode === 'monthly' ? 'Last 30 Days' : 'Custom Range'}
            </button>
          ))}
        </div>

        {filterMode === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              className="input"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ height: 38, fontSize: '0.85rem', maxWidth: 150 }}
            />
            <span className="muted" style={{ fontSize: '0.85rem' }}>to</span>
            <input
              type="date"
              className="input"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ height: 38, fontSize: '0.85rem', maxWidth: 150 }}
            />
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="desktop-table">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Study</th>
                <th>Ruku</th>
                <th>Ayat</th>
                <th>Pages</th>
                <th>Reading</th>
                <th>Day</th>
                <th>Reflection</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                    Loading history…
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>No performance records found</div>
                    <div style={{ fontSize: '0.88rem' }}>Start logging your daily progress to see your history table.</div>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const timestamps = formatSubmissionTimestamps(r.submittedAt || r.createdAt, r.updatedAt);
                  return (
                    <tr key={r._id || r.id || r.date}>
                      <td>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatDateOnly(r.date)}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>
                          Submitted: {timestamps.submittedFormatted}
                        </div>
                        {timestamps.isEdited && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            Updated: {timestamps.updatedFormatted}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {formatDuration(r.studyMinutes)}
                      </td>
                      <td>{r.quran?.ruku ?? 0}</td>
                      <td>{r.quran?.ayat ?? 0}</td>
                      <td>{r.quran?.pages ?? 0}</td>
                      <td>{formatDuration(r.readingMinutes)}</td>
                      <td style={{ fontSize: '1.4rem' }}>
                        {MOOD_MAP[r.dayRating] ?? '—'}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: 260 }}>
                        {r.dailyReflection ? (
                          <span title={r.dailyReflection}>
                            {r.dailyReflection.length > 60 ? r.dailyReflection.slice(0, 60) + '…' : r.dailyReflection}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="mobile-card-list">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
            Loading history…
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No performance records found</div>
            <div style={{ fontSize: '0.88rem' }}>Start logging your daily progress to see your history table.</div>
          </div>
        ) : (
          records.map((r) => {
            const timestamps = formatSubmissionTimestamps(r.submittedAt || r.createdAt, r.updatedAt);
            return (
              <div
                key={r._id || r.id || r.date}
                className="mobile-card"
                style={{ padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      Performance: {formatDateOnly(r.date)}
                    </span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      Submitted: {timestamps.submittedFormatted}
                    </div>
                    {timestamps.isEdited && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        Updated: {timestamps.updatedFormatted}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }} title={`Day rating: ${r.dayRating}/5`}>
                    {MOOD_MAP[r.dayRating] ?? '🙂'}
                  </span>
                </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  padding: '10px 12px',
                  background: 'var(--surface-muted)',
                  borderRadius: 12,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    Study
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)', marginTop: 2 }}>
                    {formatDuration(r.studyMinutes)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    Quran
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 2 }}>
                    {r.quran?.ruku ?? 0}R · {r.quran?.pages ?? 0}p
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    Reading
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 2 }}>
                    {formatDuration(r.readingMinutes)}
                  </div>
                </div>
              </div>

              {r.dailyReflection && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.45, padding: '8px 10px', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                  "{r.dailyReflection}"
                </div>
              )}
            </div>
          );
        })
      )}
      </div>
    </div>
  );
}
