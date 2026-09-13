import { useEffect, useMemo, useState } from 'react';
import { getMentors, getMentees, exportCallsReport } from '../lib/api';
import { FileSpreadsheet, Download, Filter } from 'lucide-react';

export function AdminReportsPage() {
  const token = useMemo(() => localStorage.getItem('anfaal-token') ?? '', []);
  const [mentors, setMentors] = useState<Array<{ id: string; name: string }>>([]);
  const [mentees, setMentees] = useState<Array<{ id: string; name: string; standard: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [filters, setFilters] = useState({
    from: '',
    to: '',
    mentorId: '',
    menteeId: '',
    standard: '',
    status: '',
  });

  useEffect(() => {
    if (!token) { setIsLoading(false); return; }
    Promise.all([getMentors(token), getMentees(token)])
      .then(([mentorRes, menteeRes]) => {
        setMentors((mentorRes.mentors ?? []).map((m: any) => ({ id: m.id, name: m.name })));
        setMentees((menteeRes.mentees ?? []).map((m: any) => ({ id: m.id, name: m.name, standard: m.standard })));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [token]);

  const standards = useMemo(() => [...new Set(mentees.map((m) => m.standard))].sort(), [mentees]);

  const handleExport = async () => {
    setIsExporting(true);
    setFeedback('');
    try {
      await exportCallsReport(token, filters);
      setFeedback('Report downloaded successfully.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to export report.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    setFilters({ from: '', to: '', mentorId: '', menteeId: '', standard: '', status: '' });
    setFeedback('');
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="eyebrow">Reports</div>
          <h2 className="page-title">Export Call Reports</h2>
          <p className="page-subtitle">Filter and download mentorship call data as CSV</p>
        </div>
      </div>

      <div className="summary-card" style={{ marginBottom: 24 }}>
        <div className="summary-header" style={{ marginBottom: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Filter size={18} /> Filter Options</h3>
          <button className="btn-secondary" onClick={handleReset} style={{ fontSize: '0.82rem', padding: '6px 14px' }}>Reset</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="field">
            <label>Date From</label>
            <input
              className="input"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Date To</label>
            <input
              className="input"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Mentor</label>
            <select className="select" value={filters.mentorId} onChange={(e) => setFilters((p) => ({ ...p, mentorId: e.target.value }))}>
              <option value="">All Mentors</option>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Mentee</label>
            <select className="select" value={filters.menteeId} onChange={(e) => setFilters((p) => ({ ...p, menteeId: e.target.value }))}>
              <option value="">All Mentees</option>
              {mentees.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Standard</label>
            <select className="select" value={filters.standard} onChange={(e) => setFilters((p) => ({ ...p, standard: e.target.value }))}>
              <option value="">All Classes</option>
              {standards.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="select" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">All Statuses</option>
              <option value="Approved">Approved</option>
              <option value="Pending Review">Pending Review</option>
              <option value="Rejected">Rejected</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Export action */}
      <div className="summary-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(143,63,102,0.08)', display: 'grid', placeItems: 'center' }}>
            <FileSpreadsheet size={22} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>CSV Report</div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Includes mentor name, mentee name, date, duration, status, summary, topics, and action items</div>
          </div>
        </div>
        <button
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 160, justifyContent: 'center' }}
          onClick={handleExport}
          disabled={isExporting || isLoading}
        >
          <Download size={16} />
          {isExporting ? 'Exporting…' : 'Download CSV'}
        </button>
      </div>

      {feedback && (
        <div className="summary-card" style={{ marginTop: 16, borderColor: feedback.includes('success') ? 'var(--success)' : 'var(--danger)' }}>
          <strong>{feedback}</strong>
        </div>
      )}
    </>
  );
}
