/* eslint-disable no-restricted-globals */

// This service worker is required for PWA features and background notifications
const CACHE_NAME = 'kindergarten-v1';
const META_CACHE_NAME = 'kindergarten-meta-v1';
const BADGE_STATE_URL = '/__badge_state__';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});

const readStoredBadgeCount = async () => {
  const cache = await caches.open(META_CACHE_NAME);
  const response = await cache.match(BADGE_STATE_URL);
  if (!response) return 0;

  try {
    const data = await response.json();
    return Number.isFinite(data?.count) ? Math.max(0, data.count) : 0;
  } catch {
    return 0;
  }
};

const writeStoredBadgeCount = async (count) => {
  const cache = await caches.open(META_CACHE_NAME);
  await cache.put(
    BADGE_STATE_URL,
    new Response(JSON.stringify({ count }), {
      headers: { 'Content-Type': 'application/json' }
    })
  );
};

const syncAppBadge = async (count) => {
  if (!self.navigator) return;

  const badgeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  await writeStoredBadgeCount(badgeCount);

  if (badgeCount > 0 && 'setAppBadge' in self.navigator) {
    await self.navigator.setAppBadge(badgeCount);
    return;
  }

  if (badgeCount === 0 && 'clearAppBadge' in self.navigator) {
    await self.navigator.clearAppBadge();
  }
};

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'SYNC_APP_BADGE') return;

  event.waitUntil(
    syncAppBadge(data.count).catch(error => {
      console.error('Error syncing app badge from page:', error);
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If a window client is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window client is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle push events from the server
self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const incomingBadgeCount = Number(data.badgeCount);
    const incrementBadgeBy = Number(data.incrementBadgeBy ?? 1);
    const title = data.title || 'Thông báo mới';
    const options = {
      body: data.body || 'Bạn có thông báo mới',
      icon: data.icon || '/logo192.png',
      badge: data.badge || '/logo192.png',
      data: {
        url: data.url || '/'
      },
      vibrate: [100, 50, 100],
    };

    event.waitUntil(
      (async () => {
        const nextBadgeCount = Number.isFinite(incomingBadgeCount)
          ? Math.max(0, incomingBadgeCount)
          : (await readStoredBadgeCount()) + (Number.isFinite(incrementBadgeBy) ? incrementBadgeBy : 1);

        await Promise.all([
          self.registration.showNotification(title, options),
          syncAppBadge(nextBadgeCount)
        ]);
      })()
    );
  } catch (error) {
    console.error('Error handling push event:', error);
  }
});
