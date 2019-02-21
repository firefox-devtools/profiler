/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getEmptyRawMarkerTable } from './data-structures';
import { getNumberPropertyOrNull } from '../utils/flow';

import type {
  SamplesTable,
  RawMarkerTable,
  IndexIntoStringTable,
  IndexIntoRawMarkerTable,
} from '../types/profile';
import type { Marker, IndexIntoMarkers } from '../types/profile-derived';
import type { BailoutPayload, NetworkPayload } from '../types/markers';
import type { UniqueStringArray } from '../utils/unique-string-array';

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
 * This function converts those measurings of milliseconds into individual markers.
 *
 * For instance, take an array of responsiveness values:
 *
 *   [5, 25, 33, 3, 23, 42, 65, 71, 3, 10, 22, 31, 42, 3, 20, 40]
 *           |___|              |___|              |___|
 *     Runnable is reset    Jank of 71ms. The      Runnable reset under threshold.
 *     but under 50ms,      responsiveness was
 *     no jank.             reset from 71 to 3.
 */
export function deriveJankMarkers(
  samples: SamplesTable,
  thresholdInMs: number
): Marker[] {
  const addMarker = () =>
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
        addMarker();
      }
    }
    lastResponsiveness = currentResponsiveness;
    lastTimestamp = samples.time[i];
  }
  if (lastResponsiveness >= thresholdInMs) {
    addMarker();
  }
  return jankInstances;
}

export function getSearchFilteredMarkers(
  markers: Marker[],
  searchString: string
): Marker[] {
  if (!searchString) {
    return markers;
  }
  const lowerCaseSearchString = searchString.toLowerCase();
  const newMarkers: Marker[] = [];
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
  markers: RawMarkerTable,
  stringTable: UniqueStringArray
): RawMarkerTable {
  const newMarkers: RawMarkerTable = {
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
          "profiler.firefox.com assumed that the payload was empty, but it turns out it wasn't. " +
          'This is most likely an error and should be fixed. The marker name is:',
        name
      );
    }
  }

  return newMarkers;
}

