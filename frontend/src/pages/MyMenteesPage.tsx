import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyMentees } from '../lib/api';
import { Users, PhoneCall, BookOpen, ChevronRight, Clock } from 'lucide-react';

type Mentee = {
  id: string;
  name: string;
  standard: string;
  guardian: string;
  phone: string;
  status: 'active' | 'inactive';
  totalCalls: number;
  lastCallDate: string;
};


function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  { bg: 'rgba(143,63,102,0.12)', color: '#8f3f66' },
  { bg: 'rgba(75,123,189,0.12)', color: '#4b7bbd' },
  { bg: 'rgba(46,139,87,0.12)', color: '#2b8a5b' },
  { bg: 'rgba(207,159,75,0.12)', color: '#cf9f4b' },
];

export function MyMenteesPage() {
  const navigate = useNavigate();
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) { setIsLoading(false); return; }

    getMyMentees(token)
      .then((res) => setMentees(res.mentees ?? []))
      .catch(() => setMentees([]))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        Loading your mentees…
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">My Mentees</div>
          <h2 className="page-title">Your assigned students</h2>
          <p className="page-subtitle">{mentees.length} student{mentees.length !== 1 ? 's' : ''} assigned to you</p>
        </div>
      </div>

      <div style={{ background: 'rgba(143,63,102,0.06)', border: '1px solid rgba(143,63,102,0.14)', padding: '14px 18px', borderRadius: 14, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
        <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
        <div>
          <strong>Assignment Policy:</strong> Mentee-to-mentor assignments are managed exclusively by Anfaal Administrators. To request a new student assignment or reassignment, please contact your program administrator.
        </div>
      </div>

      {mentees.length === 0 ? (
        <div className="summary-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%', background: 'rgba(143,63,102,0.08)', placeItems: 'center', marginBottom: 16 }}>
            <Users size={28} color="var(--primary)" />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>No mentees assigned yet</h3>
          <p className="muted">Contact your admin to get mentees assigned to you.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {mentees.map((mentee, idx) => {
            const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            return (
              <div
                key={mentee.id}
                className="dashboard-card"
                style={{ cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.2s', position: 'relative' }}
                onClick={() => navigate(`/mentor/mentees/${mentee.id}`)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: color.bg, display: 'grid', placeItems: 'center', fontWeight: 800, color: color.color, fontSize: '1rem', flexShrink: 0 }}>
                    {getInitials(mentee.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{mentee.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>{mentee.standard}</div>
                  </div>
                  <span className={`status-badge ${mentee.status === 'active' ? 'status-completed' : 'status-failed'}`} style={{ fontSize: '0.68rem' }}>
                    {mentee.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    <PhoneCall size={14} />
                    <span><strong style={{ color: 'var(--text-primary)' }}>{mentee.totalCalls}</strong> total calls</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    <Clock size={14} />
                    <span>Last call: <strong style={{ color: 'var(--text-primary)' }}>{mentee.lastCallDate}</strong></span>
                  </div>
                  {mentee.guardian && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                      <BookOpen size={14} />
                      <span>Guardian: {mentee.guardian}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '8px 12px' }}>
                    View Profile <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
