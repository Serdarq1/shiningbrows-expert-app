self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Simple network-first fetch to allow offline fallback later if needed
self.addEventListener("fetch", () => {
  // no-op: keeping default network behavior, but SW is registered for PWA install
});
