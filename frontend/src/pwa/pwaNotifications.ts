// ═══════════════════════════════════════════════════════════════════════════
// ANFAAL PWA - Centralized Push Notification & Service Worker Manager
// ═══════════════════════════════════════════════════════════════════════════

import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationPreferences,
} from '../lib/api';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Registers the Service Worker and returns the registration.
 * Ensures the service worker is active with scope '/' for background push handling.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Check for updates periodically
    if (registration) {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('[Anfaal SW] New service worker version available.');
            }
          });
        }
      });
    }

    return registration;
  } catch (err) {
    console.error('[Anfaal SW] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Syncs the current device's Web Push subscription with the backend for the logged-in user.
 * Validates that any existing subscription's applicationServerKey matches the current VAPID key.
 * If key differs or subscription is expired/corrupted, re-subscribes cleanly.
 */
export async function syncPushSubscription(token: string): Promise<PushSubscription | null> {
  if (!token || !isPushSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    let swReg: ServiceWorkerRegistration | null | undefined = await navigator.serviceWorker.getRegistration('/');
    if (!swReg || !swReg.active) {
      swReg = await registerServiceWorker();
    }
    if (!swReg || !swReg.pushManager) {
      const readyReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration | null>((resolve) =>
          setTimeout(() => resolve(null), 3500),
        ),
      ]);
      if (readyReg) {
        swReg = readyReg;
      }
    }
    if (!swReg || !swReg.pushManager) {
      console.warn('[Anfaal Push] PushManager not ready on service worker.');
      return null;
    }

    // 1. Fetch current backend VAPID public key
    const { publicKey } = await getVapidPublicKey();
    if (!publicKey) {
      console.warn('[Anfaal Push] VAPID public key not available from backend.');
      return null;
    }

    const expectedAppServerKey = urlBase64ToUint8Array(publicKey);

    // 2. Inspect existing subscription
    let subscription = await swReg.pushManager.getSubscription();

    // Check if existing subscription has matching key
    if (subscription) {
      const existingKey = subscription.options?.applicationServerKey;
      let keyMatches = false;

      if (existingKey) {
        const existingArr = new Uint8Array(existingKey);
        if (existingArr.length === expectedAppServerKey.length) {
          keyMatches = existingArr.every((val, idx) => val === expectedAppServerKey[idx]);
        }
      }

      if (!keyMatches) {
        console.info('[Anfaal Push] VAPID key changed or mismatched; refreshing subscription...');
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }
    }

    // 3. Create fresh subscription if needed
    if (!subscription) {
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedAppServerKey as unknown as BufferSource,
      });
    }

    // 4. Save subscription with backend for the current user
    if (subscription) {
      await registerPushSubscription(token, subscription);
      console.info('[Anfaal Push] Push subscription successfully synchronized for user.');
    }

    return subscription;
  } catch (err) {
    console.error('[Anfaal Push] Failed to sync push subscription:', err);
    return null;
  }
}

/**
 * Explicit user opt-in request for push notifications.
 * Requests permission, registers subscription, and enables push in user preferences.
 */
export async function subscribeToPush(token: string): Promise<{ success: boolean; message: string }> {
  if (!isPushSupported()) {
    return { success: false, message: 'Push notifications are not supported by this browser.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, message: 'Notification permission was not granted.' };
    }

    const subscription = await syncPushSubscription(token);
    if (!subscription) {
      return { success: false, message: 'Failed to establish push notification subscription.' };
    }

    if (token) {
      await updateNotificationPreferences(token, { pushEnabled: true });
    }

    return { success: true, message: 'Push notifications enabled successfully!' };
  } catch (err: any) {
    console.error('[Anfaal Push] Error subscribing to push:', err);
    return { success: false, message: err?.message || 'Error subscribing to notifications' };
  }
}

/**
 * Unsubscribes current device from Web Push and unregisters it in the backend.
 */
export async function unsubscribeFromPush(token?: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const swReg = await navigator.serviceWorker.ready;
    const subscription = await swReg.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      if (token) {
        await unregisterPushSubscription(token, endpoint).catch(() => undefined);
        await updateNotificationPreferences(token, { pushEnabled: false }).catch(() => undefined);
      }
    }

    return true;
  } catch (err) {
    console.error('[Anfaal Push] Error unsubscribing from push:', err);
    return false;
  }
}

