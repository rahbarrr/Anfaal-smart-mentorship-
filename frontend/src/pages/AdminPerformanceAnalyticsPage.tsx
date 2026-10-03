import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Filter, Sparkles, RefreshCw, Trash2, Search, X, ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { getAdminPerformanceAnalytics, getMentors, getMentees, getAdminDailyPerformance, deleteDailyPerformance, bulkDeleteDailyPerformance } from '../lib/api';

const MOOD_MAP: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😞', label: 'Very difficult' },
  2: { emoji: '😕', label: 'Difficult' },
  3: { emoji: '😐', label: 'Okay' },
  4: { emoji: '🙂', label: 'Good' },
  5: { emoji: '😊', label: 'Very good' },
};

function formatDuration(min: number): string {
  if (!min || min === 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

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

  // Daily Performance Records & Admin Delete State
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsTotalPages, setRecordsTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<any | 'BULK' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const selectAllDesktopRef = useRef<HTMLInputElement | null>(null);
  const selectAllMobileRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(() => {
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
  }, [selectedMentor, selectedMentee, selectedStandard, fromDate, toDate]);

  const loadRecords = useCallback(async (page = 1) => {
    setRecordsLoading(true);
    try {
      const res = await getAdminDailyPerformance({
        mentorId: selectedMentor || undefined,
        menteeId: selectedMentee || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        search: searchQuery || undefined,
        page,
        limit: 20,
      });
      setRecords(res.records || []);
      setRecordsTotal(res.total || 0);
      setRecordsPage(res.page || 1);
      setRecordsTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to load performance records', err);
    } finally {
      setRecordsLoading(false);
    }
  }, [selectedMentor, selectedMentee, fromDate, toDate, searchQuery]);

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
    const timer = window.setTimeout(() => {
      loadData();
      loadRecords(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loadData, loadRecords]);

  // Sync indeterminate state for select-all checkboxes
  useEffect(() => {
    const count = selectedRecordIds.size;
    const isIndeterminate = count > 0 && count < records.length;
    if (selectAllDesktopRef.current) selectAllDesktopRef.current.indeterminate = isIndeterminate;
    if (selectAllMobileRef.current) selectAllMobileRef.current.indeterminate = isIndeterminate;
  }, [selectedRecordIds, records]);

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllRecords = () => {
    if (selectedRecordIds.size === records.length && records.length > 0) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(records.map((r: any) => String(r._id || r.id))));
    }
  };

  const executeDeleteRecords = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setFeedback(null);
    const token = localStorage.getItem('anfaal-token') ?? '';

    try {
      if (deleteTarget === 'BULK') {
        const ids = Array.from(selectedRecordIds);
        const res = await bulkDeleteDailyPerformance(token, ids);
        setRecords((prev) => prev.filter((r: any) => !selectedRecordIds.has(String(r._id || r.id))));
        setRecordsTotal((prev) => Math.max(0, prev - ids.length));
        setSelectedRecordIds(new Set());
        setFeedback({
          msg: res.message || `${ids.length} daily performance responses deleted successfully.`,
          type: 'success',
        });
      } else {
        const targetId = String(deleteTarget._id || deleteTarget.id);
        const res = await deleteDailyPerformance(token, targetId);
        setRecords((prev) => prev.filter((r: any) => String(r._id || r.id) !== targetId));
        setRecordsTotal((prev) => Math.max(0, prev - 1));
        setSelectedRecordIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        setFeedback({
          msg: res.message || 'Daily performance entry deleted successfully.',
          type: 'success',
        });
      }
      setDeleteTarget(null);
      loadData(); // refresh analytics numbers
    } catch (err: any) {
      setFeedback({
        msg: err.message || 'Failed to delete daily performance entry.',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

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
            <span>{summary?.averageDayRating ? (MOOD_MAP[Math.round(summary.averageDayRating)]?.emoji ?? '') : ''}</span>
          </div>
          <div className="change">Self-reported mood & satisfaction</div>
        </div>
      </div>

      {/* ── Daily Performance Submissions & Delete Section ───────────────── */}
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarCheck size={14} color="var(--primary)" /> Data Management
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '2px 0 0' }}>Daily Mentee Performance Records</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Showing {records.length} of {recordsTotal} responses across the foundation.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: 260 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                className="input"
                placeholder="Search mentee name, MAK ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 36, height: 42, fontSize: '0.88rem' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => loadRecords(recordsPage)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 42 }}
            >
              <RefreshCw size={15} /> Refresh Records
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: feedback.type === 'success' ? 'rgba(46,125,50,0.1)' : 'rgba(199,92,92,0.1)',
              border: `1px solid ${feedback.type === 'success' ? 'rgba(46,125,50,0.3)' : 'rgba(199,92,92,0.3)'}`,
              color: feedback.type === 'success' ? '#2e7d32' : 'var(--danger)',
            }}
          >
            <span>{feedback.msg}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'inherit' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Mobile Select-All Bar */}
        <div
          className="mobile-select-all-row"
          style={{
            padding: '10px 14px',
            background: 'var(--surface-muted)',
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700 }}>
            <input
              ref={selectAllMobileRef}
              type="checkbox"
              style={{ width: 22, height: 22, accentColor: 'var(--primary)' }}
              checked={records.length > 0 && selectedRecordIds.size === records.length}
              onChange={toggleSelectAllRecords}
            />
            <span>Select All on Page ({records.length})</span>
          </label>
          {selectedRecordIds.size > 0 && (
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}>
              {selectedRecordIds.size} selected
            </span>
          )}
        </div>

        {/* Bulk Selection Toolbar */}
        {selectedRecordIds.size > 0 && (
          <div className="bulk-toolbar" style={{ border: '1.5px solid rgba(143,63,102,0.3)', background: 'linear-gradient(135deg, rgba(143,63,102,0.08), rgba(143,63,102,0.02))' }}>
            <span className="bulk-toolbar-label">
              <strong>{selectedRecordIds.size}</strong> daily {selectedRecordIds.size === 1 ? 'response' : 'responses'} selected
            </span>
            <div className="bulk-toolbar-actions">
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 38 }}
                onClick={() => setSelectedRecordIds(new Set())}
              >
                Deselect All
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 38 }}
                onClick={toggleSelectAllRecords}
              >
                {selectedRecordIds.size === records.length ? 'Deselect Page' : `Select All Visible (${records.length})`}
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  fontSize: '0.82rem',
                  padding: '6px 14px',
                  background: 'var(--danger)',
                  borderColor: 'var(--danger)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 38,
                }}
                onClick={() => setDeleteTarget('BULK')}
              >
                <Trash2 size={14} /> Delete Selected ({selectedRecordIds.size})
              </button>
            </div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="desktop-table">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 48, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                      <input
                        ref={selectAllDesktopRef}
                        type="checkbox"
                        style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                        checked={records.length > 0 && selectedRecordIds.size === records.length}
                        onChange={toggleSelectAllRecords}
                        title="Select all on this page"
                      />
                    </div>
                  </th>
                  <th>Mentee</th>
                  <th>Date</th>
                  <th>Study Time</th>
                  <th>Quran Recitation</th>
                  <th>Reading</th>
                  <th>Day Rating</th>
                  <th>Notes & Reflection</th>
                  <th style={{ textAlign: 'right', width: 90 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recordsLoading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)' }}>
                      Loading performance records…
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)' }}>
                      {searchQuery || selectedMentor || selectedMentee || fromDate || toDate
                        ? 'No daily performance responses match your filters.'
                        : 'No daily performance responses logged yet.'}
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const recId = String(r._id || r.id);
                    const isSelected = selectedRecordIds.has(recId);
                    const menteeName = r.mentee?.name || r.menteeName || 'Unknown Mentee';
                    const makId = r.mentee?.makId;
                    const standard = r.mentee?.standard;
                    return (
                      <tr key={recId} style={{ background: isSelected ? 'rgba(143,63,102,0.04)' : undefined }}>
                        <td style={{ textAlign: 'center', padding: '6px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                            <input
                              type="checkbox"
                              style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                              checked={isSelected}
                              onChange={() => toggleSelectRecord(recId)}
                              title="Select response"
                            />
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--text)' }}>{menteeName}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
                            {makId && <span>{makId}</span>}
                            {standard && <span>• {standard}</span>}
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {new Date(r.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                          {formatDuration(r.studyMinutes)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.quran?.ruku ?? 0} Ruku • {r.quran?.pages ?? 0} pgs
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {formatDuration(r.readingMinutes)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '1.25rem', marginRight: 6 }}>
                            {MOOD_MAP[r.dayRating]?.emoji ?? '—'}
                          </span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{r.dayRating}/5</span>
                        </td>
                        <td style={{ fontSize: '0.85rem', maxWidth: 220, overflowWrap: 'break-word', wordBreak: 'normal' }}>
                          {r.dailyReflection ? (
                            <span>{r.dailyReflection}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                          {r.facedDifficulty && (
                            <div style={{ color: '#e65100', fontSize: '0.78rem', marginTop: 3 }}>
                              ⚠️ {r.difficultyNote || 'Difficulty reported'}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{
                              fontSize: '0.78rem',
                              padding: '5px 10px',
                              color: 'var(--danger)',
                              borderColor: 'rgba(199,92,92,0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              minHeight: 36,
                            }}
                            onClick={() => setDeleteTarget(r)}
                            title="Delete this daily response"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card List View (<640px) */}
        <div className="mobile-card-list">
          {recordsLoading ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
              Loading performance records…
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
              {searchQuery || selectedMentor || selectedMentee || fromDate || toDate
                ? 'No daily performance responses match your filters.'
                : 'No daily performance responses logged yet.'}
            </div>
          ) : (
            records.map((r) => {
              const recId = String(r._id || r.id);
              const isSelected = selectedRecordIds.has(recId);
              const menteeName = r.mentee?.name || r.menteeName || 'Unknown Mentee';
              const makId = r.mentee?.makId;
              const standard = r.mentee?.standard;
              return (
                <div
                  key={recId}
                  className="mobile-card"
                  style={{
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: isSelected ? 'rgba(143,63,102,0.03)' : 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                        <input
                          type="checkbox"
                          style={{ width: 22, height: 22, accentColor: 'var(--primary)', cursor: 'pointer' }}
                          checked={isSelected}
                          onChange={() => toggleSelectRecord(recId)}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800 }}>{menteeName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {makId ? `${makId} • ` : ''}{standard || 'Daily Performance'}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.4rem' }}>
                      {MOOD_MAP[r.dayRating]?.emoji ?? '—'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <CalendarCheck size={14} color="var(--primary)" />
                    <strong>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '10px 12px', background: 'var(--surface-muted)', borderRadius: 10, fontSize: '0.85rem' }}>
                    <div><strong>Study:</strong> <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{formatDuration(r.studyMinutes)}</span></div>
                    <div><strong>Reading:</strong> {formatDuration(r.readingMinutes)}</div>
                    <div><strong>Quran:</strong> {r.quran?.ruku ?? 0} Ruku, {r.quran?.pages ?? 0} pgs</div>
                    <div><strong>Rating:</strong> {r.dayRating}/5</div>
                  </div>

                  {r.dailyReflection && (
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      "{r.dailyReflection}"
                    </div>
                  )}
                  {r.facedDifficulty && (
                    <div style={{ color: '#e65100', fontSize: '0.8rem', background: 'rgba(230,81,0,0.08)', padding: '6px 10px', borderRadius: 8 }}>
                      ⚠️ {r.difficultyNote || 'Difficulty reported'}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{
                        fontSize: '0.82rem',
                        padding: '8px 14px',
                        color: 'var(--danger)',
                        borderColor: 'rgba(199,92,92,0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 44,
                      }}
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Trash2 size={15} /> Delete Entry
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Bar */}
        {recordsTotalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 4px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {recordsPage} of {recordsTotalPages} ({recordsTotal} total responses)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={recordsPage <= 1 || recordsLoading}
                onClick={() => loadRecords(recordsPage - 1)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 38, fontSize: '0.82rem' }}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={recordsPage >= recordsTotalPages || recordsLoading}
                onClick={() => loadRecords(recordsPage + 1)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 38, fontSize: '0.82rem' }}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) setDeleteTarget(null);
            }}
          >
            <div
              className="summary-card"
              style={{
                maxWidth: 440,
                width: '100%',
                padding: '24px 24px',
                borderRadius: 18,
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                textAlign: 'center',
                background: 'var(--surface)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(199,92,92,0.12)',
                  color: 'var(--danger)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Trash2 size={26} />
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
                {deleteTarget === 'BULK'
                  ? `Delete ${selectedRecordIds.size} daily performance ${selectedRecordIds.size === 1 ? 'entry' : 'entries'}?`
                  : 'Delete this daily performance entry?'}
              </h3>

              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
                {deleteTarget === 'BULK' ? (
                  <>
                    This will permanently remove <strong>{selectedRecordIds.size}</strong> selected daily performance responses.
                    This action cannot be undone.
                  </>
                ) : (
                  <>
                    Mentee: <strong>{deleteTarget.mentee?.name || deleteTarget.menteeName || 'Mentee'}</strong>
                    <br />
                    Date: <strong>{new Date(deleteTarget.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                    <br />
                    Study: {formatDuration(deleteTarget.studyMinutes)} • Rating: {deleteTarget.dayRating}/5
                    <br />
                    This will permanently remove this response. This action cannot be undone.
                  </>
                )}
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ minWidth: 100, minHeight: 44 }}
                  disabled={isDeleting}
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    minWidth: 130,
                    minHeight: 44,
                    background: 'var(--danger)',
                    borderColor: 'var(--danger)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                  disabled={isDeleting}
                  onClick={executeDeleteRecords}
                >
                  {isDeleting ? 'Deleting…' : deleteTarget === 'BULK' ? `Delete ${selectedRecordIds.size} Records` : 'Delete Entry'}
                </button>
              </div>
            </div>
          </div>
        )}
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
