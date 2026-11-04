'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw, Share, X, Bell } from 'lucide-react';
import { usePwaInstall } from './PwaContext';
import {
  registerServiceWorker,
  syncPushSubscription,
  subscribeToPush,
  isPushSupported,
  getNotificationPermission,
} from './pwaNotifications';

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
  const router = useRouter();

  const [needRefresh, setNeedRefresh] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const { isInstalled, canInstallNatively, platform, triggerInstall } = usePwaInstall();
  const [mounted, setMounted] = useState(false);
  const [toastDismissed, setToastDismissed] = useState<boolean>(true);
  const [pushDismissed, setPushDismissed] = useState<boolean>(true);
  const [pushSubscribing, setPushSubscribing] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');

  // 1. Service Worker & Push Subscription Lifecycle
  useEffect(() => {
    setMounted(true);
    setToastDismissed(wasRecentlyDismissed(INSTALL_DISMISSED_KEY));
    setPushDismissed(wasRecentlyDismissed(PUSH_PROMPT_DISMISSED_KEY));
    setPermissionState(getNotificationPermission());

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const token = localStorage.getItem('anfaal-token');

    // Explicitly guarantee service worker registration and background push listener attachment
    void registerServiceWorker().then((registration) => {
      if (!registration) return;

      if (token && getNotificationPermission() === 'granted') {
        void syncPushSubscription(token);
      }

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

    // Listen for notification click postMessage from service worker
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.url) {
        router.push(event.data.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [router]);

  const updateServiceWorker = (reloadPage = true) => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    if (reloadPage) {
      window.location.reload();
    }
  };

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

  const showInstallToast = !isInstalled && !toastDismissed && !needRefresh && (canInstallNatively || platform === 'ios');
  const showPushToast =
    !needRefresh &&
    !pushDismissed &&
    isPushSupported() &&
    permissionState === 'default' &&
    typeof window !== 'undefined' &&
    Boolean(localStorage.getItem('anfaal-token'));

  if (!mounted || (!needRefresh && !showInstallToast && !showPushToast)) return null;

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

      {showPushToast && (
        <div className="pwa-toast" role="status" aria-live="polite">
          <Bell size={18} className="pwa-toast-icon text-primary" aria-hidden="true" />
          <div className="pwa-toast-body">
            <strong>Enable instant notifications</strong>
            <span>Get alerted immediately about daily check-ins, reminders, and mentor responses.</span>
          </div>
          <div className="pwa-toast-actions">
            <button
              type="button"
              className="pwa-btn pwa-btn-primary"
              onClick={handleEnablePushClick}
              disabled={pushSubscribing}
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
