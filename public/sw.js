// Termix registers a service worker in production. The demo has nothing to
// cache, so this one only takes over and steps aside.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
