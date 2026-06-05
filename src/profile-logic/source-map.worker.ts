/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Web Worker entry point for source map symbolication.
 *
 * Receives a WorkerInput (all profile tables needed by symbolicateWithSourceMaps),
 * runs @lezer/javascript parsing + source-map lookups off the main thread, and
 * posts back a WorkerOutput with the updated tables.
 *
 * Must be built as a separate esbuild bundle (see sourceMapWorkerConfig) so
 * that npm dependencies are bundled into the worker output file.
 */

import { runSourceMapSymbolicationCore } from './source-map-symbolication';
import type { WorkerInput, WorkerOutput } from './source-map-worker-types';

// Override the `self` type: in the browser this file runs as a DedicatedWorker,
// but TypeScript's DOM lib types `self` as `Window & typeof globalThis`.
// We only need the onmessage setter and postMessage for the worker protocol.
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerInput>) => void) | null;
  postMessage: (message: WorkerOutput) => void;
  location: Location;
}
const scope = self as unknown as WorkerScope;

// Resolve mappings.wasm relative to this worker bundle's URL. The wasm is
// copied alongside the worker output by the esbuild copy plugin, so this
// works under both root and subpath deploys.
const mappingsWasmUrl = new URL('mappings.wasm', scope.location.href).href;

scope.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const output = await runSourceMapSymbolicationCore(e.data, mappingsWasmUrl);
  scope.postMessage(output);
};
