import { useEffect, useState } from 'react';
import { getMentees, createMentee, updateMentee } from '../lib/api';
import { X } from 'lucide-react';

type MenteeRow = {
  id: string;
  name: string;
  standard: string;
  guardian: string;
  phone: string;
  status: 'active' | 'inactive';
  assignedMentor: string;
  totalCalls: number;
  lastCallDate: string;
};

export function MenteeManagementPage() {
  const [mentees, setMentees] = useState<MenteeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', standard: '', phone: '', guardian: '' });
  const [selectedMentee, setSelectedMentee] = useState<MenteeRow | null>(null);

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = () => {
    if (!token) { setIsLoading(false); return; }
    getMentees(token)
      .then((res) => setMentees(res.mentees ?? []))
      .catch(() => setMentees([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, [token]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.standard.trim()) {
      setError('Please provide name and class/standard.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await createMentee(token, form);
      setShowModal(false);
      setForm({ name: '', standard: '', phone: '', guardian: '' });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create mentee.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await updateMentee(token, id, { status: newStatus });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update mentee.');
    }
  };

  const filtered = mentees.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.standard.toLowerCase().includes(q) || m.assignedMentor?.toLowerCase().includes(q);
  });

  return (
    <div className="form-card">
      <div className="page-header">
        <div>
          <div className="label">Mentees</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentee management</h3>
          <p className="page-subtitle">{mentees.length} registered student{mentees.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Mentee</button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(201,87,87,0.08)', borderRadius: 10, color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Search by name, class, or mentor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Standard</th>
              <th>Assigned Mentor</th>
              <th>Last Call</th>
              <th>Total Calls</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                  {isLoading ? 'Loading mentees…' : (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>No mentees found</div>
                      <div style={{ fontSize: '0.88rem' }}>Add your first student to get started.</div>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((mentee) => (
                <tr key={mentee.id}>
                  <td style={{ fontWeight: 600 }}>{mentee.name}</td>
                  <td>{mentee.standard}</td>
                  <td style={{ fontSize: '0.88rem' }}>{mentee.assignedMentor || 'Unassigned'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{mentee.lastCallDate || '—'}</td>
                  <td>{mentee.totalCalls ?? 0}</td>
                  <td>
                    <span className={`status-badge ${mentee.status === 'active' ? 'status-completed' : 'status-failed'}`}>
                      {mentee.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => setSelectedMentee(mentee)}>View</button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '5px 10px', color: mentee.status === 'active' ? 'var(--danger)' : 'var(--success)' }}
                        onClick={() => handleToggleStatus(mentee.id, mentee.status)}
                      >
                        {mentee.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Mentee Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
            <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
            <div className="label" style={{ marginBottom: 4 }}>New Mentee</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.04em', marginBottom: 20 }}>Add a student</h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div className="field">
                <label>Full Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Aisha Khan" />
              </div>
              <div className="field">
                <label>Class / Standard</label>
                <select className="select" value={form.standard} onChange={(e) => setForm((p) => ({ ...p, standard: e.target.value }))}>
                  <option value="">Select class…</option>
                  {['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Guardian Name</label>
                <input className="input" value={form.guardian} onChange={(e) => setForm((p) => ({ ...p, guardian: e.target.value }))} placeholder="e.g. Fatima Khan" />
              </div>
              <div className="field">
                <label>Phone (optional)</label>
                <input className="input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91-7700000000" />
              </div>
              {error && <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreate} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create Mentee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* View Mentee Detail Modal */}
      {selectedMentee && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, padding: 28, position: 'relative' }}>
            <button onClick={() => setSelectedMentee(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Mentee Details</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: 16 }}>{selectedMentee.name}</h3>

            <div style={{ display: 'grid', gap: 12, fontSize: '0.92rem' }}>
              <div><strong>Standard:</strong> {selectedMentee.standard}</div>
              <div><strong>Guardian:</strong> {selectedMentee.guardian || 'Not provided'}</div>
              <div><strong>Phone:</strong> {selectedMentee.phone || 'Not provided'}</div>
              <div><strong>Assigned Mentor:</strong> {selectedMentee.assignedMentor || 'Unassigned'}</div>
              <div><strong>Status:</strong> <span className={`status-badge ${selectedMentee.status === 'active' ? 'status-completed' : 'status-failed'}`}>{selectedMentee.status}</span></div>
              <div><strong>Total Calls:</strong> {selectedMentee.totalCalls ?? 0}</div>
              <div><strong>Last Call Date:</strong> {selectedMentee.lastCallDate || '—'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-primary" onClick={() => setSelectedMentee(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
