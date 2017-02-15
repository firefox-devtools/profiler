/**
 * This is the service worker that the existing service worker on
 * new.cleopatra.io will update to. The only purpose of this service worker
 * is to clear the cached resources and pass through all network requests
 * so that navigation requests will receive the server's "redirect" response
 * and everybody just gets redirected to perf-html.io.
 */

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    // Remove all caches.
    return Promise.all(keys.map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    if (self.clients && self.clients.claim) {
      return self.clients.claim();
    }
  }));
});

self.addEventListener('message', function (e) {
  var data = e.data;
  if (data && data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
