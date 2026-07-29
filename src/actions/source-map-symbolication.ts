/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getRawProfileSharedData } from 'firefox-profiler/selectors';
import { applySourceMapSymbolicationResponse } from 'firefox-profiler/profile-logic/source-map-symbolication';
import {
  getSourcesWithSourceMapURL,
  parseSourceMapFileContents,
  matchSourceMapToSource,
} from 'firefox-profiler/profile-logic/source-map-matching';

import type {
  WorkerInput,
  WorkerOutput,
} from 'firefox-profiler/profile-logic/source-map-worker-types';
import type { IndexIntoSourceTable, ThunkAction } from 'firefox-profiler/types';
import type { EligibleSource } from 'firefox-profiler/profile-logic/source-map-matching';
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
export type SourceMapSymbolicationResult = 'applied' | 'no-match' | 'error';

export function doSourceMapSymbolication(
  resolvedSourceMaps: Map<IndexIntoSourceTable, RawSourceMap>,
  compiledSources: Map<IndexIntoSourceTable, string>
): ThunkAction<Promise<SourceMapSymbolicationResult>> {
  return async (dispatch, getState) => {
    if (resolvedSourceMaps.size === 0) {
      return 'no-match';
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

    dispatch({ type: 'START_SOURCE_MAP_SYMBOLICATION' });
    const result = await _runSourceMapWorker(input);
    switch (result.type) {
      case 'success': {
        // Apply against the current shared state (not the snapshot the worker
        // received), so concurrent worker runs compose instead of stomping
        // each other's results.
        const currentShared = getRawProfileSharedData(getState());
        const applied = applySourceMapSymbolicationResponse(
          currentShared,
          result.response
        );
        if (applied === null) {
          dispatch({ type: 'SOURCE_MAP_SYMBOLICATION_FAILED' });
          return 'no-match';
        }
        dispatch({
          type: 'BULK_SOURCE_MAP_SYMBOLICATION',
          newFuncTable: applied.newFuncTable,
          newFrameTable: applied.newFrameTable,
          newSourceLocationTable: applied.newSourceLocationTable,
          newSources: applied.newSources,
          newStringArray: applied.newStringArray,
        });
        return 'applied';
      }
      case 'error':
        console.warn('Source map worker error:', result.message);
        dispatch({ type: 'SOURCE_MAP_SYMBOLICATION_FAILED' });
        return 'error';
      case 'no-op':
        dispatch({ type: 'SOURCE_MAP_SYMBOLICATION_FAILED' });
        return 'no-match';
      default:
        throw assertExhaustiveCheck(result);
    }
  };
}

/**
 * The ways applying a user-supplied `.map` file can fail.
 */
export type ApplySourceMapError =
  | 'invalid-source-map'
  | 'no-eligible-sources'
  | 'symbolication-failed';

/**
 * The outcome of applying a user-supplied `.map` file to the profile.
 */
export type ApplySourceMapFileResult =
  // `filename` is the resolved bundle source the map was applied to, so the UI
  // can show which source was matched (auto-matched or user-picked).
  | { type: 'applied'; filename: string }
  | { type: 'no-match'; filename: string }
  | { type: 'ambiguous'; candidates: EligibleSource[] }
  | { type: 'error'; error: ApplySourceMapError };

/**
 * Apply a source map file that the user selected from disk. Parses the file,
 * auto-matches it to a bundle source (unless `sourceIndex` is provided, e.g.
 * after the user disambiguated in the picker), and feeds it into the existing
 * source map symbolication pipeline.
 */
export function applySourceMapFile(
  fileName: string,
  fileContents: string,
  // Set when the user picked a bundle in the picker; skips auto-matching.
  sourceIndex?: IndexIntoSourceTable
): ThunkAction<Promise<ApplySourceMapFileResult>> {
  return async (dispatch, getState) => {
    const map = parseSourceMapFileContents(fileContents);
    if (map === null) {
      return { type: 'error', error: 'invalid-source-map' };
    }

    const shared = getRawProfileSharedData(getState());

    let targetSourceIndex: IndexIntoSourceTable;
    if (sourceIndex !== undefined) {
      targetSourceIndex = sourceIndex;
    } else {
      const eligible = getSourcesWithSourceMapURL(
        shared.sources,
        shared.stringArray
      );
      const result = matchSourceMapToSource(map, fileName, eligible);
      switch (result.type) {
        case 'no-eligible-sources':
          return { type: 'error', error: 'no-eligible-sources' };
        case 'ambiguous':
          return { type: 'ambiguous', candidates: result.candidates };
        case 'match':
          targetSourceIndex = result.sourceIndex;
          break;
        default:
          throw assertExhaustiveCheck(result);
      }
    }

    const filename =
      shared.stringArray[shared.sources.filename[targetSourceIndex]];

    // Feed the bundle's stored content as the compiled source when we have it,
    // which enables full scope-tree name resolution.
    const compiledContent = shared.sources.content[targetSourceIndex];
    const compiledSources =
      compiledContent !== null
        ? new Map([[targetSourceIndex, compiledContent]])
        : new Map<IndexIntoSourceTable, string>();

    const outcome = await dispatch(
      doSourceMapSymbolication(
        new Map([[targetSourceIndex, map]]),
        compiledSources
      )
    );
    switch (outcome) {
      case 'applied':
        return { type: 'applied', filename };
      case 'no-match':
        return { type: 'no-match', filename };
      case 'error':
        return { type: 'error', error: 'symbolication-failed' };
      default:
        throw assertExhaustiveCheck(outcome);
    }
  };
}

/**
 * Spawn a one-shot source map worker, send it the input, and return the
 * output. The worker is terminated once a response is received or an error
 * occurs. Uses the same on-demand spawn pattern as gz.browser.ts.
 *
 * Debugging tip: to step through symbolication from the page DevTools, paste
 * the snippet below over this function body. It runs the same core on the
 * main thread (blocking, debug only). The worker no longer mutates its
 * input, so no defensive cloning is needed here.
 *
 *   const { runSourceMapSymbolicationCore } = await import(
 *     'firefox-profiler/profile-logic/source-map-symbolication'
 *   );
 *   const wasmUrl = new URL('/mappings.wasm', window.location.href).href;
 *   return runSourceMapSymbolicationCore(input, wasmUrl);
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
