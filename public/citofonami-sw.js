/* CITOFONAMI_SW_TARGET_ADMIN_CLEAN_FIXED_20260601 */
const CITOFONAMI_CACHE = 'citofonami-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* CITOFONAMI_IMPORTANT_NOTIFICATION_DEFAULTS */

function enhanceCitofonamiNotificationOptions(options) {
  const next = Object.assign({}, options || {});

  next.tag = next.tag || 'citofonami-important';
  next.renotify = true;
  next.requireInteraction = true;
  next.silent = false;

  if (!next.vibrate) {
    next.vibrate = [250, 110, 250, 110, 500];
  }

  next.data = Object.assign({}, next.data || {}, {
    important: true,
    receivedAt: Date.now(),
    url: next.url || (next.data && next.data.url) || '/'
  });

  return next;
}


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
      url: data.url || '/citofonami-admin-clean'
    },
    actions: [
      {
        action: 'open',
        title: 'Apri'
      }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, enhanceCitofonamiNotificationOptions(options)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/citofonami-admin-clean';

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


// CITOFONAMI_SW_NO_CACHE_NAVIGATION
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.pathname.startsWith('/citofonami/') ||
    url.pathname.startsWith('/api/citofonami/')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
    );
    return;
  }
});

