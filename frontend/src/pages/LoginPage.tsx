import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithEmail } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@anfaalfoundation.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await loginWithEmail(email, password);
      localStorage.setItem('anfaal-token', response.token);
      localStorage.setItem('anfaal-user', JSON.stringify(response.user));
      navigate(response.user.role === 'ADMIN' ? '/admin' : '/mentor');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, #f4f1f2 0%, #efe7ea 100%)',
        padding: '32px 20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          background: '#f8f6f6',
          border: '1px solid #e2d9dc',
          borderRadius: 28,
          overflow: 'hidden',
          boxShadow: '0 28px 60px rgba(95, 70, 81, 0.08)',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(143,63,102,0.12), rgba(111,42,77,0.02))',
            padding: '42px 36px',
            borderRight: '1px solid #e2d9dc',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div className="brand-mark" style={{ width: 42, height: 42, fontSize: '1.1rem' }}>A</div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.05em' }}>Anfaal</div>
              <div className="muted" style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Mentorship Platform</div>
            </div>
          </div>

          <div style={{ fontWeight: 800, letterSpacing: '-0.08em', fontSize: '2.6rem', lineHeight: 1.1, color: '#2f2b2f', maxWidth: 420 }}>
            Mentor care, aligned to each learner’s journey.
          </div>

          <p className="muted" style={{ marginTop: 18, maxWidth: 420, fontSize: '1.03rem', lineHeight: 1.6 }}>
            Coordinate mentorship operations, review call records, and support learner progress in a single foundation-ready workspace.
          </p>

          <div style={{ display: 'grid', gap: 10, marginTop: 28, maxWidth: 420 }}>
            {['Mentor workflows', 'Call review & AI summaries', 'Learner support tracking'].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#413d40', fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8f3f66', display: 'inline-block' }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        <form className="form-card" onSubmit={handleSubmit} style={{ border: 'none', background: 'transparent', boxShadow: 'none', borderRadius: 0, padding: '42px 34px' }}>
          <div style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Sign in</div>
            <div style={{ fontWeight: 800, letterSpacing: '-0.06em', fontSize: '2.2rem', color: '#2f2b2f' }}>Welcome back</div>
          </div>

          <p className="muted" style={{ marginBottom: 28, fontSize: '1rem', lineHeight: 1.5 }}>
            Access your mentorship dashboard and operational tools.
          </p>

          <div style={{ display: 'grid', gap: 18 }}>
            <div className="field">
              <label style={{ fontSize: '0.95rem', fontWeight: 700 }}>Email</label>
              <input
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={{ height: 58, fontSize: '1rem', background: '#f5f3f3', borderColor: '#d8d0d3' }}
              />
            </div>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 700 }}>Password</label>
                <a href="/forgot-password" style={{ color: '#8f3f66', fontWeight: 700, textDecoration: 'none' }}>Forgot password?</a>
              </div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={{ height: 58, fontSize: '1rem', background: '#f5f3f3', borderColor: '#d8d0d3' }}
              />
            </div>

            {error ? (
              <div style={{ color: '#b64343', fontWeight: 600, fontSize: '0.92rem' }}>{error}</div>
            ) : null}

            <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
              <button type="submit" className="button btn-primary" disabled={isSubmitting} style={{ textAlign: 'center', height: 58, fontSize: '1rem', borderRadius: 16 }}>
                {isSubmitting ? 'Signing in...' : 'Login'}
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.86rem', color: '#6a6568', background: 'rgba(143,63,102,0.06)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(143,63,102,0.12)' }}>
              🔒 <strong>Mentor Accounts:</strong> Account creation is managed strictly by Anfaal Administrators. Please contact your administrator for access.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
