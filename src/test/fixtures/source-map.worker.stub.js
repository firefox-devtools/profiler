/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test-only stub for src/profile-logic/source-map.worker.ts. The real worker
// bundles npm dependencies (lezer, source-map) into an IIFE via esbuild, so it
// can't be loaded directly from source by the node-worker fixture. Tests that
// actually exercise the worker's logic should mock the
// `actions/source-map-symbolication` module; this stub is the fallback that
// keeps the Worker spawn from leaking ENOENT errors and hanging tests when a
// dispatch slips through.

onmessage = () => {
  postMessage({ type: 'no-op' });
};
