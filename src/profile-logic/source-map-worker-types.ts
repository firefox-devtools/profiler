/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  FuncTable,
  FrameTable,
  IndexIntoSourceTable,
  SourceMapInfoTable,
  SourceTable,
} from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';

/**
 * Data sent from the main thread to the source map symbolication worker.
 * All values are structured-cloned (copied) across the thread boundary.
 */
export type WorkerInput = {
  // Source maps serialized as [sourceIndex, sourceMap] pairs.
  resolvedSourceMaps: Array<[IndexIntoSourceTable, RawSourceMap]>;
  // Compiled source texts serialized as [sourceIndex, text] pairs.
  compiledSources: Array<[IndexIntoSourceTable, string]>;
  // Full profile shared tables needed by symbolicateWithSourceMaps.
  funcTable: FuncTable;
  frameTable: FrameTable;
  sourceMapInfo: SourceMapInfoTable;
  sources: SourceTable;
  stringArray: string[];
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
      newSourceMapInfo: SourceMapInfoTable;
      // Sources and stringArray may have new entries appended by _findOrCreateSource.
      newSources: SourceTable;
      newStringArray: string[];
    }
  | { type: 'no-op' }
  | { type: 'error'; message: string };