export function deriveMarkersFromRawMarkerTable(
  rawMarkers: RawMarkerTable,
  stringTable: UniqueStringArray,
  firstSampleTime: number,
  lastSampleTime: number,
  interval: number
): Marker[] {
  // This is the resulting array.
  const matchedMarkers: Marker[] = [];

  // This map is used to track start and end raw markers for the time-matched markers.
  const openMarkers: Map<IndexIntoStringTable, Marker[]> = new Map();

  // This variable keeps a screenshot marker until we can compute its duration.
  let previousScreenshotMarker: Marker | null = null;

  for (let i = 0; i < rawMarkers.length; i++) {
    const data = rawMarkers.data[i];
    if (!data) {
      // Add a marker with a zero duration
      const marker = {
        start: rawMarkers.time[i],
        dur: 0,
        name: stringTable.getString(rawMarkers.name[i]),
        title: null,
        data: null,
      };
      matchedMarkers.push(marker);
    } else if (data.type === 'tracing' && data.interval) {
      // Markers are created from two distinct raw markers that are created at
      // the start and end of whatever code that is running that we care about.
      // This is implemented by AutoProfilerTracing in Gecko.
      //
      // In this function we convert both of these raw markers into a single
      // marker with a non-null duration.
      //
      // We also handle nested markers by assuming markers of the same type are
      // never interwoven: given input markers startA, startB, endC, endD, we'll
      // get 2 markers A-D and B-C.

      const time = rawMarkers.time[i];
      const nameStringIndex = rawMarkers.name[i];
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
          // an "incomplete" marker which will be truncated at the starting end
          // since we don't know exactly when it started.
          // Note we won't have additional data (eg the cause stack) for this
          // marker because that data is contained in the "start" marker.

          const nameStringIndex = rawMarkers.name[i];

          // Also note that the end marker could occur before the
          // first sample. In that case it'll become a dot marker at
          // the location of the end marker. Otherwise we'll use the
          // time of the first sample as its start.
          marker = {
            start: Math.min(firstSampleTime, time),
            name: stringTable.getString(nameStringIndex),
            dur: 0,
            title: null,
            data,
            incomplete: true,
          };
        }
        if (marker.start !== undefined) {
          marker.dur = time - marker.start;
        }
        matchedMarkers.push(marker);
      }
    } else if (data.type === 'CompositorScreenshot') {
      // Screenshot markers are already ordered. We compute their duration using the
      // following marker of the same type.
      if (previousScreenshotMarker !== null) {
        previousScreenshotMarker.dur =
          rawMarkers.time[i] - previousScreenshotMarker.start;
        matchedMarkers.push(previousScreenshotMarker);
      }

      previousScreenshotMarker = {
        start: rawMarkers.time[i],
        dur: 0,
        title: null,
        name: 'CompositorScreenshot',
        data,
      };
    } else {
      // `data` here is a union of different shaped objects, that may or not have
      // certain properties. Flow doesn't like us arbitrarily accessing properties
      // that may not exist, so use a utility function to generically get the data out.
      const startTime = getNumberPropertyOrNull(data, 'startTime');
      const endTime = getNumberPropertyOrNull(data, 'endTime');

      if (startTime !== null && endTime !== null) {
        // Construct a marker with a duration if these properties exist.
        const name = stringTable.getString(rawMarkers.name[i]);
        const duration = endTime - startTime;
        matchedMarkers.push({
          start: startTime,
          dur: duration,
          name,
          data,
          title: null,
        });
      } else {
        // Ensure all raw markers are converted to markers, even if they have no
        // more timing information. This ensures that markers can be filtered by time
        // in a consistent manner.
        matchedMarkers.push({
          start: rawMarkers.time[i],
          dur: 0,
          name: stringTable.getString(rawMarkers.name[i]),
          data,
          title: null,
        });
      }
    }
  }

  const endOfThread = lastSampleTime + interval;

  // Loop over "start" markers without any "end" markers
  for (const markerBucket of openMarkers.values()) {
    for (const marker of markerBucket) {
      marker.dur = Math.max(endOfThread - marker.start, 0);
      marker.incomplete = true;
      matchedMarkers.push(marker);
    }
  }

  // Compute the last screenshot marker's duration using the last sample time.
  if (previousScreenshotMarker) {
    previousScreenshotMarker.dur = endOfThread - previousScreenshotMarker.start;
    matchedMarkers.push(previousScreenshotMarker);
  }

  return matchedMarkers;
}

/**
 * This function filters markers from a thread's raw marker table using the
 * range specified as parameter.
 * It especially takes care of the markers that need a special handling because
 * of how the rest of the code handles them.
 *
 * There's more explanations about this special handling in the switch block
 * below.
 */
export function filterRawMarkerTableToRange(
  markers: RawMarkerTable,
  rangeStart: number,
  rangeEnd: number
): RawMarkerTable {
  const newMarkerTable = getEmptyRawMarkerTable();

  const filteredMarkerIndexesIter = filterRawMarkerTableIndexesToRange(
    markers,
    rangeStart,
    rangeEnd
  );

  for (const index of filteredMarkerIndexesIter) {
    newMarkerTable.time.push(markers.time[index]);
    newMarkerTable.name.push(markers.name[index]);
    newMarkerTable.data.push(markers.data[index]);
    newMarkerTable.length++;
  }
  return newMarkerTable;
}

