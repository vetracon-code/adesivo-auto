const CITOFONAMI_CACHE = 'citofonami-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'Citofonami',
      body: event.data ? event.data.text() : 'Qualcuno sta suonando.'
    };
  }

  const title = data.title || 'Citofonami';
  const options = {
    body: data.body || 'Qualcuno sta suonando il tuo citofono digitale.',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || 'citofonami-ring',
    requireInteraction: true,
    data: {
      url: data.url || '/citofonami-admin'
    },
    actions: [
      {
        action: 'open',
        title: 'Apri'
      }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/citofonami-admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
