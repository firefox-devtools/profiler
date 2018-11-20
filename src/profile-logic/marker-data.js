/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  SamplesTable,
  MarkersTable,
  IndexIntoStringTable,
} from '../types/profile';
import type { TracingMarker } from '../types/profile-derived';
import type { BailoutPayload, ScreenshotPayload } from '../types/markers';
import type { StartEndRange } from '../types/units';
import type { UniqueStringArray } from '../utils/unique-string-array';
import { getNumberPropertyOrNull } from '../utils/flow';

/**
 * Jank instances are created from responsiveness values. Responsiveness is a profiler
 * feature that can be turned on and off. When on, every sample includes a responsiveness
 * value.
 *
 * This timing is captured by instrumenting the event queue. A runnable is added to the
 * browser's event queue, then the profiler times how long it takes to come back.
 * Generally, if this takes longer than some threshold, then this can be jank for the
 * browser.
 *
 * This function converts those measurings of milliseconds into individual tracing
 * markers.
 *
 * For instance, take an array of responsiveness values:
 *
 *   [5, 25, 33, 3, 23, 42, 65, 71, 3, 10, 22, 31, 42, 3, 20, 40]
 *           |___|              |___|              |___|
 *     Runnable is reset    Jank of 71ms. The      Runnable reset under threshold.
 *     but under 50ms,      responsiveness was
 *     no jank.             reset from 71 to 3.
 */
export function getJankInstances(
  samples: SamplesTable,
  thresholdInMs: number
): TracingMarker[] {
  const addTracingMarker = () =>
    jankInstances.push({
      start: lastTimestamp - lastResponsiveness,
      dur: lastResponsiveness,
      title: `${lastResponsiveness.toFixed(2)}ms event processing delay`,
      name: 'Jank',
      data: null,
    });

  let lastResponsiveness: number = 0;
  let lastTimestamp: number = 0;
  const jankInstances = [];
  for (let i = 0; i < samples.length; i++) {
    const currentResponsiveness = samples.responsiveness[i];
    if (currentResponsiveness === null || currentResponsiveness === undefined) {
      // Ignore anything that's not numeric. This can happen if there is no responsiveness
      // information, or if the sampler failed to collect a responsiveness value. This
      // can happen intermittently.
      //
      // See Bug 1506226.
      continue;
    }
    if (currentResponsiveness < lastResponsiveness) {
      if (lastResponsiveness >= thresholdInMs) {
        addTracingMarker();
      }
    }
    lastResponsiveness = currentResponsiveness;
    lastTimestamp = samples.time[i];
  }
  if (lastResponsiveness >= thresholdInMs) {
    addTracingMarker();
  }
  return jankInstances;
}

export function getSearchFilteredTracingMarkers(
  markers: TracingMarker[],
  searchString: string
): TracingMarker[] {
  if (!searchString) {
    return markers;
  }
  const lowerCaseSearchString = searchString.toLowerCase();
  const newMarkers: TracingMarker[] = [];
  for (const marker of markers) {
    const { data, name } = marker;
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes(lowerCaseSearchString)) {
      newMarkers.push(marker);
      continue;
    }
    if (data && typeof data === 'object') {
      if (
        typeof data.eventType === 'string' &&
        data.eventType.toLowerCase().includes(lowerCaseSearchString)
      ) {
        // Match DOMevents data.eventType
        newMarkers.push(marker);
        continue;
      }
      if (
        typeof data.name === 'string' &&
        data.name.toLowerCase().includes(lowerCaseSearchString)
      ) {
        // Match UserTiming's name.
        newMarkers.push(marker);
        continue;
      }
      if (
        typeof data.category === 'string' &&
        data.category.toLowerCase().includes(lowerCaseSearchString)
      ) {
        // Match UserTiming's name.
        newMarkers.push(marker);
        continue;
      }
    }
  }
  return newMarkers;
}

