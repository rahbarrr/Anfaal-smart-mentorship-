import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Save } from 'lucide-react';
import { getAttendance, getMentees, getMyMentees, saveAttendance } from '../lib/api';
import { getLocalDateInputValue } from '../lib/dateTime';

type Mentee = { id: string; _id?: string; name: string };
type AttendanceRecord = { id: string; menteeId: string; date: string; status: 'PRESENT' | 'ABSENT'; source: string; notes?: string };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function AttendancePage() {
  const token = localStorage.getItem('anfaal-token') ?? '';
  const userRole = (() => { try { return (JSON.parse(localStorage.getItem('anfaal-user') ?? '{}') as { role?: string }).role; } catch { return undefined; } })();
  const [month, setMonth] = useState(currentMonth());
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [menteeId, setMenteeId] = useState('');
  const [date, setDate] = useState(getLocalDateInputValue());
  const [status, setStatus] = useState<'PRESENT' | 'ABSENT'>('PRESENT');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void Promise.all([
      (userRole === 'ADMIN' ? getMentees(token) : getMyMentees(token)).then((result) => setMentees(result.mentees ?? result ?? [])),
      getAttendance(token, { month }).then((result) => setRecords(result.records ?? [])),
    ]).catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load attendance.'));
  }, [month, token, userRole]);

  const selectedStats = useMemo(() => {
    const selected = menteeId ? records.filter((record) => record.menteeId === menteeId) : records;
    const present = selected.filter((record) => record.status === 'PRESENT').length;
    const absent = selected.filter((record) => record.status === 'ABSENT').length;
    return { present, absent, total: present + absent, percentage: present + absent ? Math.round((present / (present + absent)) * 100) : 0 };
  }, [menteeId, records]);

  const submit = async () => {
    if (!menteeId) { setMessage('Select a mentee first.'); return; }
    try {
      await saveAttendance(token, { menteeId, date, status, source: 'MANUAL' });
      setMessage('Attendance saved.');
      const result = await getAttendance(token, { month });
      setRecords(result.records ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save attendance.');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1000 }}>
      <div><div className="eyebrow">Mentorship operations</div><h1 style={{ margin: '4px 0' }}>Monthly attendance</h1><p className="muted">Track attendance from calls and correct exceptions manually.</p></div>
      {message && <div className={`alert-banner ${message.toLowerCase().includes('unable') || message.toLowerCase().includes('select') ? 'alert-error' : 'alert-success'}`}>{message}</div>}
      <div className="summary-card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 180 }}>Month<input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label className="field" style={{ flex: 2, minWidth: 220 }}>Mentee<select className="input" value={menteeId} onChange={(event) => setMenteeId(event.target.value)}><option value="">All mentees</option>{mentees.map((mentee) => <option key={mentee.id || mentee._id} value={mentee.id || mentee._id}>{mentee.name}</option>)}</select></label>
        </div>
        <div className="card-grid">
          <div className="dashboard-card"><div className="label">Present</div><div className="value">{selectedStats.present}</div></div>
          <div className="dashboard-card"><div className="label">Absent</div><div className="value">{selectedStats.absent}</div></div>
          <div className="dashboard-card"><div className="label">Attendance rate</div><div className="value">{selectedStats.percentage}%</div></div>
        </div>
      </div>
      <div className="summary-card" style={{ display: 'grid', gap: 12 }}>
        <h3><CalendarCheck size={17} /> Add or correct attendance</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field" style={{ flex: 1, minWidth: 190 }}>Date<input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>Status<select className="input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option></select></label>
          <button className="btn-primary" onClick={() => void submit()}><Save size={16} /> Save</button>
        </div>
      </div>
      <div className="summary-card" style={{ overflowX: 'auto' }}>
        <table className="data-table"><thead><tr><th>Date</th><th>Mentee</th><th>Status</th><th>Source</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{record.date}</td><td>{mentees.find((mentee) => (mentee.id || mentee._id) === record.menteeId)?.name || record.menteeId}</td><td>{record.status}</td><td>{record.source}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
