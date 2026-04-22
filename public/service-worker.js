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
    icon: data.icon || '/icons/android-chrome-192x192.png',
    badge: data.badge || '/icons/android-chrome-192x192.png',
    tag: data.tag || undefined,
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    data: {
      url: data.url || '/owner-login.html',
      targetUrl: data.targetUrl || data.url || '/owner-login.html',
      messageId: data.messageId || null,
      channel: data.channel || null,
      broadcastNotificationId: data.broadcastNotificationId || null,
      broadcastRecipientId: data.broadcastRecipientId || null
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

  const data = event.notification && event.notification.data ? event.notification.data : {};
  const notificationId = data.broadcastNotificationId;
  const recipientId = data.broadcastRecipientId;
  const rawTargetUrl = data.targetUrl || data.url || '/owner-login.html';
  const targetUrl = new URL(rawTargetUrl, self.location.origin).href;

  event.waitUntil((async () => {
    if (notificationId && recipientId) {
      try {
        await fetch('/api/push/broadcast-opened', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notification_id: notificationId,
            recipient_id: recipientId
          })
        });
      } catch (e) {}
    }

    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url && client.url.startsWith(self.location.origin)) {
        try {
          await client.navigate(targetUrl);
        } catch (e) {}
        if ('focus' in client) {
          return client.focus();
        }
      }
    }

    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SET_BADGE') {
    event.waitUntil(setBadgeCount(Number(data.count || 0)));
  }
});
