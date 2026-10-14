import { useEffect, useMemo, useState } from 'react';
import { getMentors, getMentees, exportCallsReport, getAuditLogs, type AuditLogRow } from '../lib/api';
import { FileSpreadsheet, Download, Filter, ShieldCheck, RefreshCw, Activity, Volume2, FileText, Edit3, CheckCircle2, UserCheck, Trash2, ArrowUpDown } from 'lucide-react';

export function AdminReportsPage() {
  const token = useMemo(() => localStorage.getItem('anfaal-token') ?? '', []);
  const [activeTab, setActiveTab] = useState<'export' | 'audit'>('export');

  // Export states
  const [mentors, setMentors] = useState<Array<{ id: string; name: string }>>([]);
  const [mentees, setMentees] = useState<Array<{ id: string; name: string; standard: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [loadError, setLoadError] = useState('');

  const [filters, setFilters] = useState({
    from: '',
    to: '',
    mentorId: '',
    menteeId: '',
    standard: '',
    status: '',
  });

  // Audit log states
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('');

  useEffect(() => {
    if (!token) { setIsLoading(false); return; }
    Promise.all([getMentors(token), getMentees(token)])
      .then(([mentorRes, menteeRes]) => {
        setMentors((mentorRes.mentors ?? []).map((m: any) => ({ id: m.id, name: m.name })));
        setMentees((menteeRes.mentees ?? []).map((m: any) => ({ id: m.id, name: m.name, standard: m.standard })));
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Unable to load report filters.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  const fetchAuditLogs = () => {
    if (!token) return;
    setAuditLoading(true);
    getAuditLogs(token, auditActionFilter || undefined, 100)
      .then((res) => setAuditLogs(res.logs ?? []))
      .catch((error) => {
        setAuditLogs([]);
        setLoadError(error instanceof Error ? error.message : 'Unable to load audit logs.');
      })
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, auditActionFilter, token]);

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

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'UPLOAD_RECORDING':
        return { label: 'Upload Recording', icon: Activity, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' };
      case 'PLAY_RECORDING':
        return { label: 'Play Recording', icon: Volume2, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' };
      case 'VIEW_TRANSCRIPT':
        return { label: 'View Transcript', icon: FileText, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' };
      case 'EDIT_SUMMARY':
        return { label: 'Edit Summary', icon: Edit3, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
      case 'APPROVE_SUMMARY':
        return { label: 'Approve Summary', icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
      case 'CHANGE_ASSIGNMENT':
        return { label: 'Change Assignment', icon: ArrowUpDown, color: '#6366f1', bg: 'rgba(99,102,241,0.1)' };
      case 'DELETE_RECORD':
        return { label: 'Delete Record', icon: Trash2, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
      default:
        return { label: action, icon: UserCheck, color: 'var(--text-secondary)', bg: 'rgba(0,0,0,0.05)' };
    }
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow">Governance & Intelligence</div>
          <h2 className="page-title">Reports & Security Audit</h2>
          <p className="page-subtitle">Export official mentorship data and inspect security audit access trails</p>
        </div>
      </div>

      {loadError && <div className="alert-banner alert-error" role="alert">Unable to load the latest report data: {loadError}</div>}

      {/* Primary Tab Navigation */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0, width: '100%' }}>
        <button
          onClick={() => setActiveTab('export')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.92rem',
            background: activeTab === 'export' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'export' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            minHeight: 44,
          }}
        >
          <FileSpreadsheet size={16} /> Export Call Reports
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.92rem',
            background: activeTab === 'audit' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'audit' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            minHeight: 44,
          }}
        >
          <ShieldCheck size={16} /> Security Audit Log
        </button>
      </div>

      {/* ── TAB 1: CSV Export ────────────────────────────────────────────── */}
      {activeTab === 'export' && (
        <>
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
      )}

      {/* ── TAB 2: Security Audit Log (Section 16) ────────────────────────── */}
      {activeTab === 'audit' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="summary-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(143,63,102,0.1)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Security Access & Action Audit Trail</div>
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  Tracks sensitive operations: voice recording streaming, transcript reading, AI summary approvals, and assignment changes.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', maxWidth: 440 }}>
              <select
                className="select"
                style={{ flex: 1, minWidth: 180 }}
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
              >
                <option value="">All Security Events</option>
                <option value="PLAY_RECORDING">Play Recording</option>
                <option value="UPLOAD_RECORDING">Upload Recording</option>
                <option value="VIEW_TRANSCRIPT">View Transcript</option>
                <option value="EDIT_SUMMARY">Edit Summary</option>
                <option value="APPROVE_SUMMARY">Approve Summary</option>
                <option value="CHANGE_ASSIGNMENT">Change Assignment</option>
                <option value="DELETE_RECORD">Delete Record</option>
              </select>

              <button
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42 }}
                onClick={fetchAuditLogs}
                disabled={auditLoading}
              >
                <RefreshCw size={15} className={auditLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {auditLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
              Loading audit trail…
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="summary-card" style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-secondary)' }}>
              <ShieldCheck size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ fontWeight: 600, fontSize: '1rem' }}>No audit events recorded yet</p>
              <p style={{ fontSize: '0.85rem' }}>Audio playback, upload, edit, and approval events will appear here automatically.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="desktop-table">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Target / Mentee</th>
                        <th>Details</th>
                        <th>IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => {
                        const badge = getActionBadge(log.action);
                        const IconComponent = badge.icon;
                        return (
                          <tr key={log._id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {new Date(log.createdAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{log.userName}</div>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: log.userRole === 'ADMIN' ? 'rgba(143,63,102,0.1)' : 'rgba(59,130,246,0.1)',
                                  color: log.userRole === 'ADMIN' ? 'var(--primary)' : '#2563eb',
                                }}
                              >
                                {log.userRole}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  color: badge.color,
                                  background: badge.bg,
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <IconComponent size={13} />
                                {badge.label}
                              </span>
                            </td>
                            <td>
                              {log.menteeName ? (
                                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                                  Mentee: <strong>{log.menteeName}</strong>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                  {log.targetType}
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: '0.85rem', maxWidth: 300, lineHeight: 1.4 }}>
                              {log.details}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {log.ipAddress || '127.0.0.1'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View */}
              <div className="mobile-card-list">
                {auditLogs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const IconComponent = badge.icon;
                  return (
                    <div key={log._id} className="mobile-card" style={{ padding: '14px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                            {log.userName}
                          </div>
                          <span
                            style={{
                              display: 'inline-block',
                              marginTop: 2,
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: log.userRole === 'ADMIN' ? 'rgba(143,63,102,0.1)' : 'rgba(59,130,246,0.1)',
                              color: log.userRole === 'ADMIN' ? 'var(--primary)' : '#2563eb',
                            }}
                          >
                            {log.userRole}
                          </span>
                        </div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: badge.color,
                            background: badge.bg,
                            padding: '4px 10px',
                            borderRadius: 999,
                            flexShrink: 0,
                          }}
                        >
                          <IconComponent size={13} />
                          {badge.label}
                        </span>
                      </div>

                      {log.menteeName && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                          Mentee: {log.menteeName}
                        </div>
                      )}

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                        {log.details}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: 6 }}>
                        <span>
                          {new Date(log.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span style={{ fontFamily: 'monospace' }}>{log.ipAddress || '127.0.0.1'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
