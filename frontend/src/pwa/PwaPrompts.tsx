import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, Share, X, Bell } from 'lucide-react';
import { usePwaInstall } from './PwaHooks';
import {
  registerServiceWorker,
  syncPushSubscription,
  subscribeToPush,
  isPushSupported,
  getNotificationPermission,
} from './pwaNotifications';

/**
 * PWA UX layer: registers the service worker, handles push notifications,
 * shows a non-intrusive "new version available" banner, push permission prompt,
 * and an optional, dismissible install prompt.
 * Mounted once in App.tsx. It never auto-reloads the page.
 */

const INSTALL_DISMISSED_KEY = 'anfaal-pwa-install-dismissed-at';
const PUSH_PROMPT_DISMISSED_KEY = 'anfaal-pwa-push-dismissed-at';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 30; // don't re-ask for 30 days
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30; // look for a new deployment every 30 min

function wasRecentlyDismissed(key: string): boolean {
  try {
    const at = Number(localStorage.getItem(key) || 0);
    return at > 0 && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable: dismissal just won't persist */
  }
}

export function PwaPrompts() {
  const navigate = useNavigate();

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
  const [toastDismissed, setToastDismissed] = useState<boolean>(() => wasRecentlyDismissed(INSTALL_DISMISSED_KEY));
  const [pushDismissed, setPushDismissed] = useState<boolean>(() => wasRecentlyDismissed(PUSH_PROMPT_DISMISSED_KEY));
  const [pushSubscribing, setPushSubscribing] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>(() => getNotificationPermission());

  // 1. Service Worker & Push Subscription Lifecycle
  useEffect(() => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;

    // Explicitly guarantee service worker registration and background push listener attachment
    void registerServiceWorker().then(() => {
      if (getNotificationPermission() === 'granted') {
        void syncPushSubscription(token);
      }
    });

    // Listen for notification click postMessage from service worker
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.url) {
        navigate(event.data.url);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [navigate]);

  const dismissToast = useCallback(() => {
    rememberDismissal(INSTALL_DISMISSED_KEY);
    setToastDismissed(true);
  }, []);

  const dismissPushToast = useCallback(() => {
    rememberDismissal(PUSH_PROMPT_DISMISSED_KEY);
    setPushDismissed(true);
  }, []);

  const handleInstallClick = useCallback(async () => {
    setToastDismissed(true);
    await triggerInstall();
  }, [triggerInstall]);

  const handleEnablePushClick = useCallback(async () => {
    const token = localStorage.getItem('anfaal-token');
    if (!token) return;

    setPushSubscribing(true);
    try {
      const res = await subscribeToPush(token);
      setPermissionState(getNotificationPermission());
      if (res.success) {
        setPushDismissed(true);
      }
    } finally {
      setPushSubscribing(false);
    }
  }, []);

  const token = typeof window !== 'undefined' ? localStorage.getItem('anfaal-token') : null;
  const showPushToast =
    Boolean(token) &&
    isPushSupported() &&
    permissionState === 'default' &&
    !pushDismissed &&
    !needRefresh;

  // Show install toast only if not installed, not recently dismissed, and update banner isn't active
  const showInstallToast =
    !isInstalled &&
    !toastDismissed &&
    !needRefresh &&
    !showPushToast &&
    (canInstallNatively || platform === 'ios');

  if (!needRefresh && !showInstallToast && !showPushToast) return null;

  return (
    <div className="pwa-toast-region" role="region" aria-label="App notifications">
      {/* 1. App Update Toast */}
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

      {/* 2. Background Push Permission Opt-In Toast */}
      {showPushToast && (
        <div className="pwa-toast" role="status" aria-live="polite">
          <Bell size={18} className="pwa-toast-icon" aria-hidden="true" style={{ color: 'var(--primary)' }} />
          <div className="pwa-toast-body">
            <strong>Stay up to date</strong>
            <span>Enable notifications to receive daily progress reminders, call summaries, and mentor feedback.</span>
          </div>
          <div className="pwa-toast-actions">
            <button
              type="button"
              className="pwa-btn pwa-btn-primary"
              disabled={pushSubscribing}
              onClick={handleEnablePushClick}
            >
              {pushSubscribing ? 'Enabling…' : 'Enable'}
            </button>
            <button
              type="button"
              className="pwa-btn pwa-btn-ghost"
              aria-label="Dismiss notification prompt"
              onClick={dismissPushToast}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* 3. App Install Toast */}
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
