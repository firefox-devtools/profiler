/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { oneLine } from 'common-tags';
import { INTERVAL_START, INTERVAL_END } from '../app-logic/constants';
import {
  getRawMarkerTableBuilder,
  finishRawMarkerTableBuilder,
} from './data-structures';
import { ensureExists } from '../utils/types';
import type { StringTable } from '../utils/string-table';
import type {
  IndexIntoStringTable,
  MarkerPayload,
  MarkerPhase,
  MarkerSchema,
  Milliseconds,
  RawMarkerTable,
} from 'firefox-profiler/types';

export const compositorScreenshotMarkerSchema: MarkerSchema = {
  name: 'CompositorScreenshot',
  display: ['marker-chart', 'marker-table'],
  fields: [
    {
      key: 'url',
      label: 'Image',
      format: {
        type: 'screenshot-data-url',
        sizeFieldForAspectRatio: 'windowSize',
      },
    },
    { key: 'windowSize', label: 'Window Size', format: 'screenshot-size' },
    { key: 'windowID', label: 'Window ID', format: 'string' },
  ],
  description: oneLine`
    This marker spans the time between each composite of a window and shows
    the window contents during that time.
  `,
};

/**
 * Gecko emits one instant marker per composite of a window, plus a
 * CompositorScreenshotWindowDestroyed marker when the window goes away.
 * Each screenshot is valid until the next one for the same window, so rewrite
 * them into start / end marker pairs.
 * A window that is never destroyed keeps its last screenshot open,
 * so that marker gets extended to the end of the thread.
 *
 * Returns null when the table has no screenshot markers.
 */
export function convertScreenshotMarkersToStartEnd(
  markers: RawMarkerTable,
  stringTable: StringTable
): RawMarkerTable | null {
  const hasScreenshots = markers.data.some(
    (data) => data !== null && data.type === 'CompositorScreenshot'
  );
  if (!hasScreenshots) {
    return null;
  }

  const newMarkers = getRawMarkerTableBuilder();
  const { threadId } = markers;
  if (threadId !== undefined) {
    newMarkers.threadId = [];
  }
  const openWindows = new Set<string>();

  function push(
    name: IndexIntoStringTable,
    startTime: Milliseconds | null,
    endTime: Milliseconds | null,
    phase: MarkerPhase,
    sourceIndex: number,
    data: MarkerPayload | null
  ) {
    newMarkers.name.push(name);
    newMarkers.startTime.push(startTime);
    newMarkers.endTime.push(endTime);
    newMarkers.phase.push(phase);
    newMarkers.category.push(markers.category[sourceIndex]);
    newMarkers.data.push(data);
    if (threadId !== undefined) {
      ensureExists(newMarkers.threadId).push(threadId[sourceIndex]);
    }
    newMarkers.length++;
  }

  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (data === null || data.type !== 'CompositorScreenshot') {
      push(
        markers.name[i],
        markers.startTime[i],
        markers.endTime[i],
        markers.phase[i],
        i,
        data
      );
      continue;
    }

    const { windowID } = data;
    const time = markers.startTime[i];
    const name = stringTable.indexForString(`CompositorScreenshot ${windowID}`);
    const isWindowDestroyed =
      stringTable.getString(markers.name[i]) ===
      'CompositorScreenshotWindowDestroyed';
    if (openWindows.delete(windowID) || isWindowDestroyed) {
      // The end marker carries the payload type so that code walking the raw table
      // can recognize it during sanitization.
      push(name, null, time, INTERVAL_END, i, {
        type: 'CompositorScreenshot',
        windowID,
      });
    }
    if (isWindowDestroyed) {
      continue;
    }

    push(name, time, null, INTERVAL_START, i, data);
    openWindows.add(windowID);
  }

  return finishRawMarkerTableBuilder(newMarkers);
}
