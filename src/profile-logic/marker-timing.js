/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import type { CategoryList } from '../types/profile';
import type {
  DOMEventMarkerPayload,
  UserTimingMarkerPayload,
  MarkerPayload,
  TextMarkerPayload,
} from '../types/markers';
import type {
  Marker,
  MarkerIndex,
  MarkerTiming,
  MarkerTimingAndBuckets,
} from '../types/profile-derived';

// Arbitrarily set an upper limit for adding marker depths, avoiding an infinite loop.
const MAX_STACKING_DEPTH = 300;

/**
 * This function computes the timing information for laying out the markers in the
 * MarkerChart component. Each marker is put into a single row based on its name.
 *
 * e.g. An array of 15 markers named either "A", "B", or "C" would be translated into
 *      something that looks like:
 *
 *  [
 *    {
 *      name: "A",
 *      start: [0, 23, 35, 65, 75],
 *      end: [1, 25, 37, 67, 77],
 *      index: [0, 2, 5, 6, 8],
 *      label: ["Aye", "Aye", "Aye", "Aye", "Aye"]
 *    }
 *    {
 *      name: "B",
 *      start: [1, 28, 39, 69, 70],
 *      end: [2, 29, 49, 70, 77],
 *      index: [1, 3, 7, 9, 10],
 *      label: ["Bee", "Bee", "Bee", "Bee", "Bee"]
 *    }
 *    {
 *      name: "C",
 *      start: [10, 33, 45, 75, 85],
 *      end: [11, 35, 47, 77, 87],
 *      index: [4, 11, 12, 13, 14],
 *      label: ["Sea", "Sea", "Sea", "Sea", "Sea"]
 *    }
 *  ]
 *
 * If a marker of a name has timings that overlap in a single row, then it is broken
 * out into multiple rows, with the overlapping timings going in the next rows. The
 * getMarkerTiming tests show the behavior of how this works in practice.
 *
 * This structure allows the markers to easily be laid out like this example below:
 *    ____________________________________________
 *   | GC           | *--*       *--*        *--* |
 *   |              |                             |
 *   | Scripts      | *---------------------*     |
 *   |              |                             |
 *   | User Timings |    *----------------*       |
 *   | User Timings |       *------------*        |
 *   | User Timings |       *--*     *---*        |
 *   |______________|_____________________________|
 */
export function getMarkerTimingAndBuckets(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  // Categories can be null for things like Network Markers, where we don't care to
  // break things up by category.
  categories: ?CategoryList
): MarkerTimingAndBuckets {
  // Each marker type will have it's own timing information, later collapse these into
  // a single array.
  type MarkerTimingsByName = Map<string, MarkerTiming[]>;
  const markerTimingsBuckets: Map<string, MarkerTimingsByName> = new Map();
  const allMarkerTimings = [];

  // Go through all of the markers.
  for (const markerIndex of markerIndexes) {
    const marker = getMarker(markerIndex);

    // Look up a bucket of marker timings, this breaks each marker into coarse group
    // levels.
    const bucketName = categories ? categories[marker.category].name : 'None';
    let markerTimingsBucket = markerTimingsBuckets.get(bucketName);
    if (markerTimingsBucket === undefined) {
      markerTimingsBucket = new Map();
      markerTimingsBuckets.set(bucketName, markerTimingsBucket);
    }

    // Inside this bucket, look if marker timings already exist, if not, create a new
    // list of marker timings.
    let markerTimings = markerTimingsBucket.get(marker.name);
    if (markerTimings === undefined) {
      markerTimings = [];
      markerTimingsBucket.set(marker.name, markerTimings);
    }

    // Place the marker in the closest row that is empty.
    for (let i = 0; i < MAX_STACKING_DEPTH; i++) {
      // Get or create a row for marker timings.
      let markerTiming = markerTimings[i];
      if (!markerTiming) {
        markerTiming = {
          start: [],
          end: [],
          index: [],
          label: [],
          name: marker.name,
          bucket: bucketName,
          length: 0,
        };
        markerTimings.push(markerTiming);
        allMarkerTimings.push(markerTiming);
      }

      // Since the markers are sorted, look at the last added marker in this row. If
      // the new marker fits, go ahead and insert it.
      const otherEnd = markerTiming.end[markerTiming.length - 1];
      if (otherEnd === undefined || otherEnd <= marker.start) {
        markerTiming.start.push(marker.start);
        markerTiming.end.push(marker.start + marker.dur);
        markerTiming.label.push(computeMarkerLabel(marker.data));
        markerTiming.index.push(markerIndex);
        markerTiming.length++;
        break;
      }
    }
  }

  // Sort all the marker timings in place, first by the bucket, then by their names.
  allMarkerTimings.sort((a, b) => {
    if (a.bucket !== b.bucket) {
      // Sort by buckets first.
      if (a.bucket === 'Other') {
        return 1;
      }
      if (b.bucket === 'Other') {
        return -1;
      }
      return a.bucket > b.bucket ? 1 : -1;
    }
    if (a.name === b.name) {
      // Keep the original ordering if the names are the same.
      return 0;
    }
    // Sort by names second
    return a.name > b.name ? 1 : -1;
  });

  // Interleave the bucket names in between the marker timings.
  const markerTimingsAndBuckets: MarkerTimingAndBuckets = [];
  let prevBucket;
  for (const markerTiming of allMarkerTimings) {
    if (markerTiming.bucket !== prevBucket) {
      markerTimingsAndBuckets.push(markerTiming.bucket);
      prevBucket = markerTiming.bucket;
    }
    markerTimingsAndBuckets.push(markerTiming);
  }

  return markerTimingsAndBuckets;
}

export function getMarkerTiming(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[]
): MarkerTiming[] {
  // Flow didn't understand the filter operation here, so filter out bucket names
  // imperatively.
  const onlyTiming = [];
  for (const timingOrString of getMarkerTimingAndBuckets(
    getMarker,
    markerIndexes
  )) {
    if (typeof timingOrString !== 'string') {
      onlyTiming.push(timingOrString);
    }
  }
  return onlyTiming;
}

function computeMarkerLabel(data: MarkerPayload): string {
  // Satisfy flow's type checker.
  if (data !== null && typeof data === 'object') {
    // Handle different marker payloads.
    switch (data.type) {
      case 'UserTiming':
        return (data: UserTimingMarkerPayload).name;
      case 'tracing':
        if (data.category === 'DOMEvent') {
          return (data: DOMEventMarkerPayload).eventType;
        }
        break;
      case 'Text':
        return (data: TextMarkerPayload).name;
      default:
    }
  }

  return '';
}