export function* filterRawMarkerTableIndexesToRange(
  markers: RawMarkerTable,
  rangeStart: number,
  rangeEnd: number
): Generator<number, void, void> {
  const isTimeInRange = (time: number): boolean =>
    time < rangeEnd && time >= rangeStart;
  const intersectsRange = (start: number, end: number): boolean =>
    start < rangeEnd && end >= rangeStart;

  // These maps contain the start markers we find while looping the marker
  // table.
  // The first map contains the start markers for tracing markers. They can be
  // nested and that's why we use an array structure as value.
  const openTracingMarkers: Map<
    IndexIntoStringTable,
    IndexIntoMarkers[]
  > = new Map();

  // The second map contains the start markers for network markers.
  // Note that we don't have more than 2 network markers with the same name as
  // the name contains an incremented index. Therefore we don't need to use an
  // array as value like for tracing markers.
  const openNetworkMarkers: Map<
    IndexIntoStringTable,
    IndexIntoMarkers
  > = new Map();

  let previousScreenshotMarker = null;

  for (let i = 0; i < markers.length; i++) {
    const name = markers.name[i];
    const time = markers.time[i];
    const data = markers.data[i];

    if (!data) {
      if (isTimeInRange(time)) {
        yield i;
      }
      continue;
    }

    // Depending on the type we have to do some special handling.
    switch (data.type) {
      case 'tracing': {
        // Tracing markers are pairs of start/end markers. To retain their
        // duration if we have it, we keep both markers of the pair if they
        // represent a marker that's partially in the range.

        if (data.interval === 'start') {
          let openMarkersForName = openTracingMarkers.get(name);
          if (!openMarkersForName) {
            openMarkersForName = [];
            openTracingMarkers.set(name, openMarkersForName);
          }
          openMarkersForName.push(i);

          // We're not inserting anything to newMarkerTable yet. We wait for the
          // end marker to decide whether we should add this start marker, as we
          // will add start markers from before the range if the end marker is
          // in or after the range.
          //
          // We'll loop at all open markers after the main loop, to add them to
          // the new marker table if they're in the range.
        } else if (data.interval === 'end') {
          const openMarkersForName = openTracingMarkers.get(name);
          let startIndex;
          if (openMarkersForName) {
            startIndex = openMarkersForName.pop();
          }
          if (startIndex !== undefined) {
            // A start marker matches this end marker.
            if (intersectsRange(markers.time[startIndex], time)) {
              // This couple of markers define a marker that's at least partially
              // in the range.
              yield startIndex;
              yield i;
            }
          } else {
            // No start marker matches this end marker, then we'll add it only if
            // it's in or after the time range.
            if (time >= rangeStart) {
              yield i;
            }
          }
        } else {
          console.error(
            `'data.interval' holds the invalid value '${
              data.interval
            }' in marker index ${i}. This should not normally happen.`
          );
          if (isTimeInRange(time)) {
            yield i;
          }
        }
        break;
      }

      case 'Network': {
        // Network markers are similar to tracing markers in that they also
        // normally exist in pairs of start/stop markers. Just like tracing
        // markers we keep both markers of the pair if they're partially in the
        // range so that we keep all the useful data. But unlike tracing markers
        // they have a duration and "startTime/endTime" properties like more
        // generic markers. Lastly they're always adjacent.

        if (data.status === 'STATUS_START') {
          openNetworkMarkers.set(name, i);
        } else {
          // End status can be any status other than 'STATUS_START'
          const startIndex = openNetworkMarkers.get(name);
          if (startIndex !== undefined) {
            // A start marker matches this end marker.
            openNetworkMarkers.delete(name);

            // We know this startIndex points to a Network marker.
            const startData: NetworkPayload = (markers.data[startIndex]: any);
            const endData = data;
            if (intersectsRange(startData.startTime, endData.endTime)) {
              // This couple of markers define a network marker that's at least
              // partially in the range.
              yield startIndex;
              yield i;
            }
          } else {
            // There's no start marker matching this end marker. This means an
            // abstract marker exists before the start of the profile.
            // Then we add it if it ends after the start of the range.
            if (data.endTime >= rangeStart) {
              yield i;
            }
          }
        }

        break;
      }

      case 'CompositorScreenshot': {
        // Between two screenshot markers, we keep on displaying the previous
        // screenshot. this is why we always keep the last screenshot marker
        // before the start of the range, if it exists.  These markers are
        // ordered by time and the rest of our code rely on it, so this
        // invariant is also kept here.

        if (time < rangeStart) {
          previousScreenshotMarker = i;
          continue;
        }

        if (time < rangeEnd) {
          if (previousScreenshotMarker !== null) {
            yield previousScreenshotMarker;
            previousScreenshotMarker = null;
          }

          yield i;
        }

        // If previousScreenshotMarker isn't null after the loop, it will be
        // considered for addition to the marker table.

        break;
      }

      default:
        if (
          typeof data.startTime === 'number' &&
          typeof data.endTime === 'number'
        ) {
          if (intersectsRange(data.startTime, data.endTime)) {
            yield i;
          }
        } else {
          if (isTimeInRange(time)) {
            yield i;
          }
        }
    }
  }

  // Loop over "start" markers without any "end" markers. We add one only if
  // it's in or before the specified range.
  // Note: doing it at the end, we change the order of markers compared to the
  // source, but it's OK because the only important invariant is that pairs of
  // start/end come in order.
  for (const markerBucket of openTracingMarkers.values()) {
    for (const startIndex of markerBucket) {
      if (markers.time[startIndex] < rangeEnd) {
        yield startIndex;
      }
    }
  }

  for (const startIndex of openNetworkMarkers.values()) {
    const data: NetworkPayload = (markers.data[startIndex]: any);
    if (data.startTime < rangeEnd) {
      yield startIndex;
    }
  }

  // And we should add the "last screenshot marker before the range" if it
  // hadn't been added yet.
  if (previousScreenshotMarker !== null) {
    yield previousScreenshotMarker;
  }
}

