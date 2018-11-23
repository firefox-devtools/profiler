/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  GCMinorMarker,
  GCSliceMarker,
  GCMajorMarker,
  Marker,
  GCStats,
  PauseInfo,
} from '../types/profile-derived';
import type { Milliseconds } from '../types/units';
import * as stats from 'simple-statistics';

function pauseInfo(durations: Milliseconds[]): PauseInfo | null {
  if (durations.length === 0) {
    return null;
  }

  durations.sort((a, b) => a - b);

  const total = durations.reduce((a, b) => a + b, 0);
  let max = stats.maxSorted(durations);
  if (!max) {
    max = 0;
  }

  return {
    numberOfPauses: durations.length,
    meanPause: total / durations.length,
    stdDev: stats.standardDeviation(durations),
    medianPause: stats.medianSorted(durations),
    p90Pause: stats.quantileSorted(durations, 0.9),
    maxPause: max,
    totalPaused: total,
  };
}

function _toDurations<T>(markers: Marker<T>[]): Milliseconds[] {
  return markers.map(m => m.dur);
}

export function computeGCStats(
  minorMarkers: GCMinorMarker[],
  sliceMarkers: GCSliceMarker[],
  majorMarkers: GCMajorMarker[]
): GCStats {
  return {
    minorPauses: pauseInfo(_toDurations(minorMarkers)),
    slicePauses: pauseInfo(_toDurations(sliceMarkers)),
    allPauses: pauseInfo(
      _toDurations(minorMarkers).concat(_toDurations(sliceMarkers))
    ),
    numMajor: majorMarkers.length,
  };
}
