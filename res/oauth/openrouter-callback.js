/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// OpenRouter redirects the sign-in popup here with the code. Hand it to the
// profiler tab that started the sign-in, see
// src/app-logic/profile-chat/providers/openrouter-auth.ts. This is a separate
// file because the Content-Security-Policy doesn't allow inline scripts.

(function () {
  const params = new URLSearchParams(window.location.search);
  const channel = new BroadcastChannel('profiler-openrouter-auth');
  channel.postMessage({
    code: params.get('code'),
    state: params.get('state'),
  });
  channel.close();
  // Drop the code from the history and the address bar.
  window.history.replaceState(null, '', window.location.pathname);
  window.close();
  // Only reached when the browser doesn't let the page close itself.
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('message').textContent =
      'You can close this window and go back to the profiler.';
  });
})();
