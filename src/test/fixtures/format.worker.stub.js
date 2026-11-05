/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test-only stub for src/profile-logic/js-format/format.worker.ts. The real
// worker bundles npm dependencies (lezer) into an IIFE via esbuild, so it
// can't be loaded directly from source by the node-worker fixture. Tests that
// exercise formatting should mock the
// `profile-logic/js-format/run-format-worker` module. This stub is the
// fallback that keeps the Worker spawn from failing when a dispatch slips
// through.

onmessage = () => {
  postMessage({ type: 'error', message: 'The format worker is a stub.' });
};
