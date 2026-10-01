import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export function MentorRejectedPage() {
  const navigate = useNavigate();

  const handleSignOut = () => {
    localStorage.removeItem('anfaal-token');
    localStorage.removeItem('anfaal-user');
    navigate('/', { replace: true });
  };

  return (
    <div className="login-page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px', background: 'linear-gradient(135deg, #f4f1f2 0%, #efe7ea 100%)' }}>
      <div className="form-card" style={{ width: '100%', maxWidth: 560, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(198, 76, 76, 0.10)', display: 'grid', placeItems: 'center', color: 'var(--danger)' }}>
            <ShieldAlert size={30} />
          </div>
        </div>
        <div className="eyebrow" style={{ textAlign: 'center' }}>Mentor application</div>
        <h2 style={{ textAlign: 'center', marginTop: 8, marginBottom: 12, letterSpacing: '-0.06em' }}>Application rejected</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.7, marginBottom: 24 }}>
          Your mentor application was not approved. Your account remains available for review, but mentor dashboard access is restricted.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn-primary" onClick={handleSignOut}>Back to login</button>
        </div>
      </div>
    </div>
  );
}
