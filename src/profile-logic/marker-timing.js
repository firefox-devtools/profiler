/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import type {
  CategoryList,
  Marker,
  MarkerIndex,
  MarkerTiming,
  MarkerTimingAndBuckets,
} from 'firefox-profiler/types';

// Arbitrarily set an upper limit for adding marker depths, avoiding an infinite loop.
const MAX_STACKING_DEPTH = 300;

/**
 * This function computes the timing information for laying out the markers in the
 * MarkerChart component. Each marker is put into a single row based on its name. In
 * addition they are grouped by "buckets", which is based off of their category.
 * This structure is a simple array, as it makes it very easy to loop through the
 * fixed height rows in the canvas, and draw only what is in view.
 *
 * e.g. An array of 15 markers named either "A", "B", or "C" would be translated into
 *      something that looks like:
 *
 *  [
 *    "DOM", // The bucket.
 *    {
 *      name: "A",
 *      start: [0, 23, 35, 65, 75],
 *      end: [1, 25, 37, 67, 77],
 *      index: [0, 2, 5, 6, 8],
 *      label: ["Aye", "Aye", "Aye", "Aye", "Aye"]
 *      bucket: "DOM"
 *    }
 *    {
 *      name: "B",
 *      start: [1, 28, 39, 69, 70],
 *      end: [2, 29, 49, 70, 77],
 *      index: [1, 3, 7, 9, 10],
 *      label: ["Bee", "Bee", "Bee", "Bee", "Bee"]
 *      bucket: "DOM"
 *    }
 *    "Other", // The bucket.
 *    {
 *      name: "C",
 *      start: [10, 33, 45, 75, 85],
 *      end: [11, 35, 47, 77, 87],
 *      index: [4, 11, 12, 13, 14],
 *      label: ["Sea", "Sea", "Sea", "Sea", "Sea"]
 *      bucket: "Other"
 *    }
 *  ]
 *
 * If a marker of a name has timings that overlap in a single row, then it is broken
 * out into multiple rows, with the overlapping timings going in the next rows. The
 * getMarkerTiming tests show the behavior of how this works in practice.
 *
 * This structure allows the markers to easily be laid out like this example below:
 *    ____________________________________________
 *   |              | GC/CC                       | <- Bucket, represented as a `string`
 *   | GCMajor      | *---------------------*     | <- MarkerTimingRow
 *   | GCMinor      | *--*       *--*        *--* | <- MarkerTimingRow
 *   |              | DOM                         | <- Bucket
 *   | User Timings |    *----------------*       | <- MarkerTimingRow
 *   | User Timings |       *------------*        | <- MarkerTimingRow
 *   | User Timings |       *--*     *---*        | <- MarkerTimingRow
 *   |______________|_____________________________|
 */
export function getMarkerTimingAndBuckets(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  // Categories can be null for things like Network Markers, where we don't care to
  // break things up by category.
  getLabel: MarkerIndex => string,
  categories: ?CategoryList
): MarkerTimingAndBuckets {
  // Each marker type will have it's own timing information, later collapse these into
  // a single array.
  const markerTimingsMap: Map<string, MarkerTiming[]> = new Map();

  // Go through all of the markers.
  for (const markerIndex of markerIndexes) {
    const marker = getMarker(markerIndex);

    let markerTimingsByName = markerTimingsMap.get(marker.name);
    if (markerTimingsByName === undefined) {
      markerTimingsByName = [];
      markerTimingsMap.set(marker.name, markerTimingsByName);
    }

    // Place the marker in the closest row that is empty.
    for (let i = 0; i < MAX_STACKING_DEPTH; i++) {
      const bucketName = categories ? categories[marker.category].name : 'None';

      // Get or create a row for marker timings.
      let markerTiming = markerTimingsByName[i];
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
        markerTimingsByName.push(markerTiming);
      }

      // Since the markers are sorted, look at the last added marker in this row. If
      // the new marker fits, go ahead and insert it.
      const otherEnd = markerTiming.end[markerTiming.length - 1];
      if (otherEnd === undefined || otherEnd <= marker.start) {
        markerTiming.start.push(marker.start);
        markerTiming.end.push(
          // If this is an instant marker, the start time and end time will match.
          // The chart will then be responsible for drawing this as a dot.
          marker.end === null ? marker.start : marker.end
        );
        markerTiming.label.push(getLabel(markerIndex));
        markerTiming.index.push(markerIndex);
        markerTiming.length++;
        break;
      }
    }
  }

  // Flatten out the map into a single array.
  const allMarkerTimings = [].concat(...markerTimingsMap.values());

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
  markerIndexes: MarkerIndex[],
  getLabel: MarkerIndex => string
): MarkerTiming[] {
  // Flow didn't understand the filter operation here, so filter out bucket names
  // imperatively.
  const onlyTiming = [];
  for (const timingOrString of getMarkerTimingAndBuckets(
    getMarker,
    markerIndexes,
    getLabel
  )) {
    if (typeof timingOrString !== 'string') {
      onlyTiming.push(timingOrString);
    }
  }
  return onlyTiming;
}
