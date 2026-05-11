/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Injected at build time by esbuild's define. In dev this is the unhashed
// fallback; in production build.mjs sets it to the content-hashed filename.
export default SOURCE_MAP_WORKER_PATH;
