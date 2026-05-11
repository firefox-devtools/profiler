/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  FuncTable,
  FrameTable,
  IndexIntoSourceTable,
  SourceLocationTable,
  SourceTable,
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
 * Data sent back from the worker to the main thread.
 * On success, the new tables replace the profile's shared tables in Redux state.
 */
export type WorkerOutput =
  | {
      type: 'success';
      newFuncTable: FuncTable;
      newFrameTable: FrameTable;
      newSourceLocationTable: SourceLocationTable;
      // Sources and stringArray may have new entries appended by _findOrCreateSource.
      newSources: SourceTable;
      newStringArray: string[];
    }
  | { type: 'no-op' }
  | { type: 'error'; message: string };
