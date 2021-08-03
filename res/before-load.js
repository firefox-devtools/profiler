/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
{
  if (window.location.host === 'perf-html.io') {
    // Unregister service workers, and redirect. This can't be done with a 301 redirect
    // because the service worker will only show the old page.
    (async () => {
      const { serviceWorker } = navigator;
      if (serviceWorker) {
        // Remove the service worker.
        const registrations = await serviceWorker.getRegistrations();
        for (const registration of registrations) {
          registration.unregister();
        }
      }
      const url = new URL('https://profiler.firefox.com');
      url.pathname = window.location.pathname;
      url.search = window.location.search;
      url.hash = window.location.hash;

      // Redirect.
      window.location.replace(url.href);
    })();
  }

  // Register the analytics.
  const doNotTrack =
    (navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack) === '1';

  if(!doNotTrack && window.location.host.includes('profiler.firefox.com')) {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
    // If changing this tracker ID, update it in the end user docs as well.
    ga('create', 'UA-35433268-81', 'auto');
  }
}
