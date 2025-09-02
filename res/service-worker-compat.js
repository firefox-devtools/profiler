/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file will be imported into the workbox-powered service worker.
// It acts as a small compatibility layer so that the new service worker
// understands offline-plugin's way of requesting to skip waiting.
// See this code in the old plugin:
// https://github.com/NekR/offline-plugin/blob/2b51a89aba53fcf1603786f86a75e6f25fd03721/tpls/runtime-template.js#L198
// https://github.com/NekR/offline-plugin/blob/2b51a89aba53fcf1603786f86a75e6f25fd03721/src/misc/sw-template.js#L346

// Support offline-plugin's way of applying updates.
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    console.log(
      "We received a message from the old offline-plugin runtime code, let's switch to the new service worker."
    );
    self.skipWaiting();
  }
});

// Cleanup offline-plugin's storage
// This is the cache name prefix for the old service worker.
const OFFLINE_PLUGIN_PREFIX = 'webpack-offline:';

// The code in these 2 functions was heavily inspired by workbox' own code.
async function cleanupOfflinePluginStorage() {
  const cacheNames = await self.caches.keys();
  const cacheNamesToDelete = cacheNames.filter((cacheName) =>
    cacheName.startsWith(OFFLINE_PLUGIN_PREFIX)
  );
  await Promise.all(
    cacheNamesToDelete.map((cacheName) => self.caches.delete(cacheName))
  );
  return cacheNamesToDelete;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    cleanupOfflinePluginStorage().then((cachesDeleted) => {
      {
        if (cachesDeleted.length > 0) {
          console.log(
            `The following out-of-date precaches from the old offline-plugin-based service worker were cleaned up automatically:`,
            cachesDeleted
          );
        }
      }
    })
  );
});
