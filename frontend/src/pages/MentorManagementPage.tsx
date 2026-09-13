import { useEffect, useState } from 'react';
import { getMentors, createMentor, updateMentorStatus } from '../lib/api';
import { X } from 'lucide-react';

type MentorRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'disabled';
  assignedMentees: number;
  callsThisMonth: number;
  lastActivity: string;
};

export function MentorManagementPage() {
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: 'Mentor@123', phone: '' });

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = () => {
    if (!token) { setIsLoading(false); return; }
    getMentors(token)
      .then((res) => setMentors(res.mentors ?? []))
      .catch(() => setMentors([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, [token]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Please provide name and email.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await createMentor(token, form);
      setShowModal(false);
      setForm({ name: '', email: '', password: 'Mentor@123', phone: '' });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create mentor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: 'active' | 'disabled') => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      await updateMentorStatus(token, id, newStatus);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    }
  };

  const [selectedMentor, setSelectedMentor] = useState<MentorRow | null>(null);

  return (
    <div className="form-card">
      <div className="page-header">
        <div>
          <div className="label">Mentors</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentor management</h3>
          <p className="page-subtitle">{mentors.length} registered mentor{mentors.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Mentor</button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(201,87,87,0.08)', borderRadius: 10, color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Assigned Mentees</th>
              <th>Calls This Month</th>
              <th>Last Activity</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mentors.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                  {isLoading ? 'Loading mentors…' : (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>No mentors registered yet</div>
                      <div style={{ fontSize: '0.88rem' }}>Add your first mentor to get started.</div>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              mentors.map((mentor) => (
                <tr key={mentor.id}>
                  <td style={{ fontWeight: 600 }}>{mentor.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{mentor.email}</td>
                  <td>{mentor.assignedMentees ?? 0}</td>
                  <td>{mentor.callsThisMonth ?? 0}</td>
                  <td style={{ fontSize: '0.85rem' }}>{mentor.lastActivity ?? '—'}</td>
                  <td>
                    <span className={`status-badge ${mentor.status === 'active' ? 'status-completed' : 'status-failed'}`}>
                      {mentor.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => setSelectedMentor(mentor)}>View</button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '5px 10px', color: mentor.status === 'active' ? 'var(--danger)' : 'var(--success)' }}
                        onClick={() => handleToggleStatus(mentor.id, mentor.status)}
                      >
                        {mentor.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Mentor Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
            <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
            <div className="label" style={{ marginBottom: 4 }}>New Mentor</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.04em', marginBottom: 20 }}>Add a mentor</h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div className="field">
                <label>Full Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Rahul Sharma" />
              </div>
              <div className="field">
                <label>Email Address</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="e.g. rahul@anfaalfoundation.com" />
              </div>
              <div className="field">
                <label>Password</label>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="field">
                <label>Phone (optional)</label>
                <input className="input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91-9800000000" />
              </div>
              {error && <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreate} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create Mentor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* View Mentor Detail Modal */}
      {selectedMentor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, padding: 28, position: 'relative' }}>
            <button onClick={() => setSelectedMentor(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Mentor Details</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: 16 }}>{selectedMentor.name}</h3>

            <div style={{ display: 'grid', gap: 12, fontSize: '0.92rem' }}>
              <div><strong>Email:</strong> {selectedMentor.email}</div>
              <div><strong>Phone:</strong> {selectedMentor.phone || 'Not provided'}</div>
              <div><strong>Status:</strong> <span className={`status-badge ${selectedMentor.status === 'active' ? 'status-completed' : 'status-failed'}`}>{selectedMentor.status}</span></div>
              <div><strong>Assigned Mentees:</strong> {selectedMentor.assignedMentees ?? 0}</div>
              <div><strong>Calls This Month:</strong> {selectedMentor.callsThisMonth ?? 0}</div>
              <div><strong>Last Activity:</strong> {selectedMentor.lastActivity ?? '—'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-primary" onClick={() => setSelectedMentor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
