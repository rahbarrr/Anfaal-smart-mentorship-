'use client';

import { useEffect, useState } from 'react';
import { getMyMentees, apiFetch, getToken } from '@/lib/api';
import { getLocalDateInputValue } from '@/lib/dateTime';

export function ManualCallSummaryView() {
  const [mentees, setMentees] = useState<Array<{ id: string; name: string }>>([]);
  const [menteeId, setMenteeId] = useState('');
  const [callType, setCallType] = useState<'WHATSAPP_CALL' | 'WHATSAPP_CHAT'>('WHATSAPP_CALL');
  const [date, setDate] = useState(getLocalDateInputValue());
  const [summary, setSummary] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    setLoading(true);
    getMyMentees(token)
      .then((result) => setMentees(result.mentees ?? []))
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : 'Unable to load assigned mentees.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      await apiFetch('/calls/manual-summary', {
        method: 'POST',
        body: JSON.stringify({ menteeId, callType, date, summary }),
      });
      setMessage('WhatsApp update saved and attendance marked present.');
      setSummary('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save update.');
    } finally {
      setSaving(false);
    }
  };

  const isError = /unable|failed|required/i.test(message);

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Manual session record</div>
          <h2 className="page-title">Add call summary</h2>
          <p className="page-subtitle">Record a WhatsApp call or chat when no audio recording is available.</p>
        </div>
      </div>
      {message && (
        <div className={`alert-banner ${isError ? 'alert-error' : 'alert-success'}`} role="status">
          {message}
        </div>
      )}
      <form className="summary-card" onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        <label className="field">
          Mentee
          <select
            className="input"
            required
            disabled={loading || saving}
            value={menteeId}
            onChange={(e) => setMenteeId(e.target.value)}
          >
            <option value="">{loading ? 'Loading mentees…' : 'Select mentee'}</option>
            {mentees.map((mentee) => (
              <option key={mentee.id} value={mentee.id}>
                {mentee.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Type
          <select
            className="input"
            disabled={saving}
            value={callType}
            onChange={(e) => setCallType(e.target.value as typeof callType)}
          >
            <option value="WHATSAPP_CALL">WhatsApp call</option>
            <option value="WHATSAPP_CHAT">WhatsApp chat</option>
          </select>
        </label>
        <label className="field">
          Date
          <input
            className="input"
            disabled={saving}
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          Manual summary
          <textarea
            className="input"
            disabled={saving}
            required
            minLength={10}
            rows={7}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What was discussed, agreed, or assigned?"
          />
        </label>
        <button
          className="btn-primary"
          disabled={loading || saving || !mentees.length}
          type="submit"
        >
          {saving ? 'Saving…' : 'Save session record'}
        </button>
      </form>
    </div>
  );
}
