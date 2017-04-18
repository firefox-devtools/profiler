import type { TracingMarker, MarkerTiming, MarkerTimingRows } from '../common/types/profile-derived';

export function getMarkerTiming(tracingMarkers: TracingMarker[]): MarkerTimingRows {
  // Each marker type will have it's own timing information, later collapse these into
  // a single array.
  const markerTimingsMap: Map<string, MarkerTiming[]> = new Map();

  // Go through all of the markers.
  for (let tracingMarkerIndex = 0; tracingMarkerIndex < tracingMarkers.length; tracingMarkerIndex++) {
    const marker = tracingMarkers[tracingMarkerIndex];
    let markerTimingsByName = markerTimingsMap.get(marker.name);
    if (markerTimingsByName === undefined) {
      markerTimingsByName = [];
      markerTimingsMap.set(marker.name, markerTimingsByName);
    }

    // Place the marker in the closest row that is empty.
    markerTimingsLoop: for (let i = 0; true; i++) {
      // Get or create a row for marker timings.
      let markerTimingsRow = markerTimingsByName[i];
      if (!markerTimingsRow) {
        markerTimingsRow = {
          start: [],
          end: [],
          index: [],
          name: marker.name,
          length: 0,
        };
        markerTimingsByName.push(markerTimingsRow);
      }

      // Search for a spot not already taken up by another marker of this type.
      otherMarkerLoop: for (let j = 0; j < markerTimingsRow.length; j++) {
        const otherStart = markerTimingsRow.start[j];
        const otherEnd = markerTimingsRow.end[j];
        if (otherStart > marker.start + marker.dur) {
          break otherMarkerLoop;
        }
        if (otherEnd > marker.start) {
          continue markerTimingsLoop;
        }
      }

      // An empty spot was found, fill the values in the table.
      markerTimingsRow.start.push(marker.start);
      markerTimingsRow.end.push(marker.start + marker.dur);
      markerTimingsRow.index.push(tracingMarkerIndex);
      markerTimingsRow.length++;
      break;
    }
  }

  // Flatten out the map into an array.
  let markerTimingRows = [];
  for (const [, value] of markerTimingsMap) {
    markerTimingRows = markerTimingRows.concat(value);
  }
  return markerTimingRows;
}
