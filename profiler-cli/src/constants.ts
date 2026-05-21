/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Build-time constants injected by the build script.
 */

// These globals are defined via esbuild's define option.
declare const __BUILD_HASH__: string;
declare const __VERSION__: string;

/**
 * Unique hash for this build, used to detect version mismatches
 * between client and daemon.
 */
export const BUILD_HASH = __BUILD_HASH__;

/**
 * Package version from profiler-cli/package.json, injected at build time.
 */
export const VERSION = __VERSION__;
