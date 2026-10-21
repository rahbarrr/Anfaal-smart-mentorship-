'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, Check, Megaphone, Pin, Plus } from 'lucide-react';
import { createAnnouncement, getAnnouncements, markAnnouncementRead, getToken } from '@/lib/api';

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  priority?: string;
  pinned?: boolean;
  read?: boolean;
  publishedAt?: { _seconds?: number } | string;
};

export function AnnouncementsView() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'EVERYONE' | 'MENTORS' | 'MENTEES'>('EVERYONE');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('anfaal-user');
      if (stored) {
        const user = JSON.parse(stored) as { role?: string };
        setIsAdmin(user.role === 'ADMIN');
      }
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(() => {
    const token = getToken();
    setLoading(true);
    return getAnnouncements(token)
      .then((result) => setItems(result.announcements ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load announcements.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const token = getToken();
      await createAnnouncement(token, { title, body, audience, priority: 'NORMAL' });
      setTitle('');
      setBody('');
      setShowComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish announcement.');
    }
  };

  const markRead = async (item: Announcement) => {
    if (item.read) return;
    const token = getToken();
    await markAnnouncementRead(token, item.id);
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
    );
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 900 }}>
      <div
        className="page-heading"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}
      >
        <div>
          <div className="eyebrow">Updates</div>
          <h1 style={{ margin: '4px 0 0' }}>Announcements</h1>
          <p className="muted">Important notices for the Anfaal mentorship community.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowComposer((value) => !value)}>
            <Plus size={16} /> New announcement
          </button>
        )}
      </div>
      {error && <div className="alert-banner alert-error">{error}</div>}
      {isAdmin && showComposer && (
        <form className="summary-card" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <h3>
            <Megaphone size={17} /> Publish announcement
          </h3>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            required
          />
          <textarea
            className="field-textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the announcement…"
            rows={5}
            required
          />
          <select
            className="input"
            value={audience}
            onChange={(event) => setAudience(event.target.value as typeof audience)}
          >
            <option value="EVERYONE">Everyone</option>
            <option value="MENTORS">Mentors only</option>
            <option value="MENTEES">Mentees only</option>
          </select>
          <button className="btn-primary" type="submit">
            Publish
          </button>
        </form>
      )}
      {loading ? (
        <div className="empty-state">
          <Bell size={34} />
          <p>Loading announcements…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Bell size={34} />
          <h3>No announcements</h3>
          <p>New notices will appear here.</p>
        </div>
      ) : (
        items.map((item) => (
          <article
            key={item.id}
            className="summary-card"
            style={{
              borderLeft: `4px solid ${item.read ? 'var(--border)' : 'var(--primary)'}`,
              cursor: item.read ? 'default' : 'pointer',
            }}
            onClick={() => void markRead(item)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                {item.pinned && <Pin size={14} />}
              </div>
              {!item.read && (
                <span className="status-badge status-pending">
                  <Bell size={12} /> Unread
                </span>
              )}
              {item.read && <Check size={16} color="var(--success)" />}
            </div>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.body}</p>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Audience: {item.audience.toLowerCase()}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
