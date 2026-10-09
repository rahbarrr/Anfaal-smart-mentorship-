// Web Push Notification Event Listeners for Anfaal PWA Service Worker
// Automatically imported by Workbox in sw.js via importScripts

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {
    title: 'Anfaal',
    body: 'You have a new update.',
    url: '/',
    tag: 'anfaal-notification',
  };

  try {
    payload = event.data.json();
  } catch {
    payload.body = event.data.text();
  }

  const title = payload.title || 'Anfaal';
  const targetUrl = payload.url || payload.link || payload.data?.url || payload.data?.link || '/';
  const icon = payload.icon || '/icons/icon-192.png';
  const badge = payload.badge || '/icons/icon-192.png';

  const notificationOptions = {
    body: payload.body || 'You have a new update.',
    icon: icon,
    badge: badge,
    tag: payload.tag || payload.type || 'anfaal-notification',
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: targetUrl,
      link: targetUrl,
      notificationId: payload.notificationId || payload.data?.notificationId,
      type: payload.type || payload.data?.type,
    },
  };

  event.waitUntil(
    self.registration
      .showNotification(title, notificationOptions)
      .catch((err) => console.error('[SW-Push] showNotification error:', err)),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || event.notification.data?.link || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        // Check if there is already an open window/tab from our origin
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            if ('navigate' in client && targetUrl !== client.url) {
              await client.navigate(targetUrl).catch(() => undefined);
            }
            return client.focus();
          }
        }

        // Otherwise open a new standalone window / browser tab
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
      .catch((err) => console.error('[SW-Push] notificationclick error:', err)),
  );
});