export function filterMarkersToRange(
  markers: Marker[],
  rangeStart: number,
  rangeEnd: number
): Marker[] {
  return markers.filter(
    tm => tm.start < rangeEnd && tm.start + tm.dur >= rangeStart
  );
}

export function isNetworkMarker(marker: Marker): boolean {
  return !!(marker.data && marker.data.type === 'Network');
}

export function isNavigationMarker({ name, data }: Marker) {
  if (name === 'TTI') {
    // TTI is only selectable by name, as it doesn't have a structured payload.
    return true;
  }
  if (!data) {
    // This marker has no payload, only consider the name.
    if (name === 'Navigation::Start') {
      return true;
    }
    if (name.startsWith('Contentful paint ')) {
      // This is a long plaintext marker.
      // e.g. "Contentful paint after 322ms for URL https://developer.mozilla.org/en-US/, foreground tab"
      return true;
    }
    return false;
  }
  if (data.category === 'Navigation') {
    // Filter by payloads.
    if (name === 'Load' || name === 'DOMContentLoaded') {
      return true;
    }
  }
  return false;
}

export function isFileIoMarker(marker: Marker): boolean {
  return !!(marker.data && marker.data.type === 'FileIO');
}

export function isMemoryMarker(marker: Marker): boolean {
  const { data } = marker;
  if (!data) {
    return false;
  }
  return (
    data.type === 'GCMajor' ||
    data.type === 'GCMinor' ||
    data.type === 'GCSlice' ||
    (data.type === 'tracing' && data.category === 'CC')
  );
}

export function filterForNetworkChart(markers: Marker[]) {
  return markers.filter(marker => isNetworkMarker(marker));
}

export function filterForMarkerChart(markers: Marker[]) {
  return markers.filter(marker => !isNetworkMarker(marker));
}
// Firefox emits separate start and end markers for each load. It does this so that,
// if a profile is collected while a request is in progress, the profile will still contain
// a start marker for that request. So by looking at start markers we can get
// information about requests that were in progress at profile collection time.
// For requests that have finished, we want to merge the request's start and end
// markers into one marker.
export function mergeStartAndEndNetworkMarker(markers: Marker[]): Marker[] {
  const sortedMarkers: Marker[] = markers.slice(0);
  const filteredMarkers: Marker[] = [];

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
          const startData: NetworkPayload = (startMarker.data: any);
          const endData: NetworkPayload = (endMarker.data: any);
          const mergedMarker = {
            data: {
              ...endData,
              startTime: startData.startTime,
            },
            dur: startMarker.dur + endMarker.dur,
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

export function groupScreenshotsById(markers: Marker[]): Map<string, Marker[]> {
  const idToScreenshotMarkers = new Map();
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const { data } = marker;
    if (data && data.type === 'CompositorScreenshot') {
      let markers = idToScreenshotMarkers.get(data.windowID);
      if (markers === undefined) {
        markers = [];
        idToScreenshotMarkers.set(data.windowID, markers);
      }

      markers.push(marker);
    }
  }

  return idToScreenshotMarkers;
}
