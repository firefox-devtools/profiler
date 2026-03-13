/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { ThreadIndex } from 'firefox-profiler/types';

/**
 * Maps thread handles (like "t-0", "t-1") to thread indices.
 * This provides a user-friendly way to reference threads in the CLI.
 * Supports multi-thread handles like "t-4,t-2,t-6" for selecting multiple threads.
 */
export class ThreadMap {
  _map: Map<string, ThreadIndex> = new Map();

  handleForThreadIndex(threadIndex: ThreadIndex): string {
    const handle = 't-' + threadIndex;
    if (!this._map.has(handle)) {
      this._map.set(handle, threadIndex);
    }
    return handle;
  }

  threadIndexForHandle(threadHandle: string): ThreadIndex {
    const threadIndex = this._map.get(threadHandle);
    if (threadIndex === undefined) {
      throw new Error(`Unknown thread ${threadHandle}`);
    }
    return threadIndex;
  }

  threadIndexesForHandle(threadHandle: string): Set<ThreadIndex> {
    const handles = threadHandle.split(',').map((s) => s.trim());
    const indices = handles.map((handle) => {
      const idx = this._map.get(handle);
      if (idx === undefined) {
        throw new Error(`Unknown thread ${handle}`);
      }
      return idx;
    });
    return new Set(indices);
  }

  handleForThreadIndexes(threadIndexes: Set<ThreadIndex>): string {
    const sorted = Array.from(threadIndexes).sort((a, b) => a - b);
    return sorted.map((idx) => this.handleForThreadIndex(idx)).join(',');
  }
}
