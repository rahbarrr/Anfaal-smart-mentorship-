import { useEffect, useState } from 'react';
import { getMentors, createMentor, updateMentorStatus, deleteMentor } from '../lib/api';
import { X, Trash2, Eye, EyeOff } from 'lucide-react';

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

  // selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // password visibility
  const [showPassword, setShowPassword] = useState(false);

  // modals
  const [selectedMentor, setSelectedMentor] = useState<MentorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MentorRow | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = () => {
    if (!token) { setIsLoading(false); return; }
    getMentors(token)
      .then((res) => { setMentors(res.mentors ?? []); setSelected(new Set()); })
      .catch(() => setMentors([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, [token]);

  // ── selection helpers ──────────────────────────────────────────────────────
  const allChecked = mentors.length > 0 && selected.size === mentors.length;
  const someChecked = selected.size > 0 && !allChecked;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(mentors.map((m) => m.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── single actions ─────────────────────────────────────────────────────────
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMentor(token, deleteTarget.id);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete mentor.');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // ── bulk delete ────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all([...selected].map((id) => deleteMentor(token, id)));
      setShowBulkDeleteConfirm(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete selected mentors.');
      setShowBulkDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="form-card">
      <div className="page-header">
        <div>
          <div className="label">Mentors</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentor management</h3>
          <p className="page-subtitle">{mentors.length} registered mentor{mentors.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowModal(true); setError(''); }}>+ Add Mentor</button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(201,87,87,0.08)', borderRadius: 10, color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {/* ── Bulk action toolbar ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
          padding: '10px 16px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
          border: '1.5px solid rgba(99,102,241,0.25)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)' }}>
            {selected.size} mentor{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            className="btn-secondary"
            style={{ fontSize: '0.82rem', padding: '5px 14px', marginLeft: 'auto' }}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
          <button
            className="btn-primary"
            style={{ fontSize: '0.82rem', padding: '5px 14px', background: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            <Trash2 size={14} /> Delete Selected
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {/* Select-all checkbox */}
              <th style={{ width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
                  title="Select all"
                />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Assigned Mentees</th>
              <th>Calls This Month</th>
              <th>Last Activity</th>
              <th>Status</th>
              <th style={{ whiteSpace: 'nowrap', minWidth: 200 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mentors.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                  {isLoading ? 'Loading mentors…' : (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>No mentors registered yet</div>
                      <div style={{ fontSize: '0.88rem' }}>Add your first mentor to get started.</div>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              mentors.map((mentor) => {
                const isChecked = selected.has(mentor.id);
                return (
                  <tr
                    key={mentor.id}
                    style={{ background: isChecked ? 'rgba(99,102,241,0.06)' : undefined, transition: 'background 0.15s' }}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(mentor.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                    </td>
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => setSelectedMentor(mentor)}>View</button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap', color: mentor.status === 'active' ? 'var(--danger)' : 'var(--success)' }}
                          onClick={() => handleToggleStatus(mentor.id, mentor.status)}
                        >
                          {mentor.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 3 }}
                          onClick={() => setDeleteTarget(mentor)}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add Mentor Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setShowModal(false)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
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
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: 0,
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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

      {/* ── View Detail Modal ────────────────────────────────────────────────── */}
      {selectedMentor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setSelectedMentor(null)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, padding: 28, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
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

      {/* ── Single Delete Confirm ────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setDeleteTarget(null)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 420, position: 'relative', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 10 }}>Delete Mentor?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '0.92rem' }}>
              You are about to permanently delete <strong>{deleteTarget.name}</strong>.
            </p>
            <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 24 }}>
              This will also delete all their call records and mentorship assignments. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Confirm ──────────────────────────────────────────────── */}
      {showBulkDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 440, position: 'relative', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 10 }}>Delete {selected.size} Mentor{selected.size !== 1 ? 's' : ''}?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '0.92rem' }}>
              You are about to permanently delete <strong>{selected.size}</strong> selected mentor{selected.size !== 1 ? 's' : ''}.
            </p>
            <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 24 }}>
              All their call records and mentorship assignments will also be removed. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</button>
              <button className="btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleBulkDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : `Yes, Delete ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
