'use client';

import { useCallback, useState, useEffect } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { usePwaInstall } from './PwaContext';

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
  const [needRefresh, setNeedRefresh] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw-push.js').then((registration) => {
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setNeedRefresh(true);
          }
        });
      });

      const check = () => {
        if (registration.installing || !navigator.onLine) return;
        registration.update().catch(() => undefined);
      };

      const interval = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      document.addEventListener('visibilitychange', onVisible);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }).catch((err) => {
      console.warn('[PWA] Service worker registration:', err);
    });
  }, []);

  const updateServiceWorker = (reloadPage = true) => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    if (reloadPage) {
      window.location.reload();
    }
  };

  const [mounted, setMounted] = useState(false);
  const { isInstalled, canInstallNatively, platform, triggerInstall } = usePwaInstall();
  const [toastDismissed, setToastDismissed] = useState<boolean>(true);

  useEffect(() => {
    setMounted(true);
    setToastDismissed(wasRecentlyDismissed());
  }, []);

  const dismissToast = useCallback(() => {
    rememberDismissal();
    setToastDismissed(true);
  }, []);

  const handleInstallClick = useCallback(async () => {
    setToastDismissed(true);
    await triggerInstall();
  }, [triggerInstall]);

  const showInstallToast = !isInstalled && !toastDismissed && !needRefresh && (canInstallNatively || platform === 'ios');

  if (!mounted || (!needRefresh && !showInstallToast)) return null;


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
