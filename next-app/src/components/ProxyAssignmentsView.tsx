'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Plus } from 'lucide-react';
import {
  createProxyAssignment,
  getMentors,
  getMentees,
  getProxyAssignments,
  getToken,
} from '@/lib/api';

type Person = { id: string; _id?: string; name: string };
type Assignment = {
  id: string;
  menteeId: string;
  primaryMentorId: string;
  proxyMentorId: string;
  startDate: string;
  endDate: string;
  reason?: string;
};

export function ProxyAssignmentsView() {
  const [mentees, setMentees] = useState<Person[]>([]);
  const [mentors, setMentors] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [form, setForm] = useState({
    menteeId: '',
    primaryMentorId: '',
    proxyMentorId: '',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    const token = getToken();
    return Promise.all([
      getMentees(token).then((result) => setMentees(result.mentees ?? result ?? [])),
      getMentors(token).then((result) => setMentors(result.mentors ?? result ?? [])),
      getProxyAssignments(token).then((result) => setAssignments(result.assignments ?? [])),
    ]).catch((error) =>
      setMessage(error instanceof Error ? error.message : 'Unable to load proxy assignments.'),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    try {
      const token = getToken();
      await createProxyAssignment(token, form);
      setMessage('Proxy mentor assigned.');
      setForm({
        menteeId: '',
        primaryMentorId: '',
        proxyMentorId: '',
        startDate: '',
        endDate: '',
        reason: '',
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to assign proxy mentor.');
    }
  };

  const label = (people: Person[], id: string) =>
    people.find((person) => (person.id || person._id) === id)?.name || id;

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1000 }}>
      <div>
        <div className="eyebrow">Mentorship coverage</div>
        <h1 style={{ margin: '4px 0' }}>Proxy mentors</h1>
        <p className="muted">Give a mentor temporary access without changing the permanent assignment.</p>
      </div>
      {message && <div className="alert-banner alert-success">{message}</div>}
      <div className="summary-card" style={{ display: 'grid', gap: 12 }}>
        <h3>
          <Plus size={17} /> Assign temporary coverage
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
            gap: 12,
          }}
        >
          <select
            className="input"
            value={form.menteeId}
            onChange={(event) => setForm({ ...form, menteeId: event.target.value })}
          >
            <option value="">Select mentee</option>
            {mentees.map((person) => (
              <option key={person.id || person._id} value={person.id || person._id}>
                {person.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={form.primaryMentorId}
            onChange={(event) => setForm({ ...form, primaryMentorId: event.target.value })}
          >
            <option value="">Primary mentor</option>
            {mentors.map((person) => (
              <option key={person.id || person._id} value={person.id || person._id}>
                {person.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={form.proxyMentorId}
            onChange={(event) => setForm({ ...form, proxyMentorId: event.target.value })}
          >
            <option value="">Proxy mentor</option>
            {mentors.map((person) => (
              <option key={person.id || person._id} value={person.id || person._id}>
                {person.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            value={form.startDate}
            onChange={(event) => setForm({ ...form, startDate: event.target.value })}
          />
          <input
            className="input"
            type="date"
            value={form.endDate}
            onChange={(event) => setForm({ ...form, endDate: event.target.value })}
          />
          <input
            className="input"
            placeholder="Reason"
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
          />
        </div>
        <button className="btn-primary" onClick={() => void submit()}>
          <Link2 size={16} /> Assign proxy
        </button>
      </div>
      <div className="summary-card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Mentee</th>
              <th>Primary mentor</th>
              <th>Proxy mentor</th>
              <th>Dates</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>{label(mentees, assignment.menteeId)}</td>
                <td>{label(mentors, assignment.primaryMentorId)}</td>
                <td>{label(mentors, assignment.proxyMentorId)}</td>
                <td>
                  {assignment.startDate} – {assignment.endDate}
                </td>
                <td>{assignment.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
