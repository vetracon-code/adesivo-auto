/* CITOFONAMI_SW_TARGET_STABLE_ADMIN_20260602 */
const CITOFONAMI_CACHE = 'citofonami-cache-stable-admin-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => String(key || '').toLowerCase().includes('citofonami'))
          .map((key) => caches.delete(key))
      );
    } catch (error) {}

    await self.clients.claim();
  })());
});

function stableAdminUrl(rawUrl) {
  let next = '/citofonami-admin';

  try {
    next = String(rawUrl || '').trim() || '/citofonami-admin';
  } catch (error) {
    next = '/citofonami-admin';
  }

  if (next === '/' || next === 'about:blank') {
    next = '/citofonami-admin';
  }

  // Correzione fondamentale: ogni vecchio puntamento admin-clean torna alla admin stabile.
  next = next.replace('/citofonami-admin-clean', '/citofonami-admin');

  try {
    const parsed = new URL(next, self.location.origin);

    if (parsed.origin !== self.location.origin) {
      return '/citofonami-admin';
    }

    if (parsed.pathname === '/citofonami-admin-clean') {
      parsed.pathname = '/citofonami-admin';
    }

    return parsed.pathname + parsed.search + parsed.hash;
  } catch (error) {
    return '/citofonami-admin';
  }
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

  const targetUrl = stableAdminUrl(
    data.url ||
    (data.data && data.data.url) ||
    '/citofonami-admin'
  );

  const title = data.title || 'Citofonami';
  const options = {
    body: data.body || 'Qualcuno sta suonando il tuo citofono digitale.',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || 'citofonami-ring',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: data.vibrate || [250, 110, 250, 110, 500],
    data: {
      ...(data.data || {}),
      url: targetUrl,
      stableAdmin: true,
      receivedAt: Date.now()
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

  const targetUrl = stableAdminUrl(
    event.notification &&
    event.notification.data &&
    event.notification.data.url
  );

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);

        if (
          clientUrl.origin === self.location.origin &&
          clientUrl.pathname === '/citofonami-admin'
        ) {
          await client.focus();

          if (client.navigate) {
            return client.navigate(targetUrl);
          }

          return;
        }
      } catch (error) {}
    }

    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  })());
});
