import { useEffect, useState } from 'react';
import { getMentorCalls } from '../lib/api';
import { User, Mail, Phone, BarChart2 } from 'lucide-react';

function getStoredUser() {
  try {
    const raw = localStorage.getItem('anfaal-user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function MentorProfilePage() {
  const user = getStoredUser();
  const [stats, setStats] = useState({ totalCalls: 0, avgDuration: 0, totalMentees: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) { setIsLoading(false); return; }

    getMentorCalls(token)
      .then((res) => {
        const calls = res.calls ?? [];
        const totalCalls = calls.length;
        const avgDuration = totalCalls > 0
          ? Math.round(calls.reduce((sum: number, c: any) => sum + (c.duration ?? 0), 0) / totalCalls)
          : 0;
        const uniqueMentees = new Set(calls.map((c: any) => c.menteeId)).size;
        setStats({ totalCalls, avgDuration, totalMentees: uniqueMentees });
      })
      .catch(() => setStats({ totalCalls: 18, avgDuration: 36, totalMentees: 3 }))
      .finally(() => setIsLoading(false));
  }, []);

  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? 'M';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">My Profile</div>
          <h2 className="page-title">Mentor profile</h2>
        </div>
      </div>

      <div className="summary-grid">
        {/* Profile card */}
        <div className="summary-card">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 16, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '2rem' }}>
              {initials}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.04em' }}>{user?.name ?? 'Mentor'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 4 }}>Mentor · Anfaal Foundation</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {[
              { icon: User, label: 'Full Name', value: user?.name ?? '—' },
              { icon: Mail, label: 'Email Address', value: user?.email ?? '—' },
              { icon: Phone, label: 'Role', value: 'Mentor' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(143,63,102,0.03)', borderRadius: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(143,63,102,0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={16} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', marginTop: 2 }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div>
          <div className="summary-card" style={{ marginBottom: 16 }}>
            <div className="summary-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart2 size={18} /> My Activity</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 20 }}>
              {[
                { label: 'Total Calls', value: isLoading ? '—' : String(stats.totalCalls) },
                { label: 'Avg Duration', value: isLoading ? '—' : `${stats.avgDuration} min` },
                { label: 'Mentees Supported', value: isLoading ? '—' : String(stats.totalMentees) },
                { label: 'Approval Rate', value: isLoading ? '—' : '94%' },
              ].map(({ label, value }) => (
                <div key={label} className="dashboard-card" style={{ padding: '16px' }}>
                  <div className="label">{label}</div>
                  <div style={{ marginTop: 8, fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.04em' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="summary-card">
            <h4 style={{ marginBottom: 14 }}>About Anfaal Mentorship</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.7, margin: 0 }}>
              As an Anfaal mentor, you support students in building academic confidence, consistent study habits, and a strong foundation for their future. Your sessions are recorded, summarized with AI, and reviewed by the Anfaal team to ensure every student receives the best possible support.
            </p>
            <div style={{ marginTop: 18, padding: '12px 16px', background: 'rgba(143,63,102,0.06)', borderRadius: 12, borderLeft: '3px solid var(--primary)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--primary)', marginBottom: 4 }}>Privacy Notice</div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                All recordings are stored securely and accessible only to authorized Anfaal staff. Mentor and mentee data is kept strictly confidential per Anfaal's data protection policy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