/**
 * This function takes a marker that packs in a marker payload into the string of the
 * name. This extracts that and turns it into a payload.
 */
export function extractMarkerDataFromName(
  markers: MarkersTable,
  stringTable: UniqueStringArray
): MarkersTable {
  const newMarkers: MarkersTable = {
    data: markers.data.slice(),
    name: markers.name.slice(),
    time: markers.time.slice(),
    length: markers.length,
  };

  // Match: "Bailout_MonitorTypes after add on line 1013 of self-hosted:1008"
  // Match: "Bailout_TypeBarrierO at jumptarget on line 1490 of resource://devtools/shared/base-loader.js -> resource://devtools/client/shared/vendor/immutable.js:1484"
  const bailoutRegex =
    // Capture groups:
    //       type   afterAt    where        bailoutLine  script functionLine
    //        ↓     ↓          ↓                  ↓        ↓    ↓
    /^Bailout_(\w+) (after|at) ([\w _-]+) on line (\d+) of (.*):(\d+)$/;

  // Match: "Invalidate resource://devtools/shared/base-loader.js -> resource://devtools/client/shared/vendor/immutable.js:3662"
  // Match: "Invalidate self-hosted:4032"
  const invalidateRegex =
    // Capture groups:
    //         url    line
    //           ↓    ↓
    /^Invalidate (.*):(\d+)$/;

  const bailoutStringIndex = stringTable.indexForString('Bailout');
  const invalidationStringIndex = stringTable.indexForString('Invalidate');
  for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    const nameIndex = markers.name[markerIndex];
    const time = markers.time[markerIndex];
    const name = stringTable.getString(nameIndex);
    let matchFound = false;
    if (name.startsWith('Bailout_')) {
      matchFound = true;
      const match = name.match(bailoutRegex);
      if (!match) {
        console.error(`Could not match regex for bailout: "${name}"`);
      } else {
        const [
          ,
          type,
          afterAt,
          where,
          bailoutLine,
          script,
          functionLine,
        ] = match;
        newMarkers.name[markerIndex] = bailoutStringIndex;
        newMarkers.data[markerIndex] = ({
          type: 'Bailout',
          bailoutType: type,
          where: afterAt + ' ' + where,
          script: script,
          bailoutLine: +bailoutLine,
          functionLine: +functionLine,
          startTime: time,
          endTime: time,
        }: BailoutPayload);
      }
    } else if (name.startsWith('Invalidate ')) {
      matchFound = true;
      const match = name.match(invalidateRegex);
      if (!match) {
        console.error(`Could not match regex for bailout: "${name}"`);
      } else {
        const [, url, line] = match;
        newMarkers.name[markerIndex] = invalidationStringIndex;
        newMarkers.data[markerIndex] = {
          type: 'Invalidation',
          url,
          line,
          startTime: time,
          endTime: time,
        };
      }
    }
    if (matchFound && markers.data[markerIndex]) {
      console.error(
        "A marker's payload was rewritten based off the text content of the marker. " +
          "perf.html assumed that the payload was empty, but it turns out it wasn't. " +
          'This is most likely an error and should be fixed. The marker name is:',
        name
      );
    }
  }

  return newMarkers;
}

