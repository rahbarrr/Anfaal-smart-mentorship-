import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, Share, X } from 'lucide-react';

/**
 * PWA UX layer: registers the service worker, shows a non-intrusive
 * "new version available" banner and an optional, dismissible install prompt.
 * Mounted once in App.tsx. It never auto-reloads the page.
 */

const INSTALL_DISMISSED_KEY = 'anfaal-pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 30; // don't re-ask for 30 days
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30; // look for a new deployment every 30 min

// Chrome/Edge/Android "install" event (not in lib.dom.d.ts)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  return isIos && isSafari;
}

export function PwaPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Detect new Vercel deployments for long-lived sessions (installed PWA stays open for days).
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

  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(
    () => typeof window !== 'undefined' && isIosSafari() && !isStandalone() && !wasRecentlyDismissed(),
  );
  const [installHidden, setInstallHidden] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress the browser mini-infobar; we show our own subtle prompt
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setShowIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);


    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismissInstall = useCallback(() => {
    rememberDismissal();
    setInstallHidden(true);
    setInstallEvent(null);
    setShowIosHint(false);
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'dismissed') rememberDismissal();
    setInstallEvent(null);
  }, [installEvent]);

  const showInstall = !installHidden && !needRefresh && (installEvent !== null || showIosHint);

  if (!needRefresh && !showInstall) return null;

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

      {showInstall && (
        <div className="pwa-toast" role="status" aria-live="polite">
          {installEvent ? (
            <Download size={18} className="pwa-toast-icon" aria-hidden="true" />
          ) : (
            <Share size={18} className="pwa-toast-icon" aria-hidden="true" />
          )}
          <div className="pwa-toast-body">
            <strong>Install Anfaal</strong>
            <span>
              {installEvent
                ? 'Add Anfaal to your home screen for a faster app-like experience.'
                : 'Tap the Share button, then “Add to Home Screen” for a faster app-like experience.'}
            </span>
          </div>
          <div className="pwa-toast-actions">
            {installEvent && (
              <button type="button" className="pwa-btn pwa-btn-primary" onClick={install}>
                Install
              </button>
            )}
            <button
              type="button"
              className="pwa-btn pwa-btn-ghost"
              aria-label="Dismiss install prompt"
              onClick={dismissInstall}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
