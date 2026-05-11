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
 * Must be built as a separate esbuild bundle (see sourceMapWorkerConfig
 * in scripts/lib/esbuild-configs.mjs) so that npm dependencies (@lezer/javascript,
 * source-map) are bundled into the worker output file.
 */

import { SourceMapStore } from './source-map-store';
import { symbolicateWithSourceMaps } from './source-map-symbolication';
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
  let sourceMapStore: SourceMapStore | null = null;
  try {
    const {
      resolvedSourceMaps,
      compiledSources,
      funcTable,
      frameTable,
      sourceMapInfo,
      sources,
      stringArray,
    } = e.data;

    const resolvedSourceMapsMap = new Map(resolvedSourceMaps);
    const compiledSourcesMap = new Map(compiledSources);

    sourceMapStore = await SourceMapStore.create(
      resolvedSourceMapsMap,
      mappingsWasmUrl
    );
    const result = symbolicateWithSourceMaps(
      { frameTable, funcTable, sourceMapInfo, sources, stringArray },
      sourceMapStore,
      compiledSourcesMap
    );

    if (result === null) {
      scope.postMessage({ type: 'no-op' } satisfies WorkerOutput);
      return;
    }

    const { newFuncTable, newFrameTable, newSourceMapInfo } = result;
    // `sources` and `stringArray` were mutated in place by _findOrCreateSource
    // and StringTable.withBackingArray during symbolicateWithSourceMaps.
    scope.postMessage({
      type: 'success',
      newFuncTable,
      newFrameTable,
      newSourceMapInfo,
      newSources: sources,
      newStringArray: stringArray,
    } satisfies WorkerOutput);
  } catch (err) {
    scope.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerOutput);
  } finally {
    if (sourceMapStore !== null) {
      sourceMapStore.destroy();
    }
  }
};
