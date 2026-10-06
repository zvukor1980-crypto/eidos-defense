/* Scoped offline cache. Fresh code online, saved code offline; no API caching. */
const VERSION = 'eidos-v2-20261006-pairs1';
const PREFIX = 'eidos-';
const ASSETS = ["./", "index.html", "styles.css", "game.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "studio/config.js", "studio/studio.js", "studio/studio.css", "studio/looks/look-01.webp", "studio/looks/look-02.webp", "studio/looks/look-03.webp", "studio/looks/look-04.webp", "studio/looks/look-05.webp", "studio/looks/look-06.webp", "studio/looks/look-07.webp", "studio/looks/look-08.webp", "studio/looks/look-09.webp", "studio/looks/look-10.webp"];
const SHELL = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
async function network(request, cache, key, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, {cache: 'no-cache', signal: controller.signal});
    if (response.ok && response.type !== 'opaque') await cache.put(key, response.clone());
    return response;
  } finally { clearTimeout(timer); }
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope) || /\/api(?:\/|$)/.test(url.pathname)) return;
  const navigation = request.mode === 'navigate';
  const fresh = navigation || /\.(?:html|js|css|json|webmanifest)$/.test(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, {ignoreSearch: true});
    if (!fresh && cached) return cached;
    try { return await network(request, cache, request, 4500); }
    catch {
      if (cached) return cached;
      if (navigation) { const shell = await cache.match(SHELL); if (shell) return shell; }
      return Response.error();
    }
  })());
});
