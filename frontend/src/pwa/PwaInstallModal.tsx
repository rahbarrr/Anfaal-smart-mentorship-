import { useState, useEffect } from 'react';
import { X, Download, Share, CheckCircle2, Smartphone, Monitor, AlertCircle } from 'lucide-react';

export type InstallModalPlatform = 'ios' | 'android' | 'desktop';

export interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'instructions' | 'already-installed';
  defaultPlatform: InstallModalPlatform;
}

export function PwaInstallModal({
  isOpen,
  onClose,
  mode,
  defaultPlatform,
}: PwaInstallModalProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<InstallModalPlatform>(defaultPlatform);

  // Sync default platform when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPlatform(defaultPlatform);
    }
  }, [isOpen, defaultPlatform]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="pwa-install-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        className="form-card pwa-install-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--surface)',
          borderRadius: 20,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
          border: '1px solid var(--border)',
          padding: 24,
          position: 'relative',
          boxSizing: 'border-box',
          margin: 'auto',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close installation window"
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <X size={18} />
        </button>

        {mode === 'already-installed' ? (
          /* ── Already Installed State ─────────────────────────────────────── */
          <div style={{ textAlign: 'center', padding: '12px 6px 6px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(46, 139, 87, 0.12)',
                color: '#2e7d32',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <div
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 999,
                background: 'rgba(46, 139, 87, 0.1)',
                color: '#2e7d32',
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Installed App
            </div>

            <h3
              id="pwa-install-modal-title"
              style={{
                fontWeight: 800,
                fontSize: '1.4rem',
                margin: '0 0 10px',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}
            >
              Anfaal is Already Installed
            </h3>

            <p
              style={{
                fontSize: '0.92rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                margin: '0 0 24px',
              }}
            >
              Anfaal Smart Mentorship is running as an installed application on this device. You can open it anytime directly from your home screen or application launcher.
            </p>

            <button
              type="button"
              className="btn-primary"
              onClick={onClose}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 12,
                fontSize: '0.92rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Installation Instructions State ────────────────────────────── */
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--primary) 0%, #7f315c 100%)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(143, 63, 102, 0.25)',
                }}
              >
                <Download size={22} />
              </div>
              <div>
                <h3
                  id="pwa-install-modal-title"
                  style={{
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    margin: 0,
                    letterSpacing: '-0.02em',
                    color: 'var(--text-primary)',
                  }}
                >
                  Install Anfaal App
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Fast offline access & home screen launcher
                </div>
              </div>
            </div>

            {/* Platform Selector Tabs */}
            <div
              role="tablist"
              aria-label="Installation platform"
              style={{
                display: 'flex',
                background: 'var(--surface-muted)',
                borderRadius: 12,
                padding: 4,
                gap: 4,
                marginBottom: 20,
                border: '1px solid var(--border)',
              }}
            >
              {[
                { id: 'ios' as const, label: 'iPhone / iPad', icon: Share },
                { id: 'android' as const, label: 'Android', icon: Smartphone },
                { id: 'desktop' as const, label: 'Desktop', icon: Monitor },
              ].map(({ id, label, icon: TabIcon }) => {
                const isActive = selectedPlatform === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setSelectedPlatform(id)}
                    style={{
                      flex: 1,
                      padding: '8px 6px',
                      fontSize: '0.78rem',
                      fontWeight: isActive ? 700 : 600,
                      borderRadius: 9,
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                      boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <TabIcon size={14} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Platform Instructions Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {selectedPlatform === 'ios' && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      In Safari, tap the <strong>Share</strong> button <Share size={15} style={{ verticalAlign: 'text-bottom', display: 'inline' }} /> at the bottom of the screen.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Scroll down in the menu and tap <strong>Add to Home Screen</strong>.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Tap <strong>Add</strong> in the top-right corner to place Anfaal on your Home Screen.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      padding: '6px 4px',
                    }}
                  >
                    <AlertCircle size={14} color="var(--primary)" />
                    <span>Please ensure you are viewing this page in Safari.</span>
                  </div>
                </>
              )}

              {selectedPlatform === 'android' && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Tap the <strong>browser menu (⋮)</strong> in the top-right corner of Chrome.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Choose <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Tap <strong>Install</strong> when prompted to add the app to your phone.
                    </div>
                  </div>
                </>
              )}

              {selectedPlatform === 'desktop' && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Look for the <strong>Install icon (⤓ or ⊕)</strong> on the right side of the browser address bar.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Or open the browser menu <strong>(⋮)</strong> and select <strong>"Save and share"</strong> → <strong>"Install Anfaal"</strong>.
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(143,63,102,0.04)',
                      border: '1px solid rgba(143,63,102,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      Click <strong>Install</strong> to launch Anfaal in a standalone, dedicated desktop window.
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Bottom Done Button */}
            <button
              type="button"
              className="btn-primary"
              onClick={onClose}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 12,
                fontSize: '0.92rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
