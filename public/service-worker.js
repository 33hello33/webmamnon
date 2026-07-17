/* eslint-disable no-restricted-globals */

// This service worker is required for PWA features and background notifications
// v5 - non-blocking install to fix activation timeout on mobile
const CACHE_NAME = 'kindergarten-v5';
const META_CACHE_NAME = 'kindergarten-meta-v2';
const BADGE_STATE_URL = '/__badge_state__';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/appleicon.png'
];

self.addEventListener('install', event => {
  // skipWaiting FIRST so SW moves to activate immediately
  self.skipWaiting();
  // Cache files individually - don't let any single failure block SW activation
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        urlsToCache.map(url => cache.add(url).catch(() => { /* ignore cache failures */ }))
      );
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, META_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isGetRequest = event.request.method === 'GET';
  const isSameOrigin = url.origin === self.location.origin;

  // Never intercept uploads, writes, or third-party requests.
  // Let the browser handle them directly to avoid breaking chat attachments.
  if (!isGetRequest || !isSameOrigin) {
    return;
  }

  // Use Network-First strategy for the root HTML files so users always get the latest version
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-First strategy for other static resources in urlsToCache
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
      .catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }

        return Response.error();
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
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }

      return undefined;
    })
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    let data = {};
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }

    const incomingBadgeCount = Number(data.badgeCount);
    const incrementBadgeBy = Number(data.incrementBadgeBy ?? 1);
    const title = data.title || 'Thông báo mới';
    const notificationTag = data.tag || `push-${Date.now()}`;
    const options = {
      body: data.body || 'Bạn có thông báo mới',
      icon: data.icon || '/appleicon.png',
      badge: data.badge || '/appleicon.png',
      tag: notificationTag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      data: {
        url: data.url || '/',
        tag: notificationTag
      },
      vibrate: [100, 50, 100],
    };

    event.waitUntil(
      (async () => {
        // Show notification first to guarantee it appears even if badge math fails
        await self.registration.showNotification(String(title), options);

        try {
          const nextBadgeCount = Number.isFinite(incomingBadgeCount)
            ? Math.max(0, incomingBadgeCount)
            : (await readStoredBadgeCount()) + (Number.isFinite(incrementBadgeBy) ? incrementBadgeBy : 1);

          await syncAppBadge(nextBadgeCount);
        } catch (badgeErr) {
          console.error('Failed to sync badge during push', badgeErr);
        }

        try {
          // Inform all open foreground clients so they can refresh state immediately
          const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of clientList) {
            client.postMessage({ type: 'PUSH_RECEIVED', payload: data });
          }
        } catch (msgErr) {
          console.error('Failed to postMessage to clients', msgErr);
        }
      })()
    );
  } catch (error) {
    console.error('Error handling push event:', error);
  }
});