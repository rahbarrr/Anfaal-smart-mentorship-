// ═══════════════════════════════════════════════════════════════════════════
// ANFAAL PWA - Background Web Push & Notification Service Worker Logic
// Handles: background push delivery, rich notification payloads, click focus/navigation
// ═══════════════════════════════════════════════════════════════════════════

// Immediate activation so that push handling is always active without manual user reload
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.info('[Anfaal SW-Push] [Step 4] Service worker received push event at', new Date().toISOString());
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
      console.info('[Anfaal SW-Push] Parsed JSON push payload:', payload);
    } catch {
      try {
        const text = event.data.text();
        payload = { title: 'Anfaal Test Notification', body: text, message: text };
        console.info('[Anfaal SW-Push] Parsed text push payload:', text);
      } catch {
        payload = {};
      }
    }
  }

  // 1. Resolve meaningful notification title (Never default to bare "Anfaal")
  const title =
    payload.title ||
    payload.notification?.title ||
    payload.data?.title ||
    payload.heading ||
    'Anfaal Test Notification';

  // 2. Resolve meaningful notification message / body
  const body =
    payload.body ||
    payload.message ||
    payload.notification?.body ||
    payload.notification?.message ||
    payload.data?.body ||
    payload.data?.message ||
    'Background push notifications are working correctly!';

  // 3. Resolve destination URL
  const targetUrl =
    payload.url ||
    payload.link ||
    payload.data?.url ||
    payload.data?.link ||
    payload.click_action ||
    '/';

  // 4. Resolve absolute icon, badge, and tags
  const icon = new URL(payload.icon || '/icons/icon-192.png', self.location.origin).href;
  const badge = new URL(payload.badge || '/icons/icon-192.png', self.location.origin).href;
  const tag = payload.tag || payload.idempotencyKey || payload.type || `anfaal-${Date.now()}`;
  const timestamp =
    payload.timestamp || (payload.createdAt ? new Date(payload.createdAt).getTime() : Date.now());

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    timestamp,
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    data: {
      url: targetUrl,
      link: targetUrl,
      notificationId: payload.notificationId || payload.data?.notificationId,
      type: payload.type || payload.data?.type,
      timestamp,
    },
    actions: [
      {
        action: 'open',
        title: 'Open Anfaal',
      },
    ],
  };

  console.info(`[Anfaal SW-Push] [Step 5] Calling showNotification: "${title}" - "${body}"`);

  // Crucial: Android Chrome requires showNotification within event.waitUntil.
  // Never return early without showing a notification, or Android Chrome falls back to silent default.
  event.waitUntil(
    self.registration
      .showNotification(title, notificationOptions)
      .then(() => {
        console.info('[Anfaal SW-Push] [Step 5 Complete] showNotification displayed successfully.');
      })
      .catch((err) => {
        console.error('[Anfaal SW-Push] showNotification detailed error:', err);
        return self.registration.showNotification(title, {
          body,
          icon,
          badge,
          tag,
        });
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const rawUrl =
    event.notification.data?.url ||
    event.notification.data?.link ||
    '/';

  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        // Check if an existing window/tab from our origin is open
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            // Post message to client so React router can update if desired
            if ('postMessage' in client) {
              client.postMessage({
                type: 'NOTIFICATION_CLICK',
                url: rawUrl,
                data: event.notification.data,
              });
            }

            // If client is on a different URL, navigate it
            if ('navigate' in client && client.url !== targetUrl) {
              await client.navigate(targetUrl).catch(() => undefined);
            }

            return client.focus();
          }
        }

        // If no window is currently open, open a new standalone window / tab
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
      .catch((err) => console.error('[Anfaal SW-Push] notificationclick error:', err)),
  );
});
