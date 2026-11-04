'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Save,
  CheckCircle,
  XCircle,
  Edit2,
  RefreshCw,
  Info,
  Sparkles,
} from 'lucide-react';
import {
  getAttendance,
  getMentees,
  getMyMentees,
  saveAttendance,
  getToken,
  type AttendanceRecord,
} from '@/lib/api';
import { getLocalDateInputValue } from '@/lib/dateTime';

type Mentee = { id: string; _id?: string; name: string };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function AttendanceView() {
  const [token, setToken] = useState('');
  const [userRole, setUserRole] = useState<string | undefined>(undefined);

  const [month, setMonth] = useState(currentMonth());
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [menteeId, setMenteeId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  // Form state for add / correct attendance
  const [formMenteeId, setFormMenteeId] = useState('');
  const [formDate, setFormDate] = useState(getLocalDateInputValue());
  const [formStatus, setFormStatus] = useState<'PRESENT' | 'ABSENT'>('PRESENT');
  const [formNotes, setFormNotes] = useState('');
  const [isEditingExisting, setIsEditingExisting] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    setToken(getToken());
    try {
      const stored = localStorage.getItem('anfaal-user');
      if (stored) {
        const u = JSON.parse(stored) as { role?: string };
        setUserRole(u.role);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadData = async () => {
    const currentToken = token || getToken();
    if (!currentToken) return;
    setIsLoading(true);
    try {
      const [menteesRes, attendanceRes] = await Promise.all([
        (userRole === 'ADMIN' ? getMentees(currentToken) : getMyMentees(currentToken)),
        getAttendance(currentToken, { month }),
      ]);
      setMentees((menteesRes as any).mentees ?? menteesRes ?? []);
      setRecords(attendanceRes.records ?? []);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Unable to load attendance data.',
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void loadData();
    }
  }, [month, token, userRole]);

  // Mentee ID -> Mentee Name mapping
  const menteeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mentees) {
      const id = String(m.id || m._id);
      map.set(id, m.name);
    }
    return map;
  }, [mentees]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (menteeId && record.menteeId !== menteeId) return false;
      if (statusFilter !== 'ALL' && record.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL') {
        if (sourceFilter === 'Daily Progress' && !record.source.includes('Daily Progress')) return false;
        if (sourceFilter === 'MANUAL' && !record.source.includes('MANUAL')) return false;
        if (sourceFilter === 'CALL' && !record.source.includes('CALL')) return false;
      }
      return true;
    });
  }, [records, menteeId, statusFilter, sourceFilter]);

  // Summary statistics for selected mentee / filter
  const summaryStats = useMemo(() => {
    const scopeRecords = menteeId ? records.filter((r) => r.menteeId === menteeId) : records;
    const present = scopeRecords.filter((r) => r.status === 'PRESENT').length;
    const absent = scopeRecords.filter((r) => r.status === 'ABSENT').length;
    const total = present + absent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    const autoCount = scopeRecords.filter((r) => r.source === 'Daily Progress').length;
    const manualCount = scopeRecords.filter((r) => r.isManual || r.source.includes('MANUAL')).length;

    return { present, absent, total, percentage, autoCount, manualCount };
  }, [records, menteeId]);

  // Pre-populate form to correct an existing record
  const handleEditRecord = (record: AttendanceRecord) => {
    setFormMenteeId(record.menteeId);
    setFormDate(record.date);
    setFormStatus(record.status);
    setFormNotes(record.notes || '');
    setIsEditingExisting(true);
    setMessage({
      text: `Editing attendance for ${menteeNameMap.get(record.menteeId) || 'selected mentee'} on ${record.date}.`,
      isError: false,
    });
  };

  const handleCancelEdit = () => {
    setIsEditingExisting(false);
    setFormNotes('');
    setMessage(null);
  };

  const handleSubmitAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMenteeId) {
      setMessage({ text: 'Please select a mentee first.', isError: true });
      return;
    }
    if (!formDate) {
      setMessage({ text: 'Please choose an attendance date.', isError: true });
      return;
    }

    const currentToken = token || getToken();
    setIsSaving(true);
    setMessage(null);

    try {
      await saveAttendance(currentToken, {
        menteeId: formMenteeId,
        date: formDate,
        status: formStatus,
        source: isEditingExisting ? 'MANUAL_CORRECTION' : 'MANUAL',
        notes: formNotes,
      });

      setMessage({
        text: `Attendance recorded as ${formStatus === 'PRESENT' ? 'Present' : 'Absent'} successfully.`,
        isError: false,
      });

      setIsEditingExisting(false);
      setFormNotes('');

      // Refresh records to display updated stats immediately
      const refreshed = await getAttendance(currentToken, { month });
      setRecords(refreshed.records ?? []);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Unable to save attendance.',
        isError: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1100, margin: '0 auto', width: '100%', minWidth: 0 }}>
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarCheck size={14} /> Mentorship Operations
          </div>
          <h1 style={{ margin: '4px 0', fontSize: '1.6rem', fontWeight: 800 }}>Monthly Attendance</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Attendance is automatically marked <strong>Present</strong> when mentees submit their Daily Progress. Mentors can add or correct exceptions manually.
          </p>
        </div>
        <button
          className="btn-outline btn-sm"
          onClick={() => void loadData()}
          disabled={isLoading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center', minHeight: 36 }}
        >
          <RefreshCw size={13} className={isLoading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── Alert Feedback ─────────────────────────────────────────────────── */}
      {message && (
        <div className={`alert-banner ${message.isError ? 'alert-error' : 'alert-success'}`} role="alert">
          {message.text}
        </div>
      )}

      {/* ── Summary & Filter Section ───────────────────────────────────────── */}
      <div className="summary-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="field" style={{ flex: '1 1 180px', minWidth: 160, margin: 0 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Month</span>
            <input
              className="input"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ minHeight: 40 }}
            />
          </label>

          <label className="field" style={{ flex: '2 1 240px', minWidth: 200, margin: 0 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Filter by Mentee</span>
            <select
              className="input"
              value={menteeId}
              onChange={(e) => setMenteeId(e.target.value)}
              style={{ minHeight: 40 }}
            >
              <option value="">All Mentees ({mentees.length})</option>
              {mentees.map((m) => {
                const id = String(m.id || m._id);
                return (
                  <option key={id} value={id}>
                    {m.name}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="field" style={{ flex: '1 1 150px', minWidth: 140, margin: 0 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ minHeight: 40 }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present Only</option>
              <option value="ABSENT">Absent Only</option>
            </select>
          </label>

          <label className="field" style={{ flex: '1 1 160px', minWidth: 150, margin: 0 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Source</span>
            <select
              className="input"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ minHeight: 40 }}
            >
              <option value="ALL">All Sources</option>
              <option value="Daily Progress">Daily Progress (Auto)</option>
              <option value="MANUAL">Manual / Corrected</option>
              <option value="CALL">Call / WhatsApp</option>
            </select>
          </label>
        </div>

        {/* ── KPI Metric Cards ──────────────────────────────────────────────── */}
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
          <div className="dashboard-card" style={{ borderLeft: '4px solid #16a34a' }}>
            <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={15} color="#16a34a" /> Present
            </div>
            <div className="value" style={{ color: '#16a34a' }}>{summaryStats.present}</div>
            <div className="change" style={{ fontSize: '0.78rem' }}>
              {summaryStats.autoCount} via Daily Progress
            </div>
          </div>

          <div className="dashboard-card" style={{ borderLeft: summaryStats.absent > 0 ? '4px solid #dc2626' : undefined }}>
            <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <XCircle size={15} color="#dc2626" /> Absent
            </div>
            <div className="value" style={{ color: summaryStats.absent > 0 ? '#dc2626' : undefined }}>
              {summaryStats.absent}
            </div>
            <div className="change" style={{ fontSize: '0.78rem' }}>Recorded absences</div>
          </div>

          <div className="dashboard-card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <div className="label">Attendance Rate</div>
            <div className="value">{summaryStats.percentage}%</div>
            <div className="change" style={{ fontSize: '0.78rem' }}>
              {summaryStats.present} of {summaryStats.total} logged days
            </div>
          </div>

          <div className="dashboard-card">
            <div className="label">Total Records</div>
            <div className="value">{summaryStats.total}</div>
            <div className="change" style={{ fontSize: '0.78rem' }}>
              {summaryStats.manualCount} manual corrections
            </div>
          </div>
        </div>
      </div>

      {/* ── Manual Add / Correct Attendance Form ───────────────────────────── */}
      {(userRole === 'MENTOR' || userRole === 'ADMIN') && (
        <form className="summary-card" onSubmit={handleSubmitAttendance} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Edit2 size={16} color="var(--primary)" />
              {isEditingExisting ? 'Correct Existing Attendance Record' : 'Add or Correct Attendance'}
            </h3>
            {isEditingExisting && (
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={handleCancelEdit}
                style={{ fontSize: '0.78rem', padding: '3px 8px' }}
              >
                Cancel Correction
              </button>
            )}
          </div>

          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Mentors and admins can manually mark Present or Absent, correct mistakes, or add notes. Manual corrections take precedence and will not be overwritten by automatic progress submissions.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '2 1 220px', minWidth: 200, margin: 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Mentee *</span>
              <select
                className="input"
                value={formMenteeId}
                onChange={(e) => setFormMenteeId(e.target.value)}
                required
                style={{ minHeight: 40 }}
              >
                <option value="">Select a mentee...</option>
                {mentees.map((m) => {
                  const id = String(m.id || m._id);
                  return (
                    <option key={id} value={id}>
                      {m.name}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="field" style={{ flex: '1 1 170px', minWidth: 150, margin: 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Date *</span>
              <input
                className="input"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                style={{ minHeight: 40 }}
              />
            </label>

            <label className="field" style={{ flex: '1 1 150px', minWidth: 140, margin: 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Status *</span>
              <select
                className="input"
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as any)}
                style={{ minHeight: 40 }}
              >
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
              </select>
            </label>

            <label className="field" style={{ flex: '2 1 240px', minWidth: 200, margin: 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Notes / Reason (Optional)</span>
              <input
                className="input"
                type="text"
                placeholder="e.g. Excused leave, offline review"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                style={{ minHeight: 40 }}
              />
            </label>

            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving}
              style={{
                minHeight: 40,
                padding: '0 18px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
              }}
            >
              <Save size={16} /> {isSaving ? 'Saving...' : isEditingExisting ? 'Update Record' : 'Save Attendance'}
            </button>
          </div>
        </form>
      )}

      {/* ── Attendance History Table & Cards ───────────────────────────────── */}
      <div className="summary-card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarCheck size={18} color="var(--primary)" /> Attendance History
          </h3>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            Showing {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredRecords.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '36px 16px',
              color: 'var(--text-secondary)',
              background: 'var(--surface-muted, #faf8f9)',
              borderRadius: 8,
              border: '1px dashed var(--border)',
            }}
          >
            <Info size={28} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No attendance records found</div>
            <div style={{ fontSize: '0.82rem', marginTop: 4, maxWidth: 440, margin: '4px auto 0' }}>
              Attendance is automatically marked <strong>Present</strong> when mentees submit their Daily Progress form. Records will appear here as students complete their updates.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table" style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Mentee</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Source</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Notes</th>
                  {(userRole === 'MENTOR' || userRole === 'ADMIN') && (
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const menteeName = menteeNameMap.get(record.menteeId) || record.menteeId;
                  const isDailyProgress = record.source === 'Daily Progress';
                  const isManual = record.isManual || record.source.includes('MANUAL');
                  const isCall = record.source.includes('CALL');

                  return (
                    <tr key={record.id || `${record.menteeId}-${record.date}`}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {record.date}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {menteeName}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {record.status === 'PRESENT' ? (
                          <span
                            className="status-badge status-completed"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.74rem',
                              padding: '2px 8px',
                            }}
                          >
                            <CheckCircle size={11} /> Present
                          </span>
                        ) : (
                          <span
                            className="status-badge status-failed"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.74rem',
                              padding: '2px 8px',
                            }}
                          >
                            <XCircle size={11} /> Absent
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {isDailyProgress ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(143, 63, 102, 0.1)',
                              color: 'var(--primary, #8f3f66)',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Sparkles size={11} /> Daily Progress
                          </span>
                        ) : isManual ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(100, 116, 139, 0.12)',
                              color: '#475569',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Edit2 size={11} /> Manual {record.isManual ? '(Corrected)' : ''}
                          </span>
                        ) : isCall ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#059669',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Call
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {record.source}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: '0.8rem',
                          color: record.notes ? 'var(--text-primary)' : 'var(--text-secondary)',
                          maxWidth: 220,
                        }}
                      >
                        {record.notes || '—'}
                      </td>
                      {(userRole === 'MENTOR' || userRole === 'ADMIN') && (
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            style={{ fontSize: '0.74rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={() => handleEditRecord(record)}
                            title="Correct this attendance record"
                          >
                            <Edit2 size={11} /> Correct
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