export function getTracingMarkers(
  markers: MarkersTable,
  stringTable: UniqueStringArray
): TracingMarker[] {
  const tracingMarkers: TracingMarker[] = [];
  // This map is used to track start and end markers for tracing markers.
  const openMarkers: Map<IndexIntoStringTable, TracingMarker[]> = new Map();
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (!data) {
      // Add a marker with a zero duration
      const marker = {
        start: markers.time[i],
        dur: 0,
        name: stringTable.getString(markers.name[i]),
        title: null,
        data: null,
      };
      tracingMarkers.push(marker);
    } else if (data.type === 'tracing' && data.interval) {
      // Tracing markers are created from two distinct markers that are created at
      // the start and end of whatever code that is running that we care about.
      // This is implemented by AutoProfilerTracing in Gecko.
      //
      // In this function we convert both of these raw markers into a single
      // tracing marker with a non-null duration.
      //
      // We also handle nested markers by assuming markers of the same type are
      // never interwoven: given input markers startA, startB, endC, endD, we'll
      // get 2 markers A-D and B-C.

      const time = markers.time[i];
      const nameStringIndex = markers.name[i];
      if (data.interval === 'start') {
        let markerBucket = openMarkers.get(nameStringIndex);
        if (markerBucket === undefined) {
          markerBucket = [];
          openMarkers.set(nameStringIndex, markerBucket);
        }

        markerBucket.push({
          start: time,
          name: stringTable.getString(nameStringIndex),
          dur: 0,
          title: null,
          data,
        });
      } else if (data.interval === 'end') {
        const markerBucket = openMarkers.get(nameStringIndex);
        let marker;
        if (markerBucket && markerBucket.length) {
          // We already encountered a matching "start" marker for this "end".
          marker = markerBucket.pop();
        } else {
          // No matching "start" marker has been encountered before this "end",
          // this means it was issued before the capture started. Here we create
          // a fake "start" marker to create the final tracing marker.
          // Note we won't have additional data (eg the cause stack) for this
          // marker because that data is contained in the "start" marker.

          const nameStringIndex = markers.name[i];

          marker = {
            start: -1, // Something negative so that we can distinguish it later
            name: stringTable.getString(nameStringIndex),
            dur: 0,
            title: null,
            data,
          };
        }
        if (marker.start !== undefined) {
          marker.dur = time - marker.start;
        }
        tracingMarkers.push(marker);
      }
    } else {
      // `data` here is a union of different shaped objects, that may or not have
      // certain properties. Flow doesn't like us arbitrarily accessing properties
      // that may not exist, so use a utility function to generically get the data out.
      const startTime = getNumberPropertyOrNull(data, 'startTime');
      const endTime = getNumberPropertyOrNull(data, 'endTime');

      if (startTime !== null && endTime !== null) {
        // Construct a tracing marker with a duration if these properties exist.
        const name = stringTable.getString(markers.name[i]);
        const duration = endTime - startTime;
        tracingMarkers.push({
          start: startTime,
          dur: duration,
          name,
          data,
          title: null,
        });
      } else {
        // Ensure all markers are converted to tracing markers, even if they have no
        // more timing information. This ensures that markers can be filtered by time
        // in a consistent manner.
        tracingMarkers.push({
          start: markers.time[i],
          dur: 0,
          name: stringTable.getString(markers.name[i]),
          data,
          title: null,
        });
      }
    }
  }

  // Loop over tracing "start" markers without any "end" markers
  for (const markerBucket of openMarkers.values()) {
    for (const marker of markerBucket) {
      marker.dur = Infinity;
      tracingMarkers.push(marker);
    }
  }

  tracingMarkers.sort((a, b) => a.start - b.start);
  return tracingMarkers;
}

export function filterTracingMarkersToRange(
  tracingMarkers: TracingMarker[],
  rangeStart: number,
  rangeEnd: number
): TracingMarker[] {
  return tracingMarkers.filter(
    tm => tm.start < rangeEnd && tm.start + tm.dur >= rangeStart
  );
}

export function isNetworkMarker(marker: TracingMarker): boolean {
  return !!(marker.data && marker.data.type === 'Network');
}

export function filterForNetworkChart(markers: TracingMarker[]) {
  return markers.filter(marker => isNetworkMarker(marker));
}

