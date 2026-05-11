/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getRawProfileSharedData } from 'firefox-profiler/selectors';

import type {
  WorkerInput,
  WorkerOutput,
} from 'firefox-profiler/profile-logic/source-map-worker-types';
import type { IndexIntoSourceTable, ThunkAction } from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

/**
 * Run source map symbolication using previously-fetched source maps from Redux
 * state. Offloads source parsing and source-map lookups to a dedicated Web
 * Worker so the main thread stays responsive.
 *
 * Reads the current profile from Redux state at dispatch time. Callers must
 * ensure native symbolication has already committed its changes before
 * dispatching this action, so that JS symbolication builds on the final state.
 *
 * `compiledSources` maps bundle IndexIntoSourceTable values to compiled source
 * text (fetched alongside the source maps). Used for scope-tree-based function
 * name resolution.
 */
export function doSourceMapSymbolication(
  resolvedSourceMaps: Map<IndexIntoSourceTable, RawSourceMap>,
  compiledSources: Map<IndexIntoSourceTable, string>
): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    if (resolvedSourceMaps.size === 0) {
      return;
    }

    const shared = getRawProfileSharedData(getState());

    const input: WorkerInput = {
      resolvedSourceMaps,
      compiledSources,
      funcTable: shared.funcTable,
      frameTable: shared.frameTable,
      sourceLocationTable: shared.sourceLocationTable,
      sources: shared.sources,
      stringArray: shared.stringArray,
    };

    const result = await _runSourceMapWorker(input);
    switch (result.type) {
      case 'success':
        dispatch({
          type: 'BULK_SOURCE_MAP_SYMBOLICATION',
          newFuncTable: result.newFuncTable,
          newFrameTable: result.newFrameTable,
          newSourceLocationTable: result.newSourceLocationTable,
          newSources: result.newSources,
          newStringArray: result.newStringArray,
        });
        break;
      case 'error':
        console.warn('Source map worker error:', result.message);
        break;
      case 'no-op':
        break;
      default:
        throw assertExhaustiveCheck(result);
    }
  };
}

/**
 * Spawn a one-shot source map worker, send it the input, and return the
 * output. The worker is terminated once a response is received or an error
 * occurs. Uses the same on-demand spawn pattern as gz.browser.ts.
 */
function _runSourceMapWorker(input: WorkerInput): Promise<WorkerOutput> {
  return new Promise((resolve) => {
    const reportError = (err: unknown): void => {
      resolve({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    };

    let worker: Worker;
    try {
      worker = new Worker(SOURCE_MAP_WORKER_PATH);
    } catch (err) {
      reportError(err);
      return;
    }

    worker.onmessage = (e: MessageEvent<WorkerOutput>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e: ErrorEvent) => {
      resolve({
        type: 'error',
        message: e.error?.message ?? e.message ?? 'Source map worker failed',
      });
      worker.terminate();
    };

    try {
      worker.postMessage(input);
    } catch (err) {
      reportError(err);
      worker.terminate();
    }
  });
}
