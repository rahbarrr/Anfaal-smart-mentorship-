import { useEffect, useState } from 'react';
import { getReviewQueue, updateCallReview } from '../lib/api';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

type CallReview = {
  id: string;
  mentorId: string;
  menteeId: string;
  date: string;
  duration: number;
  summary?: string;
  recordingUrl?: string;
  reviewStatus: string;
};

export function AdminReviewPage() {
  const [calls, setCalls] = useState<CallReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = () => {
    if (!token) { setIsLoading(false); return; }
    getReviewQueue(token)
      .then((res) => setCalls(res.calls ?? []))
      .catch(() => setCalls([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, [token]);

  const handleReview = async (callId: string, status: 'Approved' | 'Rejected') => {
    try {
      await updateCallReview(token, callId, status);
      setFeedback(`Call ${status.toLowerCase()} successfully.`);
      loadData();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to update review.');
    }
  };

  return (
    <div className="form-card">
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="label">Reviews</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Pending call reviews</h3>
          <p className="page-subtitle">{calls.length} call{calls.length !== 1 ? 's' : ''} awaiting your review</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} color="var(--warning)" />
          <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{calls.length} Pending</span>
        </div>
      </div>

      {feedback && (
        <div className="summary-card" style={{ marginBottom: 16, borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: feedback.includes('success') ? 'var(--success)' : 'var(--danger)' }}>
          <strong style={{ color: feedback.includes('success') ? 'var(--success)' : 'var(--danger)' }}>{feedback}</strong>
        </div>
      )}

      {calls.length === 0 && !isLoading ? (
        <div className="summary-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: 'rgba(43,138,91,0.08)', placeItems: 'center', marginBottom: 14 }}>
            <CheckCircle size={26} color="var(--success)" />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>All caught up!</h3>
          <p className="muted">No pending call reviews at the moment.</p>
        </div>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>Loading review queue…</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {calls.map((call) => {
            const isExpanded = expandedId === call.id;
            return (
              <div key={call.id} className="summary-card" style={{ transition: 'box-shadow 0.2s' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 12, flexWrap: 'wrap' }}
                  onClick={() => setExpandedId(isExpanded ? null : call.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(207,159,75,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Clock size={18} color="var(--warning)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {new Date(call.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {call.duration} min
                      </div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        {call.summary ? (call.summary.length > 80 ? call.summary.slice(0, 80) + '…' : call.summary) : 'No summary available'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="status-badge status-pending">Pending Review</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                      <div>
                        <div className="label" style={{ marginBottom: 4 }}>Mentor ID</div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', wordBreak: 'break-all' }}>{call.mentorId}</div>
                      </div>
                      <div>
                        <div className="label" style={{ marginBottom: 4 }}>Mentee ID</div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', wordBreak: 'break-all' }}>{call.menteeId}</div>
                      </div>
                    </div>

                    {call.summary && (
                      <div style={{ marginBottom: 18 }}>
                        <div className="label" style={{ marginBottom: 6 }}>AI Summary</div>
                        <p style={{ lineHeight: 1.7, padding: '12px 14px', background: 'rgba(143,63,102,0.04)', borderRadius: 10, fontSize: '0.92rem' }}>
                          {call.summary}
                        </p>
                      </div>
                    )}

                    {call.recordingUrl && (
                      <div style={{ marginBottom: 18 }}>
                        <div className="label" style={{ marginBottom: 6 }}>Recording</div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Audio file available</div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger)' }}
                        onClick={(e) => { e.stopPropagation(); handleReview(call.id, 'Rejected'); }}
                      >
                        <XCircle size={15} /> Reject
                      </button>
                      <button
                        className="btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={(e) => { e.stopPropagation(); handleReview(call.id, 'Approved'); }}
                      >
                        <CheckCircle size={15} /> Approve
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
