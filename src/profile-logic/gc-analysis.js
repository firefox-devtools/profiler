/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  GCMinorMarker,
  GCSliceMarker,
  GCMajorMarker,
  GCStats,
} from '../types/profile-derived';

export function computeGCStats(
  minorMarkers: GCMinorMarker[],
  sliceMarkers: GCSliceMarker[],
  majorMarkers: GCMajorMarker[]
): GCStats {
  return {
    numMinor: minorMarkers.length,
    numSlice: sliceMarkers.length,
    numMajor: majorMarkers.length,
  };
}
