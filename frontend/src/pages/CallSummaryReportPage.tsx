import { useEffect, useState } from 'react';
import { getCallSummaryReport } from '../lib/api';

export function CallSummaryReportPage() {
  const token = localStorage.getItem('anfaal-token') ?? '';
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [report, setReport] = useState<{ totalCalls: number; completedSummaries: number; calls: Array<{ id: string; date?: string; summary?: { overview?: string } }> } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { getCallSummaryReport(token, period).then(setReport).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load report')); }, [period, token]);
  return <div><div className="page-header"><div><div className="eyebrow">Call intelligence</div><h2 className="page-title">Weekly / monthly call summary</h2><p className="page-subtitle">Review call volume and generated summaries without storing transcripts.</p></div><select className="input" value={period} onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}><option value="week">Last 7 days</option><option value="month">Last 30 days</option></select></div>{error && <div className="error-banner">{error}</div>}<div className="card-grid"><div className="dashboard-card"><div className="label">Calls</div><div className="value">{report?.totalCalls ?? '—'}</div></div><div className="dashboard-card"><div className="label">Summaries ready</div><div className="value">{report?.completedSummaries ?? '—'}</div></div></div><div className="summary-card" style={{ marginTop: 18 }}><h3>Recent calls</h3>{report?.calls?.length ? report.calls.map((call) => <div key={call.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}><strong>{call.date ? new Date(call.date).toLocaleDateString() : 'Call'}</strong><div className="muted">{call.summary?.overview || 'Summary processing or unavailable.'}</div></div>) : <p className="muted">No calls in this period.</p>}</div></div>;
}
