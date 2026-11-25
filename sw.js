// Service Worker: hält die App-Dateien vor, damit sie schnell startet
// und als App auf dem Home-Bildschirm funktioniert. Daten kommen immer live aus der Datenbank.
const CACHE = "sws-aufgaben-v6";
const SHELL = ["./", "index.html", "app.css", "app.js", "config.js", "logo.jpg",
  "manifest.webmanifest", "lib/supabase.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Erst Netz (immer aktuelle Version), bei Funkloch aus dem Speicher.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
