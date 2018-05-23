// @flow
import type {
  DOMEventMarkerPayload,
  UserTimingMarkerPayload,
  MarkerPayload,
} from '../types/markers';
import type {
  TracingMarker,
  MarkerTiming,
  MarkerTimingRows,
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
export function getMarkerTiming(
  tracingMarkers: TracingMarker[]
): MarkerTimingRows {
  // Each marker type will have it's own timing information, later collapse these into
  // a single array.
  const markerTimingsMap: Map<string, MarkerTiming[]> = new Map();

  // Go through all of the markers.
  for (
    let tracingMarkerIndex = 0;
    tracingMarkerIndex < tracingMarkers.length;
    tracingMarkerIndex++
  ) {
    const marker = tracingMarkers[tracingMarkerIndex];
    let markerTimingsByName = markerTimingsMap.get(marker.name);
    if (markerTimingsByName === undefined) {
      markerTimingsByName = [];
      markerTimingsMap.set(marker.name, markerTimingsByName);
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
          name: marker.name,
          length: 0,
        };
        markerTimingsByName.push(markerTimingsRow);
      }

      // Since the markers are sorted, look at the last added marker in this row. If
      // the new marker fits, go ahead and insert it.
      const otherEnd = markerTimingsRow.end[markerTimingsRow.length - 1];
      if (otherEnd === undefined || otherEnd <= marker.start) {
        markerTimingsRow.start.push(marker.start);
        markerTimingsRow.end.push(marker.start + marker.dur);
        markerTimingsRow.label.push(computeMarkerLabel(marker.data));
        markerTimingsRow.index.push(tracingMarkerIndex);
        markerTimingsRow.length++;
        break;
      }
    }
  }

  // Flatten out the map into a single array.
  return [].concat(...markerTimingsMap.values());
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
      default:
    }
  }

  return '';
}
