'use client';

export function SessionLoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: 'var(--background, #f4f1f2)',
        color: 'var(--foreground, #2b1f24)',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        padding: '1.5rem',
        boxSizing: 'border-box',
      }}
      role="status"
      aria-label="Checking authentication session"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          maxWidth: '320px',
          textAlign: 'center',
        }}
      >
        {/* Animated Brand Emblem */}
        <div
          style={{
            position: 'relative',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--primary, #8f3f66) 0%, #682645 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(143, 63, 102, 0.25)',
          }}
        >
          <span
            style={{
              color: '#ffffff',
              fontSize: '28px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
            }}
          >
            A
          </span>
          <div
            style={{
              position: 'absolute',
              inset: '-4px',
              borderRadius: '20px',
              border: '2px solid var(--primary, #8f3f66)',
              opacity: 0.35,
              animation: 'anfaal-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        </div>

        <div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              margin: '0 0 0.35rem 0',
              color: 'var(--foreground, #2b1f24)',
            }}
          >
            Anfaal Mentorship
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--muted-foreground, #7d6b73)',
              margin: 0,
            }}
          >
            Restoring your secure session…
          </p>
        </div>

        {/* Minimal Spinner */}
        <div
          style={{
            width: '28px',
            height: '28px',
            border: '3px solid rgba(143, 63, 102, 0.15)',
            borderTopColor: 'var(--primary, #8f3f66)',
            borderRadius: '50%',
            animation: 'anfaal-spin 0.8s linear infinite',
            marginTop: '0.5rem',
          }}
        />
      </div>

      <style>{`
        @keyframes anfaal-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes anfaal-pulse {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.1); opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
