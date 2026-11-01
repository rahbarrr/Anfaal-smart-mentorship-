import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, FileText, Calendar } from 'lucide-react';
import { getCallSummaryReport } from '../lib/api';

export function CallSummaryReportPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('anfaal-token') ?? '';
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [report, setReport] = useState<{ totalCalls: number; completedSummaries: number; calls: Array<{ id: string; date?: string; summary?: { overview?: string } }> } | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getCallSummaryReport(token, period)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load report'))
      .finally(() => setIsLoading(false));
  }, [period, token]);

  return (
    <div style={{ display: 'grid', gap: 20, paddingBottom: 60, minWidth: 0, width: '100%' }}>
      {/* Back button */}
      <div>
        <button
          type="button"
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', minHeight: 38 }}
          onClick={() => navigate('/mentee')}
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
      </div>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={14} color="var(--primary)" /> Call Intelligence
          </div>
          <h2 className="page-title" style={{ fontSize: 'clamp(1.3rem, 4vw, 1.8rem)' }}>Call Summaries</h2>
          <p className="page-subtitle" style={{ fontSize: 'clamp(0.82rem, 2.5vw, 0.92rem)' }}>
            Review mentor call summaries, guidance notes, and key discussion points.
          </p>
        </div>
        <select
          className="input"
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}
          style={{ width: 'auto', minWidth: 150, height: 40, fontSize: '0.88rem' }}
          aria-label="Filter report period"
        >
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <div className="dashboard-card" style={{ padding: '16px' }}>
          <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={15} color="var(--primary)" /> Total Calls
          </div>
          <div className="value" style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', marginTop: 4 }}>
            {isLoading ? '…' : report?.totalCalls ?? 0}
          </div>
        </div>
        <div className="dashboard-card" style={{ padding: '16px' }}>
          <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={15} color="#16a34a" /> Summaries Ready
          </div>
          <div className="value" style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', marginTop: 4 }}>
            {isLoading ? '…' : report?.completedSummaries ?? 0}
          </div>
        </div>
      </div>

      <div className="summary-card" style={{ padding: 'clamp(16px, 3.5vw, 22px)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={18} color="var(--primary)" /> Recent Mentor Calls
        </h3>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--text-secondary)' }}>Loading calls…</div>
        ) : report?.calls?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {report.calls.map((call) => (
              <div
                key={call.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--surface-muted, #faf8f9)',
                  border: '1px solid var(--border)',
                  minWidth: 0,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                  {call.date ? new Date(call.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Call Session'}
                </div>
                <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {call.summary?.overview || 'Summary processing or unavailable.'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>No calls recorded in this timeframe.</p>
        )}
      </div>
    </div>
  );
}
