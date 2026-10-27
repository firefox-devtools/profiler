/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as path from 'path';
import { pathToFileURL } from 'url';
import { runSourceMapSymbolicationCore } from 'firefox-profiler/profile-logic/source-maps/symbolication';

import type {
  WorkerInput,
  WorkerOutput,
} from 'firefox-profiler/profile-logic/source-maps/worker-types';

/**
 * Node replacement for the browser's `_runSourceMapWorker`. The daemon has no
 * `Worker`, so it runs the symbolication core directly on the current thread
 * (blocking is fine in a background process).
 *
 * The `source-map` package's Node build reads `lib/mappings.wasm` from
 * `path.join(__dirname, 'mappings.wasm')` and its `initialize` is a no-op, so
 * the `wasmUrl` we pass here is effectively ignored at runtime. We still pass a
 * `__dirname`-relative path: when bundled by esbuild both this module and
 * `source-map`'s reader share the same `__dirname`, and the build step copies
 * `mappings.wasm` next to the bundle (see scripts/build-profiler-cli.mjs).
 */
export async function runSourceMapSymbolicationNode(
  input: WorkerInput
): Promise<WorkerOutput> {
  const wasmUrl = pathToFileURL(path.join(__dirname, 'mappings.wasm')).href;
  return runSourceMapSymbolicationCore(input, wasmUrl);
}
