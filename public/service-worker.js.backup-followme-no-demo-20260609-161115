const ANDROID_FIX_VERSION = '20260428140657';
const FOLLOWME_CHAT_DIRECT_OPEN_VERSION = '20260515-DIRECT-OPEN';
const FOLLOWME_CHAT_PUSH_AUTO_OPEN_VERSION = '20260515-CHAT-AUTO-OPEN';
const FOLLOWME_CHAT_CLICK_FIX_VERSION = '20260515-1558';
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

  const pushType = data.type || (data.data && data.data.type) || null;
  const pushCode = data.code || (data.data && data.data.code) || null;
  const pushSessionId = data.session_id || data.sessionId || (data.data && (data.data.session_id || data.data.sessionId)) || null;
  const pushTargetUrl = data.targetUrl || data.url || data.relativeTargetUrl || (
    pushType === 'followme_chat_new_user' && pushCode && pushSessionId
      ? ('/fm/app/' + encodeURIComponent(pushCode) + '?chatSession=' + encodeURIComponent(pushSessionId) + '&focus=chat')
      : null
  );

  if (pushType === 'followme_chat_new_user' && pushCode && pushSessionId) {
    event.waitUntil((async () => {
      try {
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          if (client && client.url && client.url.startsWith(self.location.origin)) {
            client.postMessage({
              type: 'FOLLOWME_CHAT_NEW_USER',
              code: pushCode,
              session_id: pushSessionId,
              targetUrl: pushTargetUrl
            });
          }
        }
      } catch (e) {}
    })());
  }

  const title = data.title || 'Nuova segnalazione ricevuta';
  const options = {
    body: data.body || 'Apri la Web App per leggere il messaggio.',
    icon: data.icon || '/icons/android-chrome-192x192.png',
    badge: data.badge || '/icons/android-chrome-192x192.png',
    tag: data.tag || undefined,
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    data: {
      url: data.url || data.relativeTargetUrl || '/owner-login.html',
      targetUrl: data.targetUrl || data.url || data.relativeTargetUrl || '/owner-login.html',
      relativeTargetUrl: data.relativeTargetUrl || null,
      type: data.type || (data.data && data.data.type) || null,
      code: data.code || (data.data && data.data.code) || null,
      session_id: data.session_id || data.sessionId || (data.data && (data.data.session_id || data.data.sessionId)) || null,
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
  let rawTargetUrl = data.targetUrl || data.url || data.relativeTargetUrl || '/owner-login.html';

  if (data.type === 'followme_chat_new_user' && data.code && data.session_id) {
    rawTargetUrl = data.targetUrl || data.url || data.relativeTargetUrl || ('/fm/app/' + encodeURIComponent(data.code) + '?chatSession=' + encodeURIComponent(data.session_id) + '&focus=chat');
  }

  const targetUrl = new URL(rawTargetUrl, self.location.origin).href;

  event.waitUntil((async () => {
    if (data.type === 'followme_chat_new_user') {
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }

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


/* followme-chat-v2-new-user-notification-click-20260527 */
self.addEventListener('notificationclick', function(event) {
  try {
    const n = event.notification;
    const data = (n && n.data) || {};
    const url =
      data.url ||
      data.targetUrl ||
      data.relativeTargetUrl ||
      (data.data && (data.data.url || data.data.targetUrl || data.data.relativeTargetUrl)) ||
      '/fm/app/FMDEMO';

    if (n) n.close();

    event.waitUntil((async function(){
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      const absoluteUrl = new URL(url, self.location.origin).href;

      for (const client of allClients) {
        try {
          if ('focus' in client && client.url && client.url.includes('/fm/chat-v2/admin/')) {
            await client.focus();
            if ('navigate' in client) return client.navigate(absoluteUrl);
            return;
          }
        } catch(e) {}
      }

      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    })());
  } catch(e) {}
});


/* followme-generic-notification-click-all-projects-20260527
   Handler generico per tutte le notifiche:
   FollowMe, Chat V2, Contatto Veicolo, Avvisami.
   Non modifica i testi delle notifiche: gestisce solo il click.
*/
self.addEventListener('notificationclick', function(event) {
  try {
    const notification = event.notification;
    const data = (notification && notification.data) || {};

    const url =
      data.url ||
      data.targetUrl ||
      data.relativeTargetUrl ||
      (data.data && (data.data.url || data.data.targetUrl || data.data.relativeTargetUrl)) ||
      '/';

    if (notification) notification.close();

    event.waitUntil((async function(){
      const absoluteUrl = new URL(url, self.location.origin).href;

      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of allClients) {
        try {
          if ('focus' in client) {
            await client.focus();
            if ('navigate' in client) {
              return client.navigate(absoluteUrl);
            }
            return;
          }
        } catch(e) {}
      }

      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    })());
  } catch(e) {}
});
