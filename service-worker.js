// Bails Service Worker — Offline PWA (Spark Edition)
// Push notifications removed — requires Cloud Functions (Blaze).
//
// IMPORTANT — CACHE VERSIONING:
// CACHE_NAME below MUST be bumped on every deploy that changes any JS/CSS file.
// It is intentionally tied to the app version shown in Settings (Utils.APP_VERSION).
// Without bumping this string, returning users can be stuck on OLD cached JS
// indefinitely — the browser only checks for SW updates by diffing this file's
// bytes, so if this string never changes, the old service worker (and its old
// cache) never gets replaced, even after a fresh `firebase deploy`.
const CACHE_NAME = 'bails-v28-spark';

const STATIC_ASSETS = [
  '/', '/index.html', '/css/main.css',
  '/js/config.js', '/js/utils.js', '/js/auth.js', '/js/router.js',
  '/js/liveCricketConfig.js', '/js/liveCricket.js', '/js/app.js',
  '/js/pages/landing.js', '/js/pages/legal.js', '/js/pages/dashboard.js',
  '/js/pages/search.js', '/js/pages/my-matches.js', '/js/pages/tournaments.js',
  '/js/pages/tournament-detail.js', '/js/pages/team-detail.js',
  '/js/pages/match-detail.js', '/js/pages/match-scoring.js',
  '/js/pages/profile.js', '/js/pages/player-profile.js', '/js/pages/live-cricket.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('cloudflare') ||
      url.hostname.includes('ip-api') ||
      url.hostname.includes('vercel.app') ||
      url.hostname.includes('cricapi.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request).then(cached => cached || caches.match('/index.html'))
      )
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-deliveries') {
    e.waitUntil(syncPendingDeliveries());
  }
});

async function syncPendingDeliveries() {
  console.log('[SW] Background sync: checking pending deliveries…');
}
