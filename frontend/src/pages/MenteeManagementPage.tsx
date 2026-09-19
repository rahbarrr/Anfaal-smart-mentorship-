import { useEffect, useState } from 'react';
import { getMentees, createMentee, updateMentee, deleteMentee } from '../lib/api';
import { X, Trash2 } from 'lucide-react';

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

  // selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // modals
  const [selectedMentee, setSelectedMentee] = useState<MenteeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenteeRow | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const token = localStorage.getItem('anfaal-token') ?? '';

  const loadData = () => {
    if (!token) { setIsLoading(false); return; }
    getMentees(token)
      .then((res) => { setMentees(res.mentees ?? []); setSelected(new Set()); })
      .catch(() => setMentees([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadData(); }, [token]);

  // ── filtered list ──────────────────────────────────────────────────────────
  const filtered = mentees.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.standard.toLowerCase().includes(q) || m.assignedMentor?.toLowerCase().includes(q);
  });

  // ── selection helpers ──────────────────────────────────────────────────────
  const allChecked = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const someChecked = filtered.some((m) => selected.has(m.id)) && !allChecked;

  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((m) => next.delete(m.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((m) => next.add(m.id));
        return next;
      });
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMentee(token, deleteTarget.id);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete mentee.');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // ── bulk delete ────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all([...selected].map((id) => deleteMentee(token, id)));
      setShowBulkDeleteConfirm(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete selected mentees.');
      setShowBulkDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="form-card">
      <div className="page-header">
        <div>
          <div className="label">Mentees</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentee management</h3>
          <p className="page-subtitle">{mentees.length} registered student{mentees.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowModal(true); setError(''); }}>+ Add Mentee</button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(201,87,87,0.08)', borderRadius: 10, color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Search by name, class, or mentor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      {/* ── Bulk action toolbar ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
          padding: '10px 16px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
          border: '1.5px solid rgba(99,102,241,0.25)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)' }}>
            {selected.size} student{selected.size !== 1 ? 's' : ''} selected
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
              <th>Standard</th>
              <th>Assigned Mentor</th>
              <th>Last Call</th>
              <th>Total Calls</th>
              <th>Status</th>
              <th style={{ whiteSpace: 'nowrap', minWidth: 220 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
                  {isLoading ? 'Loading mentees…' : (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>No mentees found</div>
                      <div style={{ fontSize: '0.88rem' }}>Add your first student to get started.</div>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((mentee) => {
                const isChecked = selected.has(mentee.id);
                return (
                  <tr
                    key={mentee.id}
                    style={{ background: isChecked ? 'rgba(99,102,241,0.06)' : undefined, transition: 'background 0.15s' }}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(mentee.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                    </td>
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => setSelectedMentee(mentee)}>View</button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap', color: mentee.status === 'active' ? 'var(--danger)' : 'var(--success)' }}
                          onClick={() => handleToggleStatus(mentee.id, mentee.status)}
                        >
                          {mentee.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 3 }}
                          onClick={() => setDeleteTarget(mentee)}
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

      {/* ── Add Mentee Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setShowModal(false)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
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

      {/* ── View Mentee Detail Modal ─────────────────────────────────────────── */}
      {selectedMentee && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setSelectedMentee(null)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, padding: 28, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
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

      {/* ── Single Delete Confirm ────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setDeleteTarget(null)}>
          <div className="form-card" style={{ width: '100%', maxWidth: 420, position: 'relative', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 10 }}>Delete Mentee?</h3>
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
            <h3 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 10 }}>Delete {selected.size} Student{selected.size !== 1 ? 's' : ''}?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '0.92rem' }}>
              You are about to permanently delete <strong>{selected.size}</strong> selected student{selected.size !== 1 ? 's' : ''}.
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
