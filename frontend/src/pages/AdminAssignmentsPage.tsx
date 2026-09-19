import { useEffect, useMemo, useState } from 'react';
import { createAssignment, deleteAssignment, getAssignments, getMentees, getMentors, updateAssignmentStatus } from '../lib/api';

type AssignmentRow = {
  id: string;
  mentorId: string;
  mentorName: string;
  mentorEmail: string;
  menteeId: string;
  menteeName: string;
  menteeStandard: string;
  status: 'active' | 'archived';
  assignedAt: string;
};

export function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [mentors, setMentors] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [mentees, setMentees] = useState<Array<{ id: string; name: string; standard: string }>>([]);
  const [selectedMentorId, setSelectedMentorId] = useState('');
  const [selectedMenteeId, setSelectedMenteeId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const token = useMemo(() => localStorage.getItem('anfaal-token') ?? '', []);

  const loadData = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const [assignmentResponse, mentorResponse, menteeResponse] = await Promise.all([
        getAssignments(token),
        getMentors(token),
        getMentees(token),
      ]);

      setAssignments(assignmentResponse.assignments ?? []);
      setMentors((mentorResponse.mentors ?? []).map((mentor: any) => ({
        id: mentor.id ?? '',
        name: mentor.name ?? 'Unknown mentor',
        email: mentor.email ?? 'unknown@anfaal.org',
      })));
      setMentees((menteeResponse.mentees ?? []).map((mentee: any) => ({
        id: mentee.id ?? mentee._id ?? '',
        name: mentee.name ?? 'Unknown mentee',
        standard: mentee.standard ?? '—',
      })));
    } catch {
      setAssignments([]);
      setMentors([]);
      setMentees([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleCreateAssignment = async () => {
    if (!selectedMentorId || !selectedMenteeId) {
      setError('Please choose both a mentor and a mentee.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await createAssignment(token, {
        mentorId: selectedMentorId,
        menteeId: selectedMenteeId,
        status: 'active',
      });
      setSelectedMentorId('');
      setSelectedMenteeId('');
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to create assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggle = async (assignmentId: string, currentStatus: 'active' | 'archived') => {
    if (!token) return;

    const nextStatus = currentStatus === 'active' ? 'archived' : 'active';
    try {
      await updateAssignmentStatus(token, assignmentId, nextStatus);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to update assignment status.');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string, mentorName: string, menteeName: string) => {
    if (!token) return;
    const confirmed = window.confirm(`Remove assignment between ${mentorName} and ${menteeName}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteAssignment(token, assignmentId);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to delete assignment.');
    }
  };

  return (
    <div className="form-card">
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="label">Assignments</div>
          <h3 className="page-title" style={{ fontSize: '1.8rem' }}>Mentor to mentee mapping</h3>
        </div>
      </div>

      <div className="summary-card" style={{ marginBottom: 18 }}>
        <div className="summary-header">
          <h3>Create assignment</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 18 }}>
          <div className="field">
            <label>Mentor</label>
            <select className="input" value={selectedMentorId} onChange={(event) => setSelectedMentorId(event.target.value)}>
              <option value="">Select mentor</option>
              {mentors.map((mentor) => (
                <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Mentee</label>
            <select className="input" value={selectedMenteeId} onChange={(event) => setSelectedMenteeId(event.target.value)}>
              <option value="">Select mentee</option>
              {mentees.map((mentee) => (
                <option key={mentee.id} value={mentee.id}>{mentee.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn-primary" disabled={isSubmitting} onClick={handleCreateAssignment}>
              {isSubmitting ? 'Saving...' : 'Assign mentor'}
            </button>
          </div>
        </div>

        {error ? <div style={{ marginTop: 12, color: '#b64343', fontWeight: 600 }}>{error}</div> : null}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mentor</th>
              <th>Mentee</th>
              <th>Standard</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {isLoading ? 'Loading assignments...' : 'No mentor assignments found.'}
                </td>
              </tr>
            ) : (
              assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.mentorName}</td>
                  <td>{assignment.menteeName}</td>
                  <td>{assignment.menteeStandard}</td>
                  <td>
                    <span className={`status-badge ${assignment.status === 'active' ? 'status-completed' : 'status-failed'}`}>
                      {assignment.status}
                    </span>
                  </td>
                  <td>{new Date(assignment.assignedAt).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" onClick={() => handleStatusToggle(assignment.id, assignment.status)}>
                      {assignment.status === 'active' ? 'Archive' : 'Activate'}
                    </button>
                    <button className="btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteAssignment(assignment.id, assignment.mentorName, assignment.menteeName)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