export function filterForMarkerChart(markers: TracingMarker[]) {
  return markers.filter(marker => !isNetworkMarker(marker));
}
// Firefox emits separate start and end markers for each load. It does this so that,
// if a profile is collected while a request is in progress, the profile will still contain
// a start marker for that request. So by looking at start markers we can get
// information about requests that were in progress at profile collection time.
// For requests that have finished, we want to merge the request's start and end
// markers into one marker.
export function mergeStartAndEndNetworkMarker(
  markers: TracingMarker[]
): TracingMarker[] {
  const sortedMarkers: TracingMarker[] = markers.slice(0);
  const filteredMarkers: TracingMarker[] = [];

  // Sort markers, alphabetized by name to filter for markers with the same name
  sortedMarkers.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  for (let i = 0; i < sortedMarkers.length; i++) {
    const marker = sortedMarkers[i];
    const markerNext = sortedMarkers[i + 1];

    if (!marker.data || marker.data.type !== 'Network') {
      continue;
    }
    // The timestamps on the start and end markers describe two non-overlapping parts
    // of the same load. The start marker has a duration from channel-creation until Start
    // (i.e. AsyncOpen()). The End marker has a duration from AsyncOpen time until
    // OnStopRequest.
    // In the merged marker, we want to represent the entire duration, from channel-creation
    // until OnStopRequest.
    if (markerNext !== undefined && marker.name === markerNext.name) {
      if (
        marker.data &&
        marker.data.type === 'Network' &&
        markerNext.data &&
        markerNext.data.type === 'Network'
      ) {
        // Markers have either status STATUS_START or (STATUS_STOP || STATUS_REDIRECT || STATUS_READ). STATUS_START is reliable and the only not likely to change.
        if (
          (marker.data.status === 'STATUS_START' &&
            markerNext.data.status !== 'STATUS_START') ||
          (markerNext.data.status === 'STATUS_START' &&
            marker.data.status !== 'STATUS_START')
        ) {
          // As we discard the start marker, but want the whole duration we override the
          // start of the end marker with the start time of the start marker
          const [startMarker, endMarker] =
            marker.data.status === 'STATUS_START'
              ? [marker, markerNext]
              : [markerNext, marker];
          const mergedMarker = {
            data: endMarker.data,
            dur: endMarker.dur,
            name: endMarker.name,
            title: endMarker.title,
            start: startMarker.start,
          };
          filteredMarkers.push(mergedMarker);
          i++;
        }
        continue;
      }
    }
    filteredMarkers.push(marker);
  }
  // Sort markers by startTime to display in the right order in the network panel waterfall
  filteredMarkers.sort((a, b) => a.start - b.start);
  return filteredMarkers;
}

export function extractScreenshotsById(
  markers: MarkersTable,
  stringTable: UniqueStringArray,
  rootRange: StartEndRange
): Map<string, TracingMarker[]> {
  const idToScreenshotMarkers = new Map();
  const name = 'CompositorScreenshot';
  const nameIndex = stringTable.indexForString(name);
  for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    if (markers.name[markerIndex] === nameIndex) {
      // Coerce the payload to a screenshot one. Don't do a runtime check that
      // this is correct.
      const data: ScreenshotPayload = (markers.data[markerIndex]: any);

      let tracingMarkers = idToScreenshotMarkers.get(data.windowID);
      if (tracingMarkers === undefined) {
        tracingMarkers = [];
        idToScreenshotMarkers.set(data.windowID, tracingMarkers);
      }

      tracingMarkers.push({
        start: markers.time[markerIndex],
        dur: 0,
        title: null,
        name,
        data,
      });

      if (tracingMarkers.length > 1) {
        // Set the duration
        const prevMarker = tracingMarkers[tracingMarkers.length - 2];
        const nextMarker = tracingMarkers[tracingMarkers.length - 1];
        prevMarker.dur = nextMarker.start - prevMarker.start;
      }
    }
  }

  for (const [, tracingMarkers] of idToScreenshotMarkers) {
    // This last marker must exist.
    const lastMarker = tracingMarkers[tracingMarkers.length - 1];
    lastMarker.dur = rootRange.end - lastMarker.start;
  }

  return idToScreenshotMarkers;
}
