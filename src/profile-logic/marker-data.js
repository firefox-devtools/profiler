/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getEmptyRawMarkerTable } from './data-structures';
import { getFriendlyThreadName } from './profile-data';
import { removeFilePath, removeURLs } from '../utils/string';
import { ensureExists } from '../utils/flow';

import type {
  Thread,
  SamplesTable,
  RawMarkerTable,
  IndexIntoStringTable,
  IndexIntoRawMarkerTable,
  IndexIntoCategoryList,
  InnerWindowID,
  Marker,
  MarkerIndex,
  IPCSharedData,
  IPCMarkerPayload,
  BailoutPayload,
  NetworkPayload,
  PrefMarkerPayload,
  InvalidationPayload,
  FileIoPayload,
  TextMarkerPayload,
  StartEndRange,
} from 'firefox-profiler/types';

import type { UniqueStringArray } from '../utils/unique-string-array';

function _formatIPCMarkerDirection(data) {
  if (data.direction === 'sending') {
    return `sent to ${data.recvThreadName || data.otherPid}`;
  }
  return `received from ${data.sendThreadName || data.otherPid}`;
}

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
  thresholdInMs: number,
  otherCategoryIndex: IndexIntoCategoryList
): Marker[] {
  const addMarker = () =>
    jankInstances.push({
      start: lastTimestamp - lastResponsiveness,
      dur: lastResponsiveness,
      title: `${lastResponsiveness.toFixed(2)}ms event processing delay`,
      name: 'Jank',
      category: otherCategoryIndex,
      data: null,
    });

  let lastResponsiveness: number = 0;
  let lastTimestamp: number = 0;
  const jankInstances = [];
  for (let i = 0; i < samples.length; i++) {
    let currentResponsiveness;
    if (samples.eventDelay) {
      currentResponsiveness = samples.eventDelay[i];
    } else if (samples.responsiveness) {
      currentResponsiveness = samples.responsiveness[i];
    }

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

export function getSearchFilteredMarkerIndexes(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  searchRegExp: RegExp | null
): MarkerIndex[] {
  if (!searchRegExp) {
    return markerIndexes;
  }
  const newMarkers: MarkerIndex[] = [];
  for (const markerIndex of markerIndexes) {
    const { data, name } = getMarker(markerIndex);

    // Reset regexp for each iteration. Otherwise state from previous
    // iterations can cause matches to fail if the search is global or
    // sticky.
    searchRegExp.lastIndex = 0;

    if (searchRegExp.test(name)) {
      newMarkers.push(markerIndex);
      continue;
    }
    if (data && typeof data === 'object') {
      if (searchRegExp.test(data.type)) {
        newMarkers.push(markerIndex);
        continue;
      }

      if (data.type === 'FileIO') {
        const { filename, operation, source, threadId } = data;
        if (
          searchRegExp.test(filename) ||
          searchRegExp.test(operation) ||
          searchRegExp.test(source) ||
          (threadId !== undefined && searchRegExp.test(threadId.toString()))
        ) {
          newMarkers.push(markerIndex);
          continue;
        }
      } else if (data.type === 'IPC') {
        const { messageType, otherPid } = data;
        if (
          searchRegExp.test(messageType) ||
          searchRegExp.test(otherPid.toString())
        ) {
          newMarkers.push(markerIndex);
          continue;
        }
      } else if (data.type === 'Log') {
        const { name, module } = data;

        if (searchRegExp.test(name) || searchRegExp.test(module)) {
          newMarkers.push(markerIndex);
          continue;
        }
      }

      if (
        typeof data.eventType === 'string' &&
        searchRegExp.test(data.eventType)
      ) {
        // Match DOMevents data.eventType
        newMarkers.push(markerIndex);
        continue;
      }
      if (typeof data.name === 'string' && searchRegExp.test(data.name)) {
        // Match UserTiming's name.
        newMarkers.push(markerIndex);
        continue;
      }
      if (
        typeof data.category === 'string' &&
        searchRegExp.test(data.category)
      ) {
        newMarkers.push(markerIndex);
        continue;
      }
    }
  }
  return newMarkers;
}

/**
 * Gets the markers and the web pages that are relevant to the current active tab
 * and filters out the markers that don't belong to those revelant pages.
 * If we don't have any item in relevantPages, return the whole marker list.
 */
export function getTabFilteredMarkerIndexes(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  relevantPages: Set<InnerWindowID>,
  includeGlobalMarkers: boolean = true
): MarkerIndex[] {
  if (relevantPages.size === 0) {
    return markerIndexes;
  }

  const newMarkers: MarkerIndex[] = [];
  for (const markerIndex of markerIndexes) {
    const { name, data } = getMarker(markerIndex);

    // We want to retain some markers even though they do not belong to a specific tab.
    // We are checking those before and pushing those markers to the new array.
    // As of now, those markers are:
    // - Jank markers
    if (includeGlobalMarkers) {
      if (name === 'Jank') {
        newMarkers.push(markerIndex);
        continue;
      }
    } else {
      if (data && data.type === 'Network') {
        // Now network markers have innerWindowIDs inside their payloads but those markers
        // can be inside the main thread and not be related to that specific thread.
        continue;
      }
    }

    if (data && data.innerWindowID && relevantPages.has(data.innerWindowID)) {
      newMarkers.push(markerIndex);
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
    category: markers.category.slice(),
    length: markers.length,
  };

  // Match: "Bailout_MonitorTypes after add on line 1013 of self-hosted:1008"
  // Match: "Bailout_TypeBarrierO at jumptarget on line 1490 of resource://devtools/shared/base-loader.js -> resource://devtools/client/shared/vendor/immutable.js:1484"
  // Match: "Bailout_ShapeGuard at jumptarget on line 7 of moz-extension://<URL>"
  const bailoutRegex =
    // Capture groups:
    //       type   afterAt    where        bailoutLine  script     functionLine
    //        ↓     ↓          ↓                  ↓        ↓        ↓
    /^Bailout_(\w+) (after|at) ([\w _-]+) on line (\d+) of (.*?)(?::(\d+))?$/;
  //                                                               ↑
  // Colon in non-capturing group which only matches when functionLine is present

  // Match: "Invalidate resource://devtools/shared/base-loader.js -> resource://devtools/client/shared/vendor/immutable.js:3662"
  // Match: "Invalidate self-hosted:4032"
  // Match: "Invalidate moz-extension://<URL>"
  const invalidateRegex =
    // Capture groups:
    //         url        line
    //           ↓        ↓
    /^Invalidate (.*?)(?::(\d+))?$/;

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
          functionLine: functionLine === undefined ? null : +functionLine,
          startTime: time,
          endTime: time,
        }: BailoutPayload);
      }
    } else if (name.startsWith('Invalidate ')) {
      matchFound = true;
      const match = name.match(invalidateRegex);
      if (!match) {
        console.error(`Could not match regex for invalidation: "${name}"`);
      } else {
        const [, url, line] = match;
        newMarkers.name[markerIndex] = invalidationStringIndex;
        newMarkers.data[markerIndex] = ({
          type: 'Invalidation',
          url,
          line: line === undefined ? null : line,
          startTime: time,
          endTime: time,
        }: InvalidationPayload);
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

/**
 * This class is a specialized Map for IPC marker data, using the thread ID and
 * marker index as the key, and storing IPCSharedData (which holds the start/end
 * times for the IPC message.
 */
export class IPCMarkerCorrelations {
  _correlations: Map<string, IPCSharedData>;

  constructor() {
    this._correlations = new Map();
  }

  _makeKey(tid: number, index: number) {
    return `${tid},${index}`;
  }

  set(tid: number, index: number, data: IPCSharedData): void {
    this._correlations.set(this._makeKey(tid, index), data);
  }

  get(tid: number, index: number): ?IPCSharedData {
    return this._correlations.get(this._makeKey(tid, index));
  }
}

/**
 * This function correlates the sender and recipient sides of IPC markers so
 * that we can share data between the two during profile processing.
 */
export function correlateIPCMarkers(threads: Thread[]): IPCMarkerCorrelations {
  // Create a unique ID constructed from the source PID, destination PID,
  // message seqno, and message type. Since the seqno is only unique for each
  // message channel pair, we use the PIDs and message type as a way of
  // identifying which channel pair generated this message.
  function makeMarkerID(thread, data): string {
    let pids;
    if (data.direction === 'sending') {
      pids = `${thread.pid},${data.otherPid}`;
    } else {
      pids = `${data.otherPid},${thread.pid}`;
    }
    return pids + `,${data.messageSeqno},${data.messageType}`;
  }

  function formatThreadName(tid: ?number): string | void {
    if (tid !== null && tid !== undefined) {
      const name = threadNames.get(tid);
      if (name !== undefined) {
        return `${name} (Thread ID: ${tid})`;
      }
    }
    return undefined;
  }

  // Each IPC message has several (up to 5) markers associated with it. The
  // order of these can be determined by the `direction` and `phase` attributes.
  // To store all the markers for a given message, we convert the direction and
  // phase to an index into an array.
  function phaseToIndex(data: IPCMarkerPayload): number {
    if (data.direction === 'sending') {
      switch (data.phase) {
        case 'transferStart':
          return 1;
        case 'transferEnd':
          return 2;
        default:
          // 'endpoint'
          return 0;
      }
    } else {
      switch (data.phase) {
        case 'transferEnd':
          return 3;
        default:
          // 'endpoint'
          return 4;
      }
    }
  }

  // First, construct a mapping of marker IDs to an array of markers with that
  // ID for faster lookup. We also collect the friendly thread names while we
  // have access to all the threads. It's considerably more difficult to do
  // this processing later.
  const markersByKey: Map<
    string,
    Array<{ tid: number, index: number, data: IPCMarkerPayload } | void>
  > = new Map();
  const threadNames: Map<number, string> = new Map();
  for (const thread of threads) {
    // Don't bother checking for IPC markers if this thread's string table
    // doesn't have the string "IPC". This lets us avoid looping over all the
    // markers when we don't have to.
    if (!thread.stringTable.hasString('IPC')) {
      continue;
    }
    if (typeof thread.tid === 'number') {
      const tid: number = thread.tid;
      threadNames.set(tid, getFriendlyThreadName(threads, thread));

      for (let index = 0; index < thread.markers.length; index++) {
        const data = thread.markers.data[index];
        if (!data || data.type !== 'IPC') {
          continue;
        }
        const key = makeMarkerID(thread, data);
        if (!markersByKey.has(key)) {
          markersByKey.set(key, new Array(5).fill(undefined));
        }

        const currMarkers = ensureExists(markersByKey.get(key));
        const phaseIdx = phaseToIndex(data);

        if (currMarkers[phaseIdx] === undefined) {
          currMarkers[phaseIdx] = { tid, index, data };
        } else {
          console.warn('Duplicate IPC marker found for key', key);
        }
      }
    }
  }

  const correlations = new IPCMarkerCorrelations();
  for (const markers of markersByKey.values()) {
    const sendTid = markers[0] ? markers[0].tid : undefined;
    const recvTid = markers[4] ? markers[4].tid : undefined;
    const sharedData: IPCSharedData = {
      startTime: markers[0] ? markers[0].data.startTime : undefined,
      sendStartTime: markers[1] ? markers[1].data.startTime : undefined,
      sendEndTime: markers[2] ? markers[2].data.startTime : undefined,
      recvEndTime: markers[3] ? markers[3].data.startTime : undefined,
      endTime: markers[4] ? markers[4].data.startTime : undefined,
      sendTid,
      recvTid,
      sendThreadName: formatThreadName(sendTid),
      recvThreadName: formatThreadName(recvTid),
    };

    for (const m of markers) {
      if (m !== undefined) {
        correlations.set(m.tid, m.index, sharedData);
      }
    }
  }
  return correlations;
}

export function deriveMarkersFromRawMarkerTable(
  rawMarkers: RawMarkerTable,
  stringTable: UniqueStringArray,
  threadId: number,
  threadRange: StartEndRange,
  ipcCorrelations: IPCMarkerCorrelations
): Marker[] {
  // This is the resulting array.
  const matchedMarkers: Marker[] = [];

  // These maps contain the start markers we find while looping the marker
  // table.
  // The first map contains the start markers for tracing markers. They can be
  // nested and that's why we use an array structure as value.
  const openTracingMarkers: Map<
    IndexIntoStringTable,
    MarkerIndex[]
  > = new Map();

  // The second map contains the start markers for network markers.
  // Note that we don't have more than 2 network markers with the same name as
  // the name contains an incremented index. Therefore we don't need to use an
  // array as value like for tracing markers.
  const openNetworkMarkers: Map<number, MarkerIndex> = new Map();

  // We don't add a screenshot marker as we find it, because to know its
  // duration we need to wait until the next one or the end of the profile. So
  // we keep it here.
  let previousScreenshotMarker: MarkerIndex | null = null;

  for (let i = 0; i < rawMarkers.length; i++) {
    const name = rawMarkers.name[i];
    const time = rawMarkers.time[i];
    const data = rawMarkers.data[i];
    const category = rawMarkers.category[i];

    if (!data) {
      // Add a marker with a zero duration
      matchedMarkers.push({
        start: time,
        dur: 0,
        name: stringTable.getString(name),
        title: null,
        category,
        data: null,
      });
      continue;
    }

    // Depending on the type we have to do some special handling.
    switch (data.type) {
      case 'tracing': {
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
        //
        // Sometimes we don't have one side of the pair, in this case we still
        // insert a marker and try to fill it with sensible values.
        if (data.interval === 'start') {
          let openMarkersForName = openTracingMarkers.get(name);
          if (!openMarkersForName) {
            openMarkersForName = [];
            openTracingMarkers.set(name, openMarkersForName);
          }
          openMarkersForName.push(i);

          // We're not inserting anything to matchedMarkers yet. We wait for the
          // end marker for that so that we know about the duration.
          //
          // We'll loop at all open markers after the main loop.
        } else if (data.interval === 'end') {
          const openMarkersForName = openTracingMarkers.get(name);

          let startIndex;

          if (openMarkersForName) {
            startIndex = openMarkersForName.pop();
          }

          if (startIndex !== undefined) {
            // A start marker matches this end marker.
            const start = rawMarkers.time[startIndex];
            matchedMarkers.push({
              start,
              name: stringTable.getString(name),
              dur: time - start,
              title: null,
              category,
              data: rawMarkers.data[startIndex],
            });
          } else {
            // No matching "start" marker has been encountered before this "end".
            // This means it was issued before the capture started. Here we create
            // an "incomplete" marker which will be truncated at the starting end
            // since we don't know exactly when it started.
            // Note we won't have additional data (eg the cause stack) for this
            // marker because that data is contained in the "start" marker.

            // Also note that the end marker could occur before the
            // first sample. In that case it'll become a dot marker at
            // the location of the end marker. Otherwise we'll use the
            // time of the first sample as its start.
            const start = Math.min(time, threadRange.start);

            matchedMarkers.push({
              start,
              name: stringTable.getString(name),
              dur: time - start,
              title: null,
              category,
              data,
              incomplete: true,
            });
          }
        } else {
          if (data.interval !== undefined) {
            // Undefined values are valid, but others are unexpected.
            console.error(
              `'data.interval' holds the invalid value '${data.interval}' in marker index ${i}. This should not normally happen.`
            );
          }
          matchedMarkers.push({
            start: time,
            dur: 0,
            name: stringTable.getString(name),
            category,
            title: null,
            data,
          });
        }
        break;
      }

      case 'Network': {
        // Network markers are similar to tracing markers in that they also
        // normally exist in pairs of start/stop markers. But unlike tracing
        // markers they have a duration and "startTime/endTime" properties like
        // more generic markers. Lastly they're always adjacent: the start
        // markers ends when the stop markers starts.
        //
        // The timestamps on the start and end markers describe two
        // non-overlapping parts of the same load. The start marker has a
        // duration from channel-creation until Start (i.e. AsyncOpen()). The
        // end marker has a duration from AsyncOpen time until OnStopRequest.
        // In the merged marker, we want to represent the entire duration, from
        // channel-creation until OnStopRequest.
        //
        // |--- start marker ---|--- stop marker with timings ---|
        //
        // Usually the start marker is very small. It's emitted mostly to know
        // about the start of the request. But most of the interesting bits are
        // in the stop marker.

        if (data.status === 'STATUS_START') {
          openNetworkMarkers.set(data.id, i);
        } else {
          // End status can be any status other than 'STATUS_START'. They are
          // either 'STATUS_STOP' or 'STATUS_REDIRECT'.
          const endData = data;

          const startIndex = openNetworkMarkers.get(data.id);

          if (startIndex !== undefined) {
            // A start marker matches this end marker.
            openNetworkMarkers.delete(data.id);

            // We know this startIndex points to a Network marker.
            const startData: NetworkPayload = (rawMarkers.data[
              startIndex
            ]: any);

            matchedMarkers.push({
              start: startData.startTime,
              dur: endData.endTime - startData.startTime,
              name: stringTable.getString(name),
              title: null,
              category,
              data: {
                ...endData,
                startTime: startData.startTime,
                fetchStart: endData.startTime,
                cause: startData.cause || endData.cause,
              },
            });
          } else {
            // There's no start marker matching this end marker. This means an
            // abstract marker exists before the start of the profile.
            const start = Math.min(threadRange.start, endData.startTime);
            matchedMarkers.push({
              start,
              dur: endData.endTime - start,
              name: stringTable.getString(name),
              title: null,
              category,
              data: {
                ...endData,
                startTime: start,
                fetchStart: endData.startTime,
                cause: endData.cause,
              },
              incomplete: true,
            });
          }
        }

        break;
      }

      case 'CompositorScreenshot': {
        // Screenshot markers are already ordered. In the raw marker table,
        // they're dot markers, but since they're valid until the following
        // raw marker of the same type, we convert them to markers with a
        // duration using the following marker.

        if (previousScreenshotMarker !== null) {
          const start = rawMarkers.time[previousScreenshotMarker];
          const data = rawMarkers.data[previousScreenshotMarker];

          matchedMarkers.push({
            start,
            dur: time - start,
            name: 'CompositorScreenshot',
            title: null,
            category,
            data,
          });
        }

        previousScreenshotMarker = i;

        break;
      }

      case 'IPC': {
        const sharedData = ipcCorrelations.get(threadId, i);
        if (!sharedData) {
          // Since shared data is generated for every IPC message, this should
          // never happen unless something has gone catastrophically wrong.
          console.error('Unable to find shared data for IPC marker');
          break;
        }

        if (
          data.direction === 'sending' &&
          data.phase === 'transferEnd' &&
          sharedData.sendStartTime !== undefined
        ) {
          // This marker corresponds to the end of the data transfer on the
          // sender's IO thread, but we also have a marker for the *start* of
          // the transfer. Since we don't need to show two markers for the same
          // IPC message on the same thread, skip this one.
          break;
        }

        let name = data.direction === 'sending' ? 'IPCOut' : 'IPCIn';
        if (data.sync) {
          name = 'Sync' + name;
        }

        let start = ensureExists(data.startTime),
          dur = 0,
          incomplete = true;
        if (
          sharedData.startTime !== undefined &&
          sharedData.endTime !== undefined
        ) {
          start = sharedData.startTime;
          dur = sharedData.endTime - sharedData.startTime;
          incomplete = false;
        }

        const allData = { ...data, ...sharedData };
        matchedMarkers.push({
          start,
          dur,
          name,
          title: `IPC — ${_formatIPCMarkerDirection(allData)}`,
          category,
          data: allData,
          incomplete,
        });

        break;
      }

      default:
        if (
          typeof data.startTime === 'number' &&
          typeof data.endTime === 'number'
        ) {
          matchedMarkers.push({
            start: data.startTime,
            dur: data.endTime - data.startTime,
            name: stringTable.getString(name),
            category,
            data,
            title: null,
          });
        } else {
          // Ensure all raw markers are converted to markers, even if they have no
          // more timing information. This ensures that markers can be filtered by time
          // in a consistent manner.

          matchedMarkers.push({
            start: time,
            dur: 0,
            name: stringTable.getString(name),
            category,
            data,
            title: null,
          });
        }
    }
  }

  const endOfThread = threadRange.end;

  // Loop over "start" markers without any "end" markers.
  for (const markerBucket of openTracingMarkers.values()) {
    for (const startIndex of markerBucket) {
      const start = rawMarkers.time[startIndex];
      matchedMarkers.push({
        start,
        dur: Math.max(endOfThread - start, 0),
        name: stringTable.getString(rawMarkers.name[startIndex]),
        data: rawMarkers.data[startIndex],
        category: rawMarkers.category[startIndex],
        title: null,
        incomplete: true,
      });
    }
  }

  for (const startIndex of openNetworkMarkers.values()) {
    // We know this startIndex points to a Network marker.
    const startData: NetworkPayload = (rawMarkers.data[startIndex]: any);
    matchedMarkers.push({
      start: startData.startTime,
      dur: Math.max(endOfThread - startData.startTime, 0),
      name: stringTable.getString(rawMarkers.name[startIndex]),
      title: null,
      category: rawMarkers.category[startIndex],
      data: startData,
      incomplete: true,
    });
  }

  // And we also need to add the "last screenshot marker".
  if (previousScreenshotMarker !== null) {
    const start = rawMarkers.time[previousScreenshotMarker];
    matchedMarkers.push({
      start,
      dur: Math.max(endOfThread - start, 0),
      name: 'CompositorScreenshot',
      category: rawMarkers.category[previousScreenshotMarker],
      data: rawMarkers.data[previousScreenshotMarker],
      title: null,
    });
  }

  return matchedMarkers;
}

/**
 * This function filters markers from a thread's raw marker table using the
 * range specified as parameter.
 */
export function filterRawMarkerTableToRange(
  markers: RawMarkerTable,
  rangeStart: number,
  rangeEnd: number
): RawMarkerTable {
  const newMarkerTable = getEmptyRawMarkerTable();

  const filteredMarkerIndexesIter = filterRawMarkerTableToRangeIndexGenerator(
    markers,
    rangeStart,
    rangeEnd
  );

  for (const index of filteredMarkerIndexesIter) {
    newMarkerTable.time.push(markers.time[index]);
    newMarkerTable.name.push(markers.name[index]);
    newMarkerTable.data.push(markers.data[index]);
    newMarkerTable.category.push(markers.category[index]);
    newMarkerTable.length++;
  }
  return newMarkerTable;
}

/**
 * This function filters marker indexes from a thread's raw marker table using
 * the range specified as parameter.
 * It especially takes care of the markers that need a special handling because
 * of how the rest of the code handles them.
 *
 * There's more explanations about this special handling in the switch block
 * below.
 *
 * This is a generator function and it returns a IndexIntoMarkers every step.
 * You can use that function inside a for..of or use it with `.next()` function.
 * The reason to use generator function is avoiding creating an intermediate
 * markers array on some consumers.
 */
export function* filterRawMarkerTableToRangeIndexGenerator(
  markers: RawMarkerTable,
  rangeStart: number,
  rangeEnd: number
): Generator<MarkerIndex, void, void> {
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
    IndexIntoRawMarkerTable[]
  > = new Map();

  // The second map contains the start markers for network markers.
  // Note that we don't have more than 2 network markers with the same name as
  // the name contains an incremented index. Therefore we don't need to use an
  // array as value like for tracing markers.
  const openNetworkMarkers: Map<number, IndexIntoRawMarkerTable> = new Map();

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
          if (data.interval !== undefined) {
            // Undefined  values are valid, but others are unexpected.
            console.error(
              `'data.interval' holds the invalid value '${data.interval}' in marker index ${i}. This should not normally happen.`
            );
          }
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
          openNetworkMarkers.set(data.id, i);
        } else {
          // End status can be any status other than 'STATUS_START'
          const startIndex = openNetworkMarkers.get(data.id);
          if (startIndex !== undefined) {
            // A start marker matches this end marker.
            openNetworkMarkers.delete(data.id);

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

/**
 * This function filters markers from a thread's raw marker table using the
 * range and marker indexes array specified as parameters.
 *
 * Uses `filterRawMarkerTableToRangeIndexGenerator` function and excludes
 * markers in `markersToDelete` set.
 */
export function filterRawMarkerTableToRangeWithMarkersToDelete(
  markerTable: RawMarkerTable,
  markersToDelete: Set<IndexIntoRawMarkerTable>,
  filterRange: StartEndRange | null
): {
  rawMarkerTable: RawMarkerTable,
  oldMarkerIndexToNew: Map<IndexIntoRawMarkerTable, IndexIntoRawMarkerTable>,
} {
  const oldMarkers = markerTable;
  const newMarkerTable = getEmptyRawMarkerTable();
  const oldMarkerIndexToNew: Map<
    IndexIntoRawMarkerTable,
    IndexIntoRawMarkerTable
  > = new Map();
  const addMarkerIndexIfIncluded = (index: IndexIntoRawMarkerTable) => {
    if (markersToDelete.has(index)) {
      return;
    }
    oldMarkerIndexToNew.set(index, newMarkerTable.length);
    newMarkerTable.name.push(oldMarkers.name[index]);
    newMarkerTable.time.push(oldMarkers.time[index]);
    newMarkerTable.data.push(oldMarkers.data[index]);
    newMarkerTable.category.push(oldMarkers.category[index]);
    newMarkerTable.length++;
  };

  if (filterRange === null) {
    // If user doesn't want to filter out the full time range, remove only
    // markers that we want to remove.
    for (let i = 0; i < oldMarkers.length; i++) {
      addMarkerIndexIfIncluded(i);
    }
  } else {
    // If user wants to remove full time range, filter all the markers
    // accordingly.
    const { start, end } = filterRange;
    const filteredMarkerIndexIter = filterRawMarkerTableToRangeIndexGenerator(
      oldMarkers,
      start,
      end
    );

    for (const index of filteredMarkerIndexIter) {
      addMarkerIndexIfIncluded(index);
    }
  }
  return {
    rawMarkerTable: newMarkerTable,
    oldMarkerIndexToNew,
  };
}

/**
 * This utility function makes it easier to implement functions filtering
 * markers, with marker indexes both as input and output.
 */
export function filterMarkerIndexes(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  filterFunc: Marker => boolean
): MarkerIndex[] {
  return markerIndexes.filter(markerIndex => {
    return filterFunc(getMarker(markerIndex));
  });
}

export function filterMarkerIndexesToRange(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  rangeStart: number,
  rangeEnd: number
): MarkerIndex[] {
  return filterMarkerIndexes(
    getMarker,
    markerIndexes,
    marker => marker.start < rangeEnd && marker.start + marker.dur >= rangeStart
  );
}

export function isNetworkMarker(marker: Marker): boolean {
  return !!(marker.data && marker.data.type === 'Network');
}

export function isUserTimingMarker(marker: Marker): boolean {
  return !!(marker.data && marker.data.type === 'UserTiming');
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

/**
 * Returns true if the marker is an on-thread FileIO marker.
 * The FileIO markers can be either on-thread or off-thread. If the FileIO marker
 * has a threadId, that means the marker does not belong to that thread but rather
 * belongs to the thread with the given threadId, which is off-thread.
 * We don't want to display the off-thread markers in some parts of the UI because
 * they bring a lot of noise.
 */
export function isOnThreadFileIoMarker(marker: Marker): boolean {
  return !!(
    marker.data &&
    marker.data.type === 'FileIO' &&
    // If thread ID isn't there, that means this FileIO marker belongs to that thread.
    typeof marker.data.threadId === 'undefined'
  );
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

export function isIPCMarker(marker: Marker): boolean {
  return !!(marker.data && marker.data.type === 'IPC');
}

export function filterForNetworkChart(markers: Marker[]): Marker[] {
  return markers.filter(marker => isNetworkMarker(marker));
}

export function filterForMarkerChart(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[]
): MarkerIndex[] {
  return filterMarkerIndexes(
    getMarker,
    markerIndexes,
    marker => !isNetworkMarker(marker)
  );
}

// Identifies mime type of a network request.
export function guessMimeTypeFromNetworkMarker(
  payload: NetworkPayload
): string | null {
  let uri;
  try {
    uri = new URL(payload.URI);
  } catch (e) {
    return null;
  }

  // Extracting the fileName from the path.
  // This is a workaround until we have
  // mime types passed from gecko to network marker requests.

  const fileName = uri.pathname;
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex < 0) {
    return null;
  }

  const fileExt = fileName.slice(lastDotIndex + 1);

  switch (fileExt) {
    case 'js':
      return 'application/javascript';
    case 'css':
    case 'html':
      return `text/${fileExt}`;
    case 'gif':
    case 'png':
      return `image/${fileExt}`;
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    default:
      return null;
  }
}

// This function returns one of the global css classes, or the empty string,
// depending on the input mime type. Usually this function is fed the result of
// `guessMimeTypeFromNetworkMarker`.
export function getColorClassNameForMimeType(
  mimeType: string | null
):
  | 'network-color-css'
  | 'network-color-js'
  | 'network-color-html'
  | 'network-color-img'
  | 'network-color-other' {
  switch (mimeType) {
    case 'text/css':
      return 'network-color-css';
    case 'text/html':
      return 'network-color-html';
    case 'application/javascript':
      return 'network-color-js';
    case null:
      return 'network-color-other';
    default:
      if (mimeType.startsWith('image/')) {
        return 'network-color-img';
      }
      return 'network-color-other';
  }
}

export function groupScreenshotsById(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[]
): Map<string, Marker[]> {
  const idToScreenshotMarkers = new Map();
  for (const markerIndex of markerIndexes) {
    const marker = getMarker(markerIndex);
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

export function removeNetworkMarkerURLs(
  payload: NetworkPayload
): NetworkPayload {
  return { ...payload, URI: '', RedirectURI: '' };
}

export function removePrefMarkerPreferenceValues(
  payload: PrefMarkerPayload
): PrefMarkerPayload {
  return { ...payload, prefValue: '' };
}

/**
 * Sanitize FileIO marker's filename property if it's non-empty.
 */
export function sanitizeFileIOMarkerFilenamePath(
  payload: FileIoPayload
): FileIoPayload {
  return {
    ...payload,
    filename: removeFilePath(payload.filename),
  };
}

/**
 * Sanitize Text marker's name property for potential URLs.
 */
export function sanitizeTextMarker(
  payload: TextMarkerPayload
): TextMarkerPayload {
  return {
    ...payload,
    name: removeURLs(payload.name),
  };
}

export function getMarkerFullDescription(marker: Marker) {
  let description = marker.name;

  if (marker.data) {
    const data = marker.data;
    switch (data.type) {
      case 'tracing':
        if (typeof data.category === 'string') {
          if (data.category === 'log' && description.length > 100) {
            description = description.substring(0, 100) + '...';
          } else if (data.category === 'DOMEvent') {
            description = data.eventType;
          }
        }
        break;
      case 'UserTiming':
        description = data.name;
        break;
      case 'FileIO':
        if (data.source) {
          description = `(${data.source}) `;
        }
        description += data.operation;
        if (data.filename) {
          description = data.operation
            ? `${description} — ${data.filename}`
            : data.filename;
        }
        break;
      case 'Text':
        description += ` — ${data.name}`;
        break;
      case 'Log':
        description = `(${data.module}) ${data.name}`;
        break;
      case 'IPC':
        description = `${data.messageType} — ${_formatIPCMarkerDirection(
          data
        )}`;
        break;
      default:
    }
  }
  return description;
}

export function getMarkerCategory(marker: Marker) {
  let category = 'unknown';
  if (marker.data) {
    const data = marker.data;

    if (typeof data.category === 'string') {
      category = data.category;
    }

    switch (data.type) {
      case 'UserTiming':
        category = marker.name;
        break;
      case 'FileIO':
        category = data.type;
        break;
      case 'Bailout':
        category = 'Bailout';
        break;
      case 'Network':
        category = 'Network';
        break;
      case 'Text':
        category = 'Text';
        break;
      case 'Log':
        category = 'Log';
        break;
      case 'IPC':
        category = data.direction === 'sending' ? 'IPC out' : 'IPC in';
        break;
      default:
    }
  }
  return category;
}
