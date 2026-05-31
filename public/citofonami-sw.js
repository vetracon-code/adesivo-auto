const CITOFONAMI_CACHE = 'citofonami-cache-v1';

const CORE_ASSETS = [
  '/citofonami/DEMO',
  '/citofonami-app.html',
  '/citofonami-manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CITOFONAMI_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => null)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CITOFONAMI_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();

        caches.open(CITOFONAMI_CACHE).then((cache) => {
          cache.put(request, copy).catch(() => null);
        });

        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/citofonami-app.html')))
  );
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'Citofonami',
      body: event.data ? event.data.text() : 'Qualcuno sta suonando il tuo citofono digitale.'
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
      url: data.url || '/citofonami/DEMO'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/citofonami/DEMO';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
