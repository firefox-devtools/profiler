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

// Arbitrarily set an upper limit for adding marker depths, avoiding very long
// overlapping marker timings.
const MAX_STACKING_DEPTH = 300;

/**
 * This function computes the timing information for laying out the markers in the
 * MarkerChart component. Each marker is put into a single row based on its name. In
 * addition they are grouped by "buckets", which is based off of their category.
 * This structure is a simple array, as it makes it very easy to loop through the
 * fixed height rows in the canvas, and draw only what is in view.
 *
 * e.g. An array of 20 markers named either "A", "B", or "C" would be translated into
 *      something that looks like:
 *
 *  [
 *    {
 *      name: "A",
 *      start: [0, 23, 35, 65, 75],
 *      end: [1, 25, 37, 67, 77],
 *      index: [0, 2, 5, 6, 8],
 *      bucket: "DOM",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *    { // First line of B markers
 *      name: "B",
 *      start: [1, 28, 39, 69, 70],
 *      end: [2, 29, 49, 70, 77],
 *      index: [1, 3, 7, 9, 10],
 *      bucket: "DOM",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *    { // Second line of B markers
 *      name: "B",
 *      start: [1, 28, 39, 69, 70],
 *      end: [2, 29, 49, 70, 77],
 *      index: [1, 3, 7, 9, 10],
 *      bucket: "DOM",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *    {
 *      name: "C",
 *      start: [10, 33, 45, 75, 85],
 *      end: [11, 35, 47, 77, 87],
 *      index: [4, 11, 12, 13, 14],
 *      bucket: "Other",
 *      instantOnly: false,
 *      length: 5,
 *    },
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
 *
 * Note that the bucket names aren't present as a result of this function,
 * they're inserted in `getMarkerTimingAndBuckets`.
 */
