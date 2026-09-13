import { useEffect, useState } from 'react';
import { getMentorshipSummary } from '../lib/api';

type MentorshipSummary = {
  totalAssignments: number;
  activeAssignments: number;
  archivedAssignments: number;
  mentorsByAssignmentCount: Array<{ mentorName: string; assignmentCount: number }>;
};

const fallback: MentorshipSummary = {
  totalAssignments: 0,
  activeAssignments: 0,
  archivedAssignments: 0,
  mentorsByAssignmentCount: [],
};

export function AdminMentorshipPage() {
  const [summary, setSummary] = useState<MentorshipSummary>(fallback);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) { setIsLoading(false); return; }

    getMentorshipSummary(token)
      .then((res) => setSummary(res))
      .catch(() => setSummary(fallback))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="form-card">
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="label">Mentorships</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentorship overview</h3>
          <p className="page-subtitle">Summary of mentor-to-mentee relationships</p>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: 24 }}>
        <div className="dashboard-card">
          <div className="label">Total Assignments</div>
          <div className="value">{isLoading ? '—' : summary.totalAssignments}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Active</div>
          <div className="value" style={{ color: 'var(--success)' }}>{isLoading ? '—' : summary.activeAssignments}</div>
        </div>
        <div className="dashboard-card">
          <div className="label">Archived</div>
          <div className="value" style={{ color: 'var(--text-secondary)' }}>{isLoading ? '—' : summary.archivedAssignments}</div>
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-header">
          <h3>Mentors by assignment count</h3>
        </div>
        {summary.mentorsByAssignmentCount.length === 0 ? (
          <p className="muted" style={{ marginTop: 18 }}>No assignment data yet.</p>
        ) : (
          <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            {summary.mentorsByAssignmentCount.map((entry, i) => {
              const maxCount = Math.max(...summary.mentorsByAssignmentCount.map((e) => e.assignmentCount), 1);
              const pct = Math.round((entry.assignmentCount / maxCount) * 100);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontWeight: 600, minWidth: 140, fontSize: '0.9rem' }}>{entry.mentorName}</div>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: 999, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ minWidth: 28, fontWeight: 700, textAlign: 'right', fontSize: '0.9rem' }}>{entry.assignmentCount}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
