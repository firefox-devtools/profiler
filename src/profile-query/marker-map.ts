/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getThreadsKey } from 'firefox-profiler/profile-logic/profile-data';
import type {
  ThreadIndex,
  MarkerIndex,
  ThreadsKey,
} from 'firefox-profiler/types';

/**
 * Represents a marker identified by its thread and marker index.
 */
export type MarkerId = {
  threadIndexes: Set<ThreadIndex>;
  threadsKey: ThreadsKey;
  markerIndex: MarkerIndex;
};

/**
 * Maps marker handles (like "m-1", "m-2") to (threadIndex, markerIndex) pairs.
 * This provides a user-friendly way to reference markers in the CLI.
 *
 * Since each thread has its own marker list, we need to store both the thread
 * index and the marker index to uniquely identify a marker.
 */
export class MarkerMap {
  _handleToMarker: Map<string, MarkerId> = new Map();
  _nextHandleId: number = 1;

  /**
   * Get or create a handle for a marker.
   * Returns the same handle if called multiple times with the same marker.
   */
  handleForMarker(
    threadIndexes: Set<ThreadIndex>,
    markerIndex: MarkerIndex
  ): string {
    // Check if we already have a handle for this marker
    const threadsKey = getThreadsKey(threadIndexes);
    for (const [handle, markerId] of this._handleToMarker.entries()) {
      if (
        markerId.threadsKey === threadsKey &&
        markerId.markerIndex === markerIndex
      ) {
        return handle;
      }
    }

    // Create a new handle
    const handle = 'm-' + this._nextHandleId++;
    this._handleToMarker.set(handle, {
      threadIndexes,
      threadsKey,
      markerIndex,
    });
    return handle;
  }

  /**
   * Look up a marker by its handle.
   * Throws an error if the handle is unknown.
   */
  markerForHandle(markerHandle: string): MarkerId {
    const markerId = this._handleToMarker.get(markerHandle);
    if (markerId === undefined) {
      throw new Error(`Unknown marker ${markerHandle}`);
    }
    return markerId;
  }
}