export function getMarkerTiming(
  getMarker: (MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  // Categories can be null for things like Network Markers, where we don't care to
  // break things up by category.
  categories: ?CategoryList
): MarkerTiming[] {
  // Each marker type will have it's own timing information, later collapse these into
  // a single array.
  const intervalMarkerTimingsMap: Map<string, MarkerTiming[]> = new Map();
  // Instant markers are on separate lines.
  const instantMarkerTimingsMap: Map<string, MarkerTiming> = new Map();

  // Go through all of the markers.
  for (const markerIndex of markerIndexes) {
    const marker = getMarker(markerIndex);

    const addCurrentMarkerToMarkerTiming = (markerTiming: MarkerTiming) => {
      markerTiming.start.push(marker.start);
      markerTiming.end.push(
        // If this is an instant marker, the start time and end time will match.
        // The chart will then be responsible for drawing this differently.
        marker.end === null ? marker.start : marker.end
      );
      markerTiming.index.push(markerIndex);
      markerTiming.length++;
    };

    const bucketName = categories ? categories[marker.category].name : 'None';

    // We want to group all network requests in the same line. Indeed they all
    // have different names and they'd end up with one single request in each
    // line without this special handling.
    const markerLineName =
      marker.data && marker.data.type === 'Network'
        ? 'Network Requests'
        : marker.name;

    const emptyTiming = ({ instantOnly }): MarkerTiming => ({
      start: [],
      end: [],
      index: [],
      name: markerLineName,
      bucket: bucketName,
      instantOnly,
      isFirstRowOfName: false,
      length: 0,
    });

    if (marker.end === null) {
      // This is an instant marker.
      let instantMarkerTiming = instantMarkerTimingsMap.get(markerLineName);
      if (!instantMarkerTiming) {
        instantMarkerTiming = emptyTiming({ instantOnly: true });
        instantMarkerTimingsMap.set(markerLineName, instantMarkerTiming);
      }
      addCurrentMarkerToMarkerTiming(instantMarkerTiming);
      continue;
    }

    // This is an interval marker.
    let markerTimingsForName = intervalMarkerTimingsMap.get(markerLineName);
    if (markerTimingsForName === undefined) {
      markerTimingsForName = [];
      intervalMarkerTimingsMap.set(markerLineName, markerTimingsForName);
    }

    // Find the first row where the new marker fits.
    // Since the markers are sorted, look at the last added marker in this row. If
    // the new marker fits, go ahead and insert it.
    const foundMarkerTiming = markerTimingsForName.find(
      (markerTiming) =>
        markerTiming.end[markerTiming.length - 1] <= marker.start
    );

    if (foundMarkerTiming) {
      addCurrentMarkerToMarkerTiming(foundMarkerTiming);
      continue;
    }

    if (markerTimingsForName.length >= MAX_STACKING_DEPTH) {
      // There are too many markers stacked around the same time already, let's
      // ignore this marker.
      continue;
    }

    // Otherwise, let's add a new row!
    const newTiming = emptyTiming({ instantOnly: false });
    addCurrentMarkerToMarkerTiming(newTiming);
    markerTimingsForName.push(newTiming);
    continue;
  }

  // Flatten out the maps into a single array.
  // One item in this array is one line in the drawn canvas.
  const allMarkerTimings = [...instantMarkerTimingsMap.values()].concat(
    ...intervalMarkerTimingsMap.values()
  );

  // Sort all the marker timings in place, first by the bucket, then by their names.
  allMarkerTimings.sort((a, b) => {
    if (a.bucket !== b.bucket) {
      // Sort by buckets first.
      // Show the 'Test' category first. Test markers are almost guaranteed to
      // be the most relevant when they exist.
      if (a.bucket === 'Test') {
        return -1;
      }
      if (b.bucket === 'Test') {
        return 1;
      }
      // Put the 'Other' category last.
      if (a.bucket === 'Other') {
        return 1;
      }
      if (b.bucket === 'Other') {
        return -1;
      }
      // Sort alphabetically for the remaining categories.
      return a.bucket > b.bucket ? 1 : -1;
    }
    if (a.name === b.name) {
      // These 2 lines are for the same marker name.

      // The instant markers need to come first.
      if (a.instantOnly) {
        return -1;
      }
      if (b.instantOnly) {
        return 1;
      }

      // Otherwise keep the original ordering.
      return 0;
    }

    // Put network requests at the end of the Network category.
    if (a.bucket === 'Network') {
      if (a.name === 'Network Requests') {
        return 1;
      }
      if (b.name === 'Network Requests') {
        return -1;
      }
    }

    // Sort by names second
    return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
  });

  // Compute isFirstRowOfName for all rows.
  let prevRowName = null;
  for (let i = 0; i < allMarkerTimings.length; i++) {
    const markerTiming = allMarkerTimings[i];
    if (typeof markerTiming === 'string') {
      prevRowName = null;
      continue;
    }

    const rowName = markerTiming.name;
    markerTiming.isFirstRowOfName = rowName !== prevRowName;
    prevRowName = rowName;
  }

  return allMarkerTimings;
}

/**
 * This function builds on `getMarkerTiming` above, inserting the bucket names
 * that are plain strings as items in the result array.
 *
 * Reusing the previous example of an array of 20 markers named either "A", "B",
 * or "C", this is the result we'd get:
 *
 *  [
 *    "DOM", // The bucket, inserted by this function after `getMarkerTiming`.
 *    {
 *      name: "A",
 *      start: [0, 23, 35, 65, 75],
 *      end: [1, 25, 37, 67, 77],
 *      index: [0, 2, 5, 6, 8],
 *      bucket: "DOM",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *    {
 *      name: "B",
 *      start: [1, 28, 39, 69, 70],
 *      end: [2, 29, 49, 70, 77],
 *      index: [1, 3, 7, 9, 10],
 *      bucket: "DOM",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *    { // Second line of B markers
 *      name: "B",
 *      start: [1, 28, 39, 69, 70],
 *      end: [2, 29, 49, 70, 77],
 *      index: [1, 3, 7, 9, 10],
 *      bucket: "DOM",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *    "Other", // The bucket.
 *    {
 *      name: "C",
 *      start: [10, 33, 45, 75, 85],
 *      end: [11, 35, 47, 77, 87],
 *      index: [4, 11, 12, 13, 14],
 *      bucket: "Other",
 *      instantOnly: false,
 *      length: 5,
 *    },
 *  ]
 */
export function getMarkerTimingAndBuckets(
  getMarker: (MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  // Categories can be null for things like Network Markers, where we don't care to
  // break things up by category.
  categories: ?CategoryList
): MarkerTimingAndBuckets {
  const allMarkerTimings = getMarkerTiming(
    getMarker,
    markerIndexes,
    categories
  );

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
