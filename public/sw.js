// Deliberately conservative. The job here is installability and a shell that
// opens without a signal — not offline editing, which would mean queuing writes
// and reconciling them against realtime, a much bigger promise than this app
// needs to make today.
//
// Everything is network-first: a stale bundle is a worse bug than a slow load,
// and grade math changing under you is worse still. The cache is only ever a
// fallback for "the dorm wifi dropped".

const CACHE = 'cadence-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-maskable.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll rejects the whole batch if any single request fails, which would
      // leave the worker uninstalled over one missing icon.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Supabase, fonts, anything not ours: leave it entirely alone. Caching API
  // responses here would show a stale grade with no way to tell it was stale.
  if (url.origin !== self.location.origin) return;

  // A navigation always tries the network first so a deploy lands immediately;
  // the cached shell only appears when there's genuinely no connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Static assets are content-hashed by Vite, so a cache hit is always the
  // right answer for that exact URL.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
