import { useEffect, useState } from 'react';
import { getAnalyticsSummary } from '../lib/api';

type AnalyticsSummary = {
  totalCalls: number;
  approvedCalls: number;
  rejectedCalls: number;
  pendingCalls: number;
  averageDurationMinutes: number;
  approvalRate: number;
  topTopics: Array<{ name: string; count: number }>;
};

const fallbackSummary: AnalyticsSummary = {
  totalCalls: 0,
  approvedCalls: 0,
  rejectedCalls: 0,
  pendingCalls: 0,
  averageDurationMinutes: 0,
  approvalRate: 0,
  topTopics: [],
};

export function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>(fallbackSummary);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    getAnalyticsSummary(token)
      .then((response) => setSummary(response))
      .catch(() => setSummary(fallbackSummary))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="form-card">
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="label">Analytics</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Program performance overview</h3>
        </div>
      </div>

      <div className="card-grid">
        <div className="dashboard-card">
          <div className="label">Total calls</div>
          <div className="value">{isLoading ? '—' : summary.totalCalls}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Approved</div>
          <div className="value">{isLoading ? '—' : summary.approvedCalls}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Pending review</div>
          <div className="value">{isLoading ? '—' : summary.pendingCalls}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Approval rate</div>
          <div className="value">{isLoading ? '—' : `${summary.approvalRate}%`}</div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-header">
            <h3>Session quality</h3>
          </div>
          <ul style={{ marginTop: 18, display: 'grid', gap: 12, paddingLeft: 18, color: 'var(--text-primary)' }}>
            <li>Average duration: {isLoading ? '—' : `${summary.averageDurationMinutes} min`}</li>
            <li>Rejected sessions: {isLoading ? '—' : summary.rejectedCalls}</li>
            <li>Mentorship focus areas: {isLoading ? '—' : summary.topTopics.length}</li>
          </ul>
        </div>

        <div className="summary-card">
          <div className="summary-header">
            <h3>Top discussion themes</h3>
          </div>
          <ul style={{ marginTop: 18, display: 'grid', gap: 12, paddingLeft: 18, color: 'var(--text-primary)' }}>
            {summary.topTopics.length === 0 ? (
              <li>No themes yet.</li>
            ) : (
              summary.topTopics.map((topic) => (
                <li key={topic.name}>
                  {topic.name} — {topic.count} occurrences
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
