/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  IndexIntoFuncTable,
  IndexIntoFrameTable,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';
import type { SourceMapSymbolicationInput } from './source-map-symbolication';

/**
 * Data sent from the main thread to the source map symbolication worker.
 * All values are structured-cloned (copied) across the thread boundary.
 */
export type WorkerInput = SourceMapSymbolicationInput & {
  resolvedSourceMaps: Map<IndexIntoSourceTable, RawSourceMap>;
  // Compiled source texts keyed by bundle source index.
  compiledSources: Map<IndexIntoSourceTable, string>;
};

/**
 * Resolved original location for a single frame. Line/column are 1-based
 * (Gecko convention). `originalSource` is a URL string; the apply step on
 * the main thread looks it up against the current sources table.
 */
export type FrameResolution = {
  originalSource: string;
  originalLine: number;
  originalColumn: number;
};

/**
 * Resolved original location plus optional function name for a single func.
 * `name` is null when no name could be determined, in which case the existing
 * funcTable.name entry is kept.
 */
export type FuncResolution = FrameResolution & {
  name: string | null;
};

/**
 * Opaque, position-keyed worker result. The apply step on the main thread
 * (applySourceMapSymbolicationResponse) consumes this plus the current shared
 * tables to produce new ones.
 *
 * Modeled like a symbolication API response: the worker doesn't allocate
 * source-table or originalLocation indices, and doesn't intern strings. That
 * bookkeeping happens main-side against the latest state, so concurrent
 * worker runs compose correctly instead of one's stale snapshot stomping
 * another's result.
 */
export type SourceMapSymbolicationResponse = {
  // Funcs the worker resolved. Funcs not in this map keep their existing data.
  // JS source-map symbolication never adds funcs, so funcIndex stays stable
  // across concurrent runs.
  funcResults: Map<IndexIntoFuncTable, FuncResolution>;
  // Same idea for frames.
  frameResults: Map<IndexIntoFrameTable, FrameResolution>;
  // Original sources discovered during symbolication, keyed by URL. content
  // is null when the source map didn't carry sourcesContent for this URL.
  // The apply step dedupes URLs against the current sources table.
  originalSources: Map<string, { content: string | null }>;
};

export type WorkerOutput =
  | { type: 'success'; response: SourceMapSymbolicationResponse }
  | { type: 'no-op' }
  | { type: 'error'; message: string };
