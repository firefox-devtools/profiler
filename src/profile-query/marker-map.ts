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
  _markerToHandle: Map<string, string> = new Map();
  _nextHandleId: number = 1;

  /**
   * Get or create a handle for a marker.
   * Returns the same handle if called multiple times with the same marker.
   */
  handleForMarker(
    threadIndexes: Set<ThreadIndex>,
    markerIndex: MarkerIndex
  ): string {
    const threadsKey = getThreadsKey(threadIndexes);
    const reverseKey = `${threadsKey}:${markerIndex}`;
    const existing = this._markerToHandle.get(reverseKey);
    if (existing !== undefined) {
      return existing;
    }

    // Create a new handle
    const handle = 'm-' + this._nextHandleId++;
    this._handleToMarker.set(handle, {
      threadIndexes,
      threadsKey,
      markerIndex,
    });
    this._markerToHandle.set(reverseKey, handle);
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

/** Matches a single marker handle, e.g. "m-42". */
const MARKER_HANDLE_RE = /^m-(\d+)$/;

/** Matches an inclusive marker handle range, e.g. "m-42..m-45" or "m-42..45". */
const MARKER_RANGE_RE = /^m-(\d+)\.\.(?:m-)?(\d+)$/;

/** A range wider than this is rejected as a probable typo. */
export const MAX_MARKER_RANGE_SIZE = 256;

/**
 * Expand marker handle specs ("m-42", "m-42..m-45", "m-1,m-3..m-5") into a flat
 * list of handles, dropping duplicates. Ranges expand numerically, so one that
 * overruns its listing resolves into unrelated markers rather than failing.
 */
export function expandMarkerHandleSpecs(specs: string[]): string[] {
  return expandMarkerHandleSpecsDetailed(specs).handles;
}

/**
 * As `expandMarkerHandleSpecs`, but also reports which specs were multi-element
 * ranges, so a caller can check what they resolved to.
 */
export function expandMarkerHandleSpecsDetailed(specs: string[]): {
  handles: string[];
  ranges: string[];
} {
  const handles: string[] = [];
  const ranges: string[] = [];
  const seen = new Set<string>();
  const push = (handle: string) => {
    if (!seen.has(handle)) {
      seen.add(handle);
      handles.push(handle);
    }
  };

  for (const rawSpec of specs) {
    for (const spec of rawSpec.split(',')) {
      const trimmed = spec.trim();
      if (trimmed === '') {
        continue;
      }

      const range = MARKER_RANGE_RE.exec(trimmed);
      if (range) {
        const start = parseInt(range[1], 10);
        const end = parseInt(range[2], 10);
        if (end < start) {
          throw new Error(
            `Invalid marker range ${trimmed}: end m-${end} is before start m-${start}`
          );
        }
        const size = end - start + 1;
        if (size > MAX_MARKER_RANGE_SIZE) {
          throw new Error(
            `Marker range ${trimmed} covers ${size} handles, more than the ` +
              `maximum of ${MAX_MARKER_RANGE_SIZE}. Narrow the range, or pass ` +
              `the handles you want individually.`
          );
        }
        if (end > start) {
          ranges.push(trimmed);
        }
        for (let id = start; id <= end; id++) {
          push(`m-${id}`);
        }
        continue;
      }

      if (MARKER_HANDLE_RE.test(trimmed)) {
        push(trimmed);
        continue;
      }

      throw new Error(
        `Invalid marker handle ${trimmed}: expected a handle like m-42 or a range like m-42..m-45`
      );
    }
  }

  return { handles, ranges };
}
