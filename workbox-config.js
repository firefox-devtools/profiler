module.exports = {
  // All navigation that's not in the cache will respond the entry for /index.html. ("SPA" mode)
  navigateFallback: '/index.html',
  // Cleanup the caches from old workbox installations. This isn't useful
  // for us _now_ but this can be later for future versions.
  cleanupOutdatedCaches: true,
  // Our biggest asset in production is currently 1.34MB. Therefore 2MB in
  // production looks sensible (this is the default too).
  // If it's not cached then index.html is answered instead because of
  // navigateFallback, then everything it's broken.
  // In development we want to use a higher limit so that we don't hit the
  // limit. This isn't normally used but can be used when debugging the
  // service worker.
  maximumFileSizeToCacheInBytes:
    process.env.NODE_ENV === 'development' ? 10 * 1024 * 1024 : 2 * 1024 * 1024,
  // Don't append cache busting query strings to files whose filenames contain
  // hashes from the bundler.
  dontCacheBustURLsMatching: /\b[0-9a-f]{20}\./,
  // All scripts, including imported scripts, will be requested bypassing
  // HTTP cache, to determine if an update is needed, because we use
  // `updateViaCache: none` during the register. That's why we don't need to
  // use a hash or version in this file name.
  // For more information and background, see:
  // - discussion in https://github.com/w3c/ServiceWorker/issues/106
  // - chrome update in https://developer.chrome.com/blog/fresher-sw/
  // - step 8.21 in https://w3c.github.io/ServiceWorker/#update-algorithm
  importScripts: ['/service-worker-compat.js'],
  navigateFallbackDenylist: [
    // requests to docs and photon example pages shouldn't be redirected to
    // the index file as they're not part of the SPA
    /^\/docs(?:\/|$)/,
    /^\/photon(?:\/|$)/,
    // Allow navigating to source maps. This is not necessary, but it is
    // more developer friendly.
    /^\/[^/?]+\.map$/,
    // While excluding the service worker file isn't necessary to work, it's
    // convenient that we can just access it from a browser.
    /^\/sw\.js/,
  ],
  globDirectory: 'dist',
  globPatterns: ['**/*'],
  globIgnores: [
    // exclude user docs and photon from the cache
    'docs/**',
    'photon/**',
    // exclude also the netlify-specific files that aren't actually served
    // because this would fail the service worker installation
    '_headers',
    '_redirects',
    // do not cache source maps
    '**/*.map',
    // nor the service worker imported script
    'service-worker-compat.js',
  ],
  // This is the service worker file name. It should never change if we want
  // that the browser updates it. If this changes it will never be updated
  // and the user will be stuck with an old version.
  swDest: 'dist/sw.js',
};
