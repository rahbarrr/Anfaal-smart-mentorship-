import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitMentorRegistration } from '../lib/api';

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  gender: string;
  bio: string;
  expertise: string;
  availability: string;
  location: string;
  preferredSubjects: string;
};

const initialForm: FormState = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  gender: '',
  bio: '',
  expertise: '',
  availability: '',
  location: '',
  preferredSubjects: '',
};

const stepTitles = ['Profile details', 'Mentorship background', 'Review & submit'];

export function MentorRegistrationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const updateField = (field: keyof FormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError('');
  };

  const stepIsValid = () => {
    if (step === 1) {
      return form.fullName.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.phone.trim().length >= 8 && form.password.trim().length >= 8;
    }

    if (step === 2) {
      return (
        form.gender.trim().length > 0 &&
        form.bio.trim().length >= 10 &&
        form.expertise.trim().length >= 3 &&
        form.availability.trim().length >= 2 &&
        form.location.trim().length >= 2
      );
    }

    return true;
  };

  const nextStep = () => {
    if (!stepIsValid()) {
      setError('Please complete all required fields before moving to the next step.');
      return;
    }

    setStep((current) => Math.min(current + 1, 3));
    setError('');
  };

  const previousStep = () => {
    setStep((current) => Math.max(current - 1, 1));
    setError('');
  };

  const handleSubmit = async () => {
    if (!stepIsValid()) {
      setError('Please review the form before submitting.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await submitMentorRegistration({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        gender: form.gender,
        bio: form.bio,
        expertise: form.expertise,
        availability: form.availability,
        location: form.location,
        preferredSubjects: form.preferredSubjects
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });

      setSuccessMessage(response.message || 'Registration submitted successfully.');
      setStep(3);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to submit registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div className="login-page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px', background: 'linear-gradient(135deg, #f4f1f2 0%, #efe7ea 100%)' }}>
        <div className="form-card" style={{ maxWidth: 560, width: '100%', padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(30, 139, 95, 0.12)', display: 'grid', placeItems: 'center', color: 'var(--success)' }}>
              <CheckCircle2 size={32} />
            </div>
          </div>
          <div className="eyebrow" style={{ textAlign: 'center' }}>Registration submitted</div>
          <h2 style={{ textAlign: 'center', marginTop: 8, marginBottom: 12, letterSpacing: '-0.06em' }}>Your mentor profile is pending review</h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            {successMessage}
          </p>
          <div style={{ marginTop: 24, display: 'grid', gap: 10 }}>
            <button className="btn-primary" onClick={() => navigate('/')}>
              Back to sign in
            </button>
            <button className="btn-secondary" onClick={() => setSuccessMessage('')}>
              Register another mentor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px', background: 'linear-gradient(135deg, #f4f1f2 0%, #efe7ea 100%)' }}>
      <div className="form-card" style={{ width: '100%', maxWidth: 760, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
          <div>
            <div className="eyebrow">Mentor onboarding</div>
            <h2 style={{ margin: '4px 0 0', letterSpacing: '-0.06em' }}>Join the Anfaal mentor network</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)', fontWeight: 700 }}>
            <ShieldCheck size={18} />
            Step {step} of 3
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {stepTitles.map((title, index) => (
            <div
              key={title}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 999,
                background: step >= index + 1 ? 'linear-gradient(90deg, var(--primary), #b26a8d)' : 'rgba(143,63,102,0.10)',
              }}
            />
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (step < 3) {
              nextStep();
            } else {
              handleSubmit();
            }
          }}
          style={{ display: 'grid', gap: 18 }}
        >
          {step === 1 && (
            <>
              <div className="field">
                <label>Full name</label>
                <input className="input" value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} placeholder="Your full name" />
              </div>

              <div className="form-grid-2">
                <div className="field">
                  <label>Email address</label>
                  <input className="input" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="you@example.com" />
                </div>
                <div className="field">
                  <label>Phone number</label>
                  <input className="input" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="+91 98765 43210" />
                </div>
              </div>

              <div className="field">
                <label>Password</label>
                <div className="password-input-wrap" style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="Create a secure password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="form-grid-2">
                <div className="field">
                  <label>Gender</label>
                  <select className="input" value={form.gender} onChange={(event) => updateField('gender', event.target.value)}>
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="field">
                  <label>Location</label>
                  <input className="input" value={form.location} onChange={(event) => updateField('location', event.target.value)} placeholder="City or area" />
                </div>
              </div>

              <div className="field">
                <label>Areas of expertise</label>
                <input className="input" value={form.expertise} onChange={(event) => updateField('expertise', event.target.value)} placeholder="Quran, academics, study habits" />
              </div>

              <div className="field">
                <label>Availability</label>
                <input className="input" value={form.availability} onChange={(event) => updateField('availability', event.target.value)} placeholder="Weeknights, weekends, etc." />
              </div>

              <div className="field">
                <label>Preferred subjects</label>
                <input className="input" value={form.preferredSubjects} onChange={(event) => updateField('preferredSubjects', event.target.value)} placeholder="Quran, Math, English" />
              </div>

              <div className="field">
                <label>Tell us about your mentoring background</label>
                <textarea className="input" value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={5} placeholder="Share your mentoring experience, values, and how you support students." />
              </div>
            </>
          )}

          {step === 3 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="summary-card" style={{ padding: 18 }}>
                <h3 style={{ marginBottom: 14 }}>Review your profile</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div><strong>Name:</strong> {form.fullName}</div>
                  <div><strong>Email:</strong> {form.email}</div>
                  <div><strong>Phone:</strong> {form.phone}</div>
                  <div><strong>Location:</strong> {form.location || 'Not provided'}</div>
                  <div><strong>Expertise:</strong> {form.expertise || 'Not provided'}</div>
                  <div><strong>Availability:</strong> {form.availability || 'Not provided'}</div>
                  <div><strong>Preferred subjects:</strong> {form.preferredSubjects || 'Not provided'}</div>
                  <div><strong>Bio:</strong> {form.bio}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                By submitting this form, you agree to be evaluated by the Anfaal team before your mentor profile is activated.
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 4, color: 'var(--danger)', fontWeight: 600, fontSize: '0.9rem' }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={previousStep} disabled={step === 1} style={{ opacity: step === 1 ? 0.5 : 1 }}>
              <ArrowLeft size={16} /> Back
            </button>
            {step < 3 ? (
              <button type="submit" className="btn-primary">
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit registration'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
