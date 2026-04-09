/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Build-time constants injected by the build script.
 */

// This global is defined via esbuild's define option.
declare const __BUILD_HASH__: string;

/**
 * Unique hash for this build, used to detect version mismatches
 * between client and daemon.
 */
export const BUILD_HASH = __BUILD_HASH__;
