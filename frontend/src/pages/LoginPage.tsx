import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Brain,
  AlertCircle,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { loginWithEmail } from '../lib/api';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const sessionExpired = Boolean(
    (location.state as { sessionExpired?: boolean } | null)?.sessionExpired,
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Prevent duplicate in-flight submissions
    if (isSubmitting) {
      return;
    }

    const trimmedIdentifier = email.trim();
    if (!trimmedIdentifier) {
      setError('Please enter your email, phone number, or MAKID.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await loginWithEmail(trimmedIdentifier, password);
      localStorage.setItem('anfaal-token', response.token);
      localStorage.setItem('anfaal-user', JSON.stringify(response.user));

      if (response.user.role === 'ADMIN') {
        navigate('/admin');
      } else if (response.user.role === 'MENTEE') {
        navigate('/mentee');
      } else if (response.user.mentorApprovalStatus === 'PENDING') {
        navigate('/mentor/pending');
      } else if (response.user.mentorApprovalStatus === 'REJECTED') {
        navigate('/mentor/rejected');
      } else {
        navigate('/mentor');
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to sign in. Please verify your credentials.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="anfaal-login-viewport">
      {/* Ambient background glows */}
      <div className="anfaal-login-ambient-1" aria-hidden="true" />
      <div className="anfaal-login-ambient-2" aria-hidden="true" />

      {/* Main 2-column Card */}
      <div className="anfaal-login-card">
        {/* Left Column: Branded Showcase */}
        <aside className="anfaal-login-showcase">
          <div className="anfaal-showcase-pattern" aria-hidden="true" />
          <div className="anfaal-showcase-glow" aria-hidden="true" />

          <div className="anfaal-showcase-content">
            <div className="anfaal-brand-header">
              <div className="anfaal-logo-emblem" aria-hidden="true">
                A
              </div>
              <div>
                <div className="anfaal-brand-name">Anfaal</div>
                <span className="anfaal-brand-tag">Smart Mentorship</span>
              </div>
            </div>

            <h1 className="anfaal-showcase-headline">
              Your Journey.{' '}
              <span className="anfaal-headline-highlight">Your Growth.</span>
              <br />
              Your Future.
            </h1>

            <p className="anfaal-showcase-subtext">
              Personalized mentorship, daily progress tracking, and AI-powered
              insights — empowering learners and mentors in one unified ecosystem.
            </p>

            <div className="anfaal-showcase-pillars">
              <div className="anfaal-pillar-item">
                <div className="anfaal-pillar-icon" aria-hidden="true">
                  <Sparkles size={18} />
                </div>
                <div className="anfaal-pillar-text">
                  <h4>Personalized Mentorship</h4>
                  <p>1-on-1 guidance, goal alignment & tailored growth plans</p>
                </div>
              </div>

              <div className="anfaal-pillar-item">
                <div className="anfaal-pillar-icon" aria-hidden="true">
                  <TrendingUp size={18} />
                </div>
                <div className="anfaal-pillar-text">
                  <h4>Daily Progress Tracking</h4>
                  <p>Consistency habits, study time & performance streaks</p>
                </div>
              </div>

              <div className="anfaal-pillar-item">
                <div className="anfaal-pillar-icon" aria-hidden="true">
                  <Brain size={18} />
                </div>
                <div className="anfaal-pillar-text">
                  <h4>AI Call Intelligence</h4>
                  <p>Automated transcription, action items & profile updates</p>
                </div>
              </div>
            </div>
          </div>

          <div className="anfaal-showcase-footer">
            <div className="anfaal-live-indicator">
              <span className="anfaal-pulse-dot" aria-hidden="true" />
              <span>Mentorship ecosystem active</span>
            </div>
            <span>v2.0</span>
          </div>
        </aside>

        {/* Right Column: Clean Login Form */}
        <main className="anfaal-login-form-pane">
          <div>
            <div className="anfaal-form-header">
              <div className="anfaal-form-eyebrow">
                <Sparkles size={12} />
                <span>Account Access</span>
              </div>
              <h2 className="anfaal-form-title">Welcome Back</h2>
              <p className="anfaal-form-subtitle">
                Sign in to continue your mentorship journey.
              </p>
            </div>

            {sessionExpired && !error && (
              <div className="anfaal-session-banner" role="status">
                <Clock size={18} style={{ flexShrink: 0 }} />
                <span>Your session expired. Please sign in again.</span>
              </div>
            )}

            {error && (
              <div className="anfaal-error-banner" role="alert">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <form
              className="anfaal-form-body"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="anfaal-field-group">
                <label
                  htmlFor="login-identifier"
                  className="anfaal-field-label"
                >
                  Email, Phone Number, or MAKID
                </label>
                <div className="anfaal-input-wrapper">
                  <User
                    size={18}
                    className="anfaal-input-icon"
                    aria-hidden="true"
                  />
                  <input
                    id="login-identifier"
                    name="identifier"
                    className="anfaal-input-control"
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="e.g. MAK101, 9876543210, or email"
                    value={email}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                  />
                </div>
              </div>

              <div className="anfaal-field-group">
                <div className="anfaal-field-label-row">
                  <label
                    htmlFor="login-password"
                    className="anfaal-field-label"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    className="anfaal-forgot-btn"
                    onClick={() => setShowForgotModal(true)}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="anfaal-input-wrapper">
                  <Lock
                    size={18}
                    className="anfaal-input-icon"
                    aria-hidden="true"
                  />
                  <input
                    id="login-password"
                    name="password"
                    className="anfaal-input-control anfaal-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError('');
                    }}
                  />
                  <button
                    type="button"
                    className="anfaal-password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="anfaal-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="anfaal-spinner" aria-hidden="true" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="anfaal-role-guidance">
                <div className="anfaal-role-pills">
                  <span>💡</span>
                  <span><strong>Mentors:</strong> Phone Number</span>
                  <span>·</span>
                  <span><strong>Mentees:</strong> MAKID</span>
                  <span>·</span>
                  <span><strong>Admins:</strong> Email</span>
                </div>
              </div>

              <div className="anfaal-secondary-action">
                <div className="anfaal-register-prompt">
                  Interested in joining as a mentor?
                </div>
                <button
                  type="button"
                  className="anfaal-register-link-btn"
                  onClick={() => navigate('/mentor/register')}
                >
                  Apply to become a mentor
                </button>
              </div>
            </form>
          </div>

          <footer className="anfaal-form-footer">
            <div>© 2026 Anfaal Smart Mentorship Platform. All rights reserved.</div>
          </footer>
        </main>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          className="anfaal-modal-backdrop"
          onClick={() => setShowForgotModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
        >
          <div
            className="anfaal-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="anfaal-modal-header">
              <div className="anfaal-modal-icon">
                <HelpCircle size={22} />
              </div>
              <h3 id="forgot-modal-title" className="anfaal-modal-title">
                Password Reset Assistance
              </h3>
            </div>
            <p className="anfaal-modal-body">
              For security, user passwords in Anfaal are centrally managed.
              <br /><br />
              If you have forgotten your password or are locked out:
              <br />
              • <strong>Mentors & Mentees:</strong> Contact your program coordinator or administrator.
              <br />
              • <strong>Admins:</strong> Contact the platform technical support team.
            </p>
            <div className="anfaal-modal-footer">
              <button
                type="button"
                className="anfaal-modal-btn"
                onClick={() => setShowForgotModal(false)}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
