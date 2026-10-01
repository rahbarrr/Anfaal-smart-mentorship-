import { useNavigate } from 'react-router-dom';
import { Clock3 } from 'lucide-react';

export function MentorPendingApprovalPage() {
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
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(143,63,102,0.10)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>
            <Clock3 size={30} />
          </div>
        </div>
        <div className="eyebrow" style={{ textAlign: 'center' }}>Mentor application</div>
        <h2 style={{ textAlign: 'center', marginTop: 8, marginBottom: 12, letterSpacing: '-0.06em' }}>Pending approval</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.7, marginBottom: 24 }}>
          Your account has been created successfully. Your mentor application is pending admin approval.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn-primary" onClick={handleSignOut}>Back to login</button>
        </div>
      </div>
    </div>
  );
}
