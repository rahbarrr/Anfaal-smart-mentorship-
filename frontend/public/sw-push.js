// Web Push Notification Event Listeners for Anfaal PWA Service Worker
// Automatically imported by Workbox in sw.js via importScripts

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {
    title: 'Anfaal Mentorship',
    body: 'You have a new update.',
    link: '/',
    tag: 'anfaal-notification',
  };

  try {
    payload = event.data.json();
  } catch {
    payload.body = event.data.text();
  }

  const title = payload.title || 'Anfaal Mentorship';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'anfaal-notification',
    renotify: true,
    data: {
      link: payload.link || payload.data?.link || '/',
      notificationId: payload.data?.notificationId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.link || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing open tab if available
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if ('navigate' in client && targetUrl !== '/') {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
