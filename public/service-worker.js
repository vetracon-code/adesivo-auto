self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function setBadgeCount(count) {
  if (typeof self.navigator !== 'undefined' && 'setAppBadge' in self.navigator) {
    try {
      if (count > 0) {
        await self.navigator.setAppBadge(count);
      } else if ('clearAppBadge' in self.navigator) {
        await self.navigator.clearAppBadge();
      }
    } catch (e) {}
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const unreadCount = Number(data.unreadCount || 0);

  const title = data.title || 'Nuova segnalazione ricevuta';
  const options = {
    body: data.body || 'Apri la Web App per leggere il messaggio.',
    icon: '/icons/android-chrome-192x192.png',
    badge: '/icons/android-chrome-192x192.png',
    data: {
      url: data.url || '/owner-login.html'
    }
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      setBadgeCount(unreadCount)
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/owner-login.html';

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

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SET_BADGE') {
    event.waitUntil(setBadgeCount(Number(data.count || 0)));
  }
});
