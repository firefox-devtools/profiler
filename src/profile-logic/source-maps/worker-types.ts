/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  IndexIntoFuncTable,
  IndexIntoFrameTable,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';
import type { SourceMap } from './store';
import type { SourceMapSymbolicationInput } from './symbolication';

/**
 * Data sent from the main thread to the source map symbolication worker.
 * All values are structured-cloned (copied) across the thread boundary.
 */
export type WorkerInput = SourceMapSymbolicationInput & {
  resolvedSourceMaps: Map<IndexIntoSourceTable, SourceMap>;
  // Compiled source texts keyed by bundle source index.
  compiledSources: Map<IndexIntoSourceTable, string>;
};

/**
 * Resolved original location for a single frame. Line/column are 1-based
 * (Gecko convention). `originalSourceIndex` indexes into the response's
 * `originalSources` list; the apply step on the main thread adds a sources
 * table entry for it.
 */
export type FrameResolution = {
  originalSourceIndex: number;
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
 * An original source listed by a bundle's source map. `url` is the source's
 * URL as the source map gives it, which may be relative. Two bundles can list
 * the same URL for different files, so an original source is identified by
 * `generatedSource` (the bundle) and `url` together. `content` is null when
 * the source map didn't carry sourcesContent for this URL.
 */
export type OriginalSource = {
  generatedSource: IndexIntoSourceTable;
  url: string;
  content: string | null;
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
  // Original sources discovered during symbolication, each listed once. The
  // apply step adds a sources table entry for each one that an applied
  // result refers to.
  originalSources: OriginalSource[];
};

export type WorkerOutput =
  | { type: 'success'; response: SourceMapSymbolicationResponse }
  | { type: 'no-op' }
  | { type: 'error'; message: string };

/**
 * Runs the source map symbolication core and returns its output. The browser
 * default (`_runSourceMapWorker`) offloads to a Web Worker; other environments
 * (for example, profiler-cli node daemon) inject a runner that calls
 * `runSourceMapSymbolicationCore` directly.
 */
export type SourceMapRunner = (input: WorkerInput) => Promise<WorkerOutput>;
