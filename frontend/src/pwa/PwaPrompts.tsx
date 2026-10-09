import { useCallback, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { usePwaInstall } from './PwaContext';

/**
 * PWA UX layer: registers the service worker, shows a non-intrusive
 * "new version available" banner and an optional, dismissible install prompt.
 * Mounted once in App.tsx. It never auto-reloads the page.
 */

const INSTALL_DISMISSED_KEY = 'anfaal-pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 30; // don't re-ask for 30 days
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30; // look for a new deployment every 30 min

function wasRecentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: dismissal just won't persist */
  }
}

export function PwaPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Detect new Vercel/Render deployments for long-lived sessions
      const check = () => {
        if (registration.installing || !navigator.onLine) return;
        registration.update().catch(() => undefined);
      };
      window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  const { isInstalled, canInstallNatively, platform, triggerInstall } = usePwaInstall();
  const [toastDismissed, setToastDismissed] = useState<boolean>(() => wasRecentlyDismissed());

  const dismissToast = useCallback(() => {
    rememberDismissal();
    setToastDismissed(true);
  }, []);

  const handleInstallClick = useCallback(async () => {
    setToastDismissed(true);
    await triggerInstall();
  }, [triggerInstall]);

  // Show install toast only if not installed, not recently dismissed, and update banner isn't active
  const showInstallToast = !isInstalled && !toastDismissed && !needRefresh && (canInstallNatively || platform === 'ios');

  if (!needRefresh && !showInstallToast) return null;

  return (
    <div className="pwa-toast-region" role="region" aria-label="App notifications">
      {needRefresh && (
        <div className="pwa-toast" role="status" aria-live="polite">
          <RefreshCw size={18} className="pwa-toast-icon" aria-hidden="true" />
          <div className="pwa-toast-body">
            <strong>New version available</strong>
            <span>Finish what you're doing, then update to get the latest Anfaal.</span>
          </div>
          <div className="pwa-toast-actions">
            <button type="button" className="pwa-btn pwa-btn-primary" onClick={() => updateServiceWorker(true)}>
              Update now
            </button>
            <button
              type="button"
              className="pwa-btn pwa-btn-ghost"
              aria-label="Dismiss update notice"
              onClick={() => setNeedRefresh(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {showInstallToast && (
        <div className="pwa-toast" role="status" aria-live="polite">
          {canInstallNatively ? (
            <Download size={18} className="pwa-toast-icon" aria-hidden="true" />
          ) : (
            <Share size={18} className="pwa-toast-icon" aria-hidden="true" />
          )}
          <div className="pwa-toast-body">
            <strong>Install Anfaal</strong>
            <span>
              {canInstallNatively
                ? 'Add Anfaal to your home screen for a faster app-like experience.'
                : 'Tap the Share button, then “Add to Home Screen” for a faster app-like experience.'}
            </span>
          </div>
          <div className="pwa-toast-actions">
            <button type="button" className="pwa-btn pwa-btn-primary" onClick={handleInstallClick}>
              Install
            </button>
            <button
              type="button"
              className="pwa-btn pwa-btn-ghost"
              aria-label="Dismiss install prompt"
              onClick={dismissToast}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
