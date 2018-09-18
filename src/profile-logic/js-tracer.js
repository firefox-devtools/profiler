/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { JsTracerTable } from '../types/profile';
import type { JsTracerTiming } from '../types/profile-derived';

import { ensureExists } from '../utils/flow';

// Arbitrarily set an upper limit for adding marker depths, avoiding an infinite loop.
const MAX_STACKING_DEPTH = 300;

export function getJsTracerTiming({
  events: tracerEvents,
  stringTable,
}: JsTracerTable): JsTracerTiming[] {
  // Each marker type will have it's own timing information, later collapse these into
  // a single array.
  const jsTracerTimingMap: Map<string, JsTracerTiming[]> = new Map();

  // Go through all of the markers.
  for (
    let tracerEventIndex = 0;
    tracerEventIndex < tracerEvents.length;
    tracerEventIndex++
  ) {
    const name = stringTable.getString(tracerEvents.events[tracerEventIndex]);
    let markerTimingsByName = jsTracerTimingMap.get(name);
    if (markerTimingsByName === undefined) {
      markerTimingsByName = [];
      jsTracerTimingMap.set(name, markerTimingsByName);
    }

    // Place the marker in the closest row that is empty.
    for (let i = 0; i < MAX_STACKING_DEPTH; i++) {
      // Get or create a row for marker timings.
      let markerTimingsRow = markerTimingsByName[i];
      if (!markerTimingsRow) {
        markerTimingsRow = {
          start: [],
          end: [],
          index: [],
          label: [],
          name: name,
          length: 0,
        };
        markerTimingsByName.push(markerTimingsRow);
      }

      const start = tracerEvents.timestamps[tracerEventIndex] / 1000;
      const duration = 0;

      // Since the markers are sorted, look at the last added marker in this row. If
      // the new marker fits, go ahead and insert it.
      const otherEnd = markerTimingsRow.end[markerTimingsRow.length - 1];
      if (otherEnd === undefined || otherEnd <= start) {
        markerTimingsRow.start.push(start);
        markerTimingsRow.end.push(start + duration);
        markerTimingsRow.label.push(name);
        markerTimingsRow.index.push(tracerEventIndex);
        markerTimingsRow.length++;
        break;
      }
    }
  }

  const isUrl = /:\/\//;
  // Sort the URLs last.
  const keys = [...jsTracerTimingMap.keys()].sort((a, b) => {
    const isUrlA = isUrl.test(a);
    const isUrlB = isUrl.test(b);
    if (isUrlA === isUrlB) {
      return a > b ? 1 : -1;
    }
    return isUrlA ? 1 : -1;
  });

  const jsTracerTiming = [];
  for (const key of keys) {
    jsTracerTiming.push(...ensureExists(jsTracerTimingMap.get(key)));
  }
  return jsTracerTiming;
}
