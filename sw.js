/* ============================================================
   SERVICE WORKER — Cache-First with UI-Shell Fallback
   ============================================================ */
const CACHE_NAME = 'barber-cache-v2';
const SHELL_URL  = './index.html';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* ── INSTALL: pre-cache all shell assets ─────────────────── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch((err) => console.warn('[SW] Pre-cache failed:', err))
  );
  self.skipWaiting();
});

/* ── ACTIVATE: remove stale caches ──────────────────────── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .catch((err) => console.warn('[SW] Cache cleanup failed:', err))
  );
  self.clients.claim();
});

/* ── FETCH: Cache-First → Network → Shell Fallback ────────── */
self.addEventListener('fetch', (e) => {
  // Only intercept same-origin GET requests
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request)
      .then((cached) => {
        // 1. Cache hit — return immediately (Cache-First)
        if (cached) return cached;

        // 2. Cache miss — try the network
        return fetch(e.request)
          .then((networkRes) => {
            // Cache successful responses for next time
            if (networkRes && networkRes.ok) {
              const copy = networkRes.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(e.request, copy))
                .catch(() => {/* storage full — ignore */});
            }
            return networkRes;
          })
          .catch(() => {
            // 3. Offline and not cached — fall back to the UI shell
            //    so the user sees the app rather than a blank screen.
            return caches.match(SHELL_URL)
              .then((shell) => {
                if (shell) return shell;
                // Last resort: minimal offline response
                return new Response(
                  '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:2rem">' +
                  '<h2>📴 Offline</h2><p>Please reconnect and reload.</p></body></html>',
                  { headers: { 'Content-Type': 'text/html' } }
                );
              });
          });
      })
      .catch((err) => {
        console.warn('[SW] Fetch handler error:', err);
        return caches.match(SHELL_URL);
      })
  );
});

/* ── MESSAGE: allow clients to trigger cache refresh ─────── */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
