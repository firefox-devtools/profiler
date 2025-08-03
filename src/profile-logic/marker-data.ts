/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { getEmptyRawMarkerTable } from './data-structures';
import { getFriendlyThreadName } from './profile-data';
import { removeFilePath, removeURLs, stringsToRegExp } from '../utils/string';
import { StringTable } from '../utils/string-table';
import { ensureExists, assertExhaustiveCheck } from '../utils/flow';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';
import {
  getSchemaFromMarker,
  markerPayloadMatchesSearch,
} from './marker-schema';

import {
  SamplesTable,
  RawThread,
  RawProfileSharedData,
  RawMarkerTable,
  IndexIntoStringTable,
  IndexIntoRawMarkerTable,
  IndexIntoCategoryList,
  CategoryList,
  Marker,
  MarkerIndex,
  MarkerPayload,
  IPCSharedData,
  IPCMarkerPayload,
  NetworkPayload,
  PrefMarkerPayload,
  TextMarkerPayload,
  StartEndRange,
  IndexedArray,
  DerivedMarkerInfo,
  MarkerSchema,
  MarkerSchemaByName,
  MarkerDisplayLocation,
  Tid,
} from 'firefox-profiler/types';

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
      end: lastTimestamp,
      name: 'Jank',
      category: otherCategoryIndex,
      threadId: null,
      data: { type: 'Jank' },
    });

  let lastResponsiveness: number = 0;
  let lastTimestamp: number = 0;
  const jankInstances: Marker[] = [];
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
  getMarker: (markerIndex: MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  markerSchemaByName: MarkerSchemaByName,
  searchRegExps: MarkerRegExps | null,
  stringTable: StringTable,
  categoryList: CategoryList
): MarkerIndex[] {
  if (!searchRegExps) {
    return markerIndexes;
  }

  let hasPositiveRegexps = Boolean(searchRegExps.generic);
  let hasNegativeRegexps = false;

  for (const val of searchRegExps.fieldMap.values()) {
    hasPositiveRegexps = hasPositiveRegexps || val.positive !== null;
    hasNegativeRegexps = hasNegativeRegexps || val.negative !== null;
  }

  const newMarkers: MarkerIndex[] = [];
  for (const markerIndex of markerIndexes) {
    const marker = getMarker(markerIndex);
    // Starting includeMarker with true in case `hasPositiveRegexps` is false.
    // Otherwise it will be overwritten inside the next if branch.
    let includeMarker = true;
    // If there are positive RegExps, then check if the marker will be included.
    if (hasPositiveRegexps) {
      includeMarker = positiveFilterMarker(
        marker,
        markerSchemaByName,
        searchRegExps,
        stringTable,
        categoryList
      );
    }

    // If the marker marked as `included` so far by the positive regexps, check
    // for negative RegExps and filter if there are any. If `includeMarker` is
    // false here it means that it's already excluded so there is no point of
    // checking it for negative filtering.
    if (includeMarker && hasNegativeRegexps) {
      includeMarker = negativeFilterMarker(
        marker,
        markerSchemaByName,
        searchRegExps,
        stringTable,
        categoryList
      );
    }

    if (includeMarker) {
      newMarkers.push(markerIndex);
    }
  }

  return newMarkers;
}

function positiveFilterMarker(
  marker: Marker,
  markerSchemaByName: MarkerSchemaByName,
  searchRegExps: MarkerRegExps,
  stringTable: StringTable,
  categoryList: CategoryList
): boolean {
  // Need to assign it to a constant variable so Flow doesn't complain about
  // passing it inside a function below.
  const regExps = searchRegExps;

  function test(value: string, key: string) {
    key = key.toLowerCase();
    const fieldRegexp = regExps.fieldMap.get(key);
    const found =
      (regExps.generic ? regExps.generic.test(value) : false) ||
      (fieldRegexp && fieldRegexp.positive
        ? fieldRegexp.positive.test(value)
        : false);

    // Reset regexp for each iteration. Otherwise state from previous
    // iterations can cause matches to fail if the search is global or
    // sticky.
    if (regExps.generic) {
      regExps.generic.lastIndex = 0;
    }
    if (fieldRegexp && fieldRegexp.positive) {
      fieldRegexp.positive.lastIndex = 0;
    }
    return found;
  }

  const { data, name, category } = marker;

  if (categoryList[category] !== undefined) {
    const markerCategory = categoryList[category].name;
    if (test(markerCategory, 'cat')) {
      return true;
    }
  }

  if (test(name, 'name')) {
    return true;
  }

  if (data && typeof data === 'object') {
    if (test(data.type, 'type')) {
      // Check the type of the marker payload first.
      return true;
    }

    // Now check the schema for the marker payload for field matches
    const markerSchema = getSchemaFromMarker(markerSchemaByName, marker.data);
    if (
      markerSchema &&
      markerPayloadMatchesSearch(markerSchema, marker, stringTable, test)
    ) {
      return true;
    }
  }

  return false;
}

function negativeFilterMarker(
  marker: Marker,
  markerSchemaByName: MarkerSchemaByName,
  searchRegExps: MarkerRegExps,
  stringTable: StringTable,
  categoryList: CategoryList
): boolean {
  // Need to assign it to a constant variable so Flow doesn't complain about
  // passing it inside a function below.
  const regExps = searchRegExps;

  function test(value: string, key: string) {
    key = key.toLowerCase();
    const fieldRegexp = regExps.fieldMap.get(key);
    const negativeRegexp = fieldRegexp?.negative;
    if (!negativeRegexp) {
      return false;
    }

    const found = negativeRegexp.test(value);

    // Reset regexp for each iteration. Otherwise state from previous
    // iterations can cause matches to fail if the search is global or
    // sticky.
    negativeRegexp.lastIndex = 0;
    return found;
  }

  const { data, name, category } = marker;

  if (categoryList[category] !== undefined) {
    const markerCategory = categoryList[category].name;
    if (test(markerCategory, 'cat')) {
      // Found the category in the negative filters, do not include it.
      return false;
    }
  }

  if (test(name, 'name')) {
    // Found the name in the negative filters, do not include it.
    return false;
  }

  if (data && typeof data === 'object') {
    if (test(data.type, 'type')) {
      // Found the type of the payload in the negative filters, do not include it.
      return false;
    }

    // Now check the schema for the marker payload for field matches
    const markerSchema = getSchemaFromMarker(markerSchemaByName, marker.data);

    if (
      markerSchema &&
      markerPayloadMatchesSearch(markerSchema, marker, stringTable, test)
    ) {
      // Found the field in the negative filters, do not include it.
      return false;
    }
  }

  return true;
}

/**
 * This class is a specialized Map for IPC marker data, using the thread ID and
 * marker index as the key, and storing IPCSharedData (which holds the start/end
 * times for the IPC message.
 */
export class IPCMarkerCorrelations {
  _correlations: Map<Tid, Map<number, IPCSharedData>>;

  constructor() {
    this._correlations = new Map();
  }

  set(tid: Tid, index: number, data: IPCSharedData): void {
    let threadData = this._correlations.get(tid);
    if (!threadData) {
      threadData = new Map();
      this._correlations.set(tid, threadData);
    }
    threadData.set(index, data);
  }

  get(tid: Tid, index: number): IPCSharedData | undefined {
    const threadData = this._correlations.get(tid);
    if (!threadData) {
      return undefined;
    }
    return threadData.get(index);
  }
}

/**
 * This function correlates the sender and recipient sides of IPC markers so
 * that we can share data between the two during profile processing.
 *
 * A single IPC message consists of 5 markers:
 *
 *        endpoint   (sender or background thread)
 *            |      (or main thread in sender process if they are not profiled)
 *            |
 *            v
 *     transferStart (IPC I/O thread in sender process)
 *            |      (or main thread in sender process if it's not profiled)
 *            |
 *            v
 *      transferEnd  (IPC I/O thread in sender process)
 *            |      (or main thread in sender process if it's not profiled)
 *            |
 *            v
 *      transferEnd  (IPC I/O thread in receiver process)
 *            |      (or main thread in receiver process if it's not profiled)
 *            |
 *            v
 *        endpoint   (receiver or background thread)
 *                   (or main thread in receiver process if they are not profiled)
 */
export function correlateIPCMarkers(
  threads: RawThread[],
  shared: RawProfileSharedData
): IPCMarkerCorrelations {
  // Create a unique ID constructed from the source PID, destination PID,
  // message seqno, and message type. Since the seqno is only unique for each
  // message channel pair, we use the PIDs and message type as a way of
  // identifying which channel pair generated this message.
  function makeIPCMessageID(thread: RawThread, data: IPCMarkerPayload): string {
    let pids;
    if (data.direction === 'sending') {
      pids = `${thread.pid},${data.otherPid}`;
    } else {
      pids = `${data.otherPid},${thread.pid}`;
    }
    return pids + `,${data.messageSeqno},${data.messageType}`;
  }

  function formatThreadName(tid: number | undefined): string | undefined {
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
    const { phase } = data;
    if (data.direction === 'sending') {
      switch (phase) {
        case 'endpoint':
        // We don't have a 'phase' field in the older profiles, in that case
        // their phase is 'endpoint'. (fallthrough)
        case undefined:
          return 0;
        case 'transferStart':
          return 1;
        case 'transferEnd':
          return 2;
        default:
          throw assertExhaustiveCheck(phase, `Unhandled IPC phase type.`);
      }
    } else {
      switch (phase) {
        case 'transferEnd':
          return 3;
        case 'endpoint':
        // We don't have a 'phase' field in the older profiles, in that case
        // their phase is 'endpoint'. (fallthrough)
        case undefined:
          return 4;
        case 'transferStart':
          throw new Error(
            'Unexpected "transferStart" phase found on receiving side.'
          );
        default:
          throw assertExhaustiveCheck(phase, `Unhandled IPC phase type.`);
      }
    }
  }

  // Don't bother checking for IPC markers if the profile's string table
  // doesn't have the string "IPC". This lets us avoid looping over all the
  // markers when we don't have to.
  const stringTable = StringTable.withBackingArray(shared.stringArray);
  if (!stringTable.hasString('IPC')) {
    return new IPCMarkerCorrelations();
  }

  // First, construct a mapping of marker IDs to an array of markers with that
  // ID for faster lookup. We also collect the friendly thread names while we
  // have access to all the threads. It's considerably more difficult to do
  // this processing later.
  const markersByKey: Map<
    string,
    Array<{ tid: number; index: number; data: IPCMarkerPayload } | void>
  > = new Map();
  const threadNames: Map<number, string> = new Map();
  for (const thread of threads) {
    if (typeof thread.tid === 'number') {
      const tid: number = thread.tid;
      threadNames.set(tid, getFriendlyThreadName(threads, thread));

      for (let index = 0; index < thread.markers.length; index++) {
        const data = thread.markers.data[index];
        if (!data || data.type !== 'IPC') {
          continue;
        }
        const key = makeIPCMessageID(thread, data);
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
    const startEndpointMarker = markers[0];
    const endEndpointMarker = markers[4];
    const sendTid = startEndpointMarker ? startEndpointMarker.tid : undefined;
    const recvTid = endEndpointMarker ? endEndpointMarker.tid : undefined;
    const sharedData: IPCSharedData = {
      startTime: startEndpointMarker
        ? startEndpointMarker.data.startTime
        : undefined,
      sendStartTime: markers[1] ? markers[1].data.startTime : undefined,
      sendEndTime: markers[2] ? markers[2].data.startTime : undefined,
      recvEndTime: markers[3] ? markers[3].data.startTime : undefined,
      endTime: endEndpointMarker ? endEndpointMarker.data.startTime : undefined,
      sendTid,
      recvTid,
      sendThreadName: formatThreadName(sendTid),
      recvThreadName: formatThreadName(recvTid),
    };

    const addedThreadIds = new Set();
    if (startEndpointMarker) {
      addedThreadIds.add(startEndpointMarker.tid);
      correlations.set(
        startEndpointMarker.tid,
        startEndpointMarker.index,
        sharedData
      );
    }
    if (endEndpointMarker) {
      addedThreadIds.add(endEndpointMarker.tid);
      correlations.set(
        endEndpointMarker.tid,
        endEndpointMarker.index,
        sharedData
      );
    }

    // We added both endpoints to the correlations now (if they are present).
    // If both of them are present at the same time, we don't need to add the
    // middle three markers because these are the I/O related markers that
    // happen in another thread (IPC I/O if profiled, main thread if not profiled).
    if (!startEndpointMarker || !endEndpointMarker) {
      // If both markers from sender and receiver threads are present, we can
      // only add the markers of them to the correlations. That way, the middle
      // markers from IPC I/O threads will not be visible in the main thread and
      // make the main thread crowded. It's important to add all the threads to
      // the marker.
      for (const m of markers.slice(1, 4)) {
        if (m !== undefined) {
          const marker = m as {
            tid: number;
            index: number;
            data: IPCMarkerPayload;
          };
          if (!addedThreadIds.has(marker.tid)) {
            // Add the marker to a thread only if it's not already added.
            correlations.set(marker.tid, marker.index, sharedData);
            addedThreadIds.add(marker.tid);
          }
        }
      }
    }
  }
  return correlations;
}

/**
 * This function is the canonical place to turn the RawMarkerTable into our fully
 * processed Marker type. It handles the phases of markers that can be emitted
 * by the Gecko profiler. These are defined by the MarkerPhase type.
 *
 * Instant - Represents a single point in time.
 * Interval - A complete marker that represents an interval of time.
 * IntervalStart, IntervalEnd - These two types represent incomplete markers that
 *   must be reconstructed into a single marker. If a start and end are found, they
 *   are matched together. Start and end markers should be correctly nested. If
 *   a start marker is found without an end, its end time is set to the end of
 *   the thread range. For the reverse situation, it's set to the start.
 *
 * There is also some special handling of different markers.
 *   - CompositorScreenshot - They are turned from Instant markers to Interval markers
 *   - IPC - They are matched up.
 *   - Network - They have different network phases.
 *
 * Finally, the Marker format is what we care about in the front-end, but sometimes
 * we need to modify the RawMarkerTable, e.g. for comparisons and for sanitization.
 * In order to get back to the RawMarkerTable, this function provides a
 * markerIndexToRawMarkerIndexes array.
 */
export function deriveMarkersFromRawMarkerTable(
  rawMarkers: RawMarkerTable,
  stringArray: ReadonlyArray<string>,
  threadId: Tid,
  threadRange: StartEndRange,
  ipcCorrelations: IPCMarkerCorrelations
): DerivedMarkerInfo {
  const markers: Marker[] = [];
  const markerIndexToRawMarkerIndexes: IndexedArray<
    MarkerIndex,
    IndexIntoRawMarkerTable[]
  > = [];

  // These maps contain the start markers we find while looping the marker
  // table.
  // The first map contains the start markers for tracing markers. They can be
  // nested and that's why we use an array structure as value.
  const openIntervalMarkers: Map<IndexIntoStringTable, MarkerIndex[]> =
    new Map();

  // The second map contains the start markers for network markers.
  // Note that we don't have more than 2 network markers with the same name as
  // the name contains an incremented index. Therefore we don't need to use an
  // array as value like for tracing markers.
  const openNetworkMarkers: Map<number, MarkerIndex> = new Map();

  function addMarker(indexes: IndexIntoRawMarkerTable[], marker: Marker) {
    markerIndexToRawMarkerIndexes.push(indexes);
    markers.push(marker);
  }

  // In the case of separate markers for the start and end of an interval,
  // merge the payloads together, with the end data overriding the start.
  function mergeIntervalData(
    startData: MarkerPayload | null,
    endData: MarkerPayload | null
  ): MarkerPayload | null {
    if (startData === null) {
      return endData;
    }
    if (endData === null) {
      return startData;
    }
    return {
      ...startData,
      ...endData,
    };
  }

  // We don't add a screenshot marker as we find it, because to know its
  // duration we need to wait until the next one or the end of the profile. So
  // we keep it here.
  const previousScreenshotMarkers: Map<string, MarkerIndex> = new Map();
  for (
    let rawMarkerIndex = 0;
    rawMarkerIndex < rawMarkers.length;
    rawMarkerIndex++
  ) {
    const name = rawMarkers.name[rawMarkerIndex];
    const maybeStartTime = rawMarkers.startTime[rawMarkerIndex];
    const maybeEndTime = rawMarkers.endTime[rawMarkerIndex];
    const phase = rawMarkers.phase[rawMarkerIndex];
    const data = rawMarkers.data[rawMarkerIndex];
    const category = rawMarkers.category[rawMarkerIndex];
    const markerThreadId = rawMarkers.threadId
      ? rawMarkers.threadId[rawMarkerIndex]
      : null;

    // Normally, we would look at the marker phase, but some types require special
    // handling. See if these need to be handled first.
    if (data) {
      switch (data.type) {
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

          const ensureMessage =
            'Network markers are assumed to have a start and end time.';
          if (data.status === 'STATUS_START') {
            openNetworkMarkers.set(data.id, rawMarkerIndex);
          } else {
            // End status can be any status other than 'STATUS_START'. They are
            // either 'STATUS_STOP', 'STATUS_REDIRECT' or 'STATUS_CANCEL'.
            const endData = data;

            const startIndex = openNetworkMarkers.get(data.id);
            if (startIndex !== undefined) {
              // A start marker matches this end marker.
              openNetworkMarkers.delete(data.id);

              // We know this startIndex points to a Network marker.
              const startData: NetworkPayload = rawMarkers.data[
                startIndex
              ] as any;

              const startStartTime = ensureExists(
                rawMarkers.startTime[startIndex],
                ensureMessage
              );
              const endStartTime = ensureExists(maybeStartTime, ensureMessage);
              const endEndTime = ensureExists(maybeEndTime, ensureMessage);

              addMarker([startIndex, rawMarkerIndex], {
                start: startStartTime,
                end: endEndTime,
                name: stringArray[name],
                category,
                threadId: markerThreadId,
                data: {
                  ...endData,
                  startTime: startStartTime,
                  fetchStart: endStartTime,
                  cause: startData.cause || endData.cause,
                },
              });
            } else {
              // There's no start marker matching this end marker. This means an
              // abstract marker exists before the start of the profile.
              const start = Math.min(
                threadRange.start,
                ensureExists(
                  maybeStartTime,
                  'Network markers are assumed to have a start time.'
                )
              );
              const end = ensureExists(maybeEndTime, ensureMessage);
              addMarker([rawMarkerIndex], {
                start,
                end,
                name: stringArray[name],
                category,
                threadId: markerThreadId,
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

          continue;
        }

        case 'CompositorScreenshot': {
          // Screenshot markers are already ordered. In the raw marker table,
          // they're Instant markers, but since they're valid until the following
          // raw marker of the same type and the same window, we convert them to
          // Interval markers with a a start and end time.

          const { windowID } = data;
          const previousScreenshotMarker =
            previousScreenshotMarkers.get(windowID);
          if (previousScreenshotMarker !== undefined) {
            previousScreenshotMarkers.delete(windowID);
            const previousStartTime = ensureExists(
              rawMarkers.startTime[previousScreenshotMarker],
              'Expected to find a start time for a screenshot marker.'
            );
            const thisStartTime = ensureExists(
              maybeStartTime,
              'The CompositorScreenshot is assumed to have a start time.'
            );
            const data = rawMarkers.data[previousScreenshotMarker];
            const markerThreadId = rawMarkers.threadId
              ? rawMarkers.threadId[previousScreenshotMarker]
              : null;
            addMarker([previousScreenshotMarker], {
              start: previousStartTime,
              end: thisStartTime,
              name: 'CompositorScreenshot',
              category,
              threadId: markerThreadId,
              data,
            });
          }
          if (stringArray[name] === 'CompositorScreenshotWindowDestroyed') {
            // This marker is added when a window is destroyed. In this case we
            // don't want to store it as the start of the next compositor
            // marker. But we do want to keep it, so we break out of the
            // switch/case so that the standard processing happens.
            break;
          } else {
            previousScreenshotMarkers.set(windowID, rawMarkerIndex);
          }

          continue;
        }

        case 'IPC': {
          const sharedData = ipcCorrelations.get(
            // Older profiles don't have a tid, but they also don't have the IPC markers.
            threadId || 0,
            rawMarkerIndex
          );
          if (!sharedData) {
            // Sometimes a thread can include multiple IPC markers from the same
            // IPC message. We only show a single marker from that thread. That
            // way, there won't be any duplicate markers for the same IPC
            // message in the thread.
            continue;
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
            continue;
          }

          let name = data.direction === 'sending' ? 'IPCOut' : 'IPCIn';
          if (data.sync) {
            name = 'Sync' + name;
          }

          let start = ensureExists(
            data.startTime,
            'Expected IPC startTime to exist in the payload.'
          );
          let end = start;
          let incomplete = true;
          if (
            sharedData.startTime !== undefined &&
            sharedData.endTime !== undefined
          ) {
            start = sharedData.startTime;
            end = sharedData.endTime;
            incomplete = false;
          }

          const allData = {
            ...data,
            ...sharedData,
            niceDirection:
              data.direction === 'sending'
                ? `sent to ${sharedData.recvThreadName || data.otherPid}`
                : `received from ${sharedData.sendThreadName || data.otherPid}`,
          };

          // TODO - How do I get the other rawMarkerIndexes
          addMarker([rawMarkerIndex], {
            start,
            end,
            name,
            category,
            threadId: markerThreadId,
            data: allData,
            incomplete,
          });

          continue;
        }

        default:
        // Do nothing;
      }
    }

    switch (phase) {
      case INSTANT:
        addMarker([rawMarkerIndex], {
          start: ensureExists(
            maybeStartTime,
            'An Instant marker did not have a startTime.'
          ),
          end: null,
          name: stringArray[name],
          category,
          threadId: markerThreadId,
          data,
        });
        break;
      case INTERVAL:
        {
          const startTime = ensureExists(
            maybeStartTime,
            'An Interval marker did not have a startTime.'
          );
          const endTime = ensureExists(
            maybeEndTime,
            'An Interval marker did not have a startTime.'
          );
          // Add a marker with a zero duration
          addMarker([rawMarkerIndex], {
            start: startTime,
            end: endTime,
            name: stringArray[name],
            category,
            threadId: markerThreadId,
            data,
          });
        }
        break;
      case INTERVAL_START:
        {
          let openMarkersForName = openIntervalMarkers.get(name);
          if (!openMarkersForName) {
            openMarkersForName = [];
            openIntervalMarkers.set(name, openMarkersForName);
          }
          openMarkersForName.push(rawMarkerIndex);
        }
        break;
      case INTERVAL_END:
        {
          const openMarkersForName = openIntervalMarkers.get(name);

          let startIndex;

          if (openMarkersForName) {
            startIndex = openMarkersForName.pop();
          }

          const endTime = ensureExists(
            maybeEndTime,
            'An IntervalEnd marker did not have an endTime'
          );

          if (startIndex !== undefined) {
            // A start marker matches this end marker.
            const start = ensureExists(
              rawMarkers.startTime[startIndex],
              'An IntervalStart marker did not have a startTime'
            );
            addMarker([startIndex, rawMarkerIndex], {
              start,
              name: stringArray[name],
              end: endTime,
              category,
              threadId: markerThreadId,
              data: mergeIntervalData(rawMarkers.data[startIndex], data),
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
            const start = Math.min(endTime, threadRange.start);

            addMarker([rawMarkerIndex], {
              start,
              name: stringArray[name],
              end: endTime,
              category,
              threadId: markerThreadId,
              data,
              incomplete: true,
            });
          }
        }
        break;
      default:
        throw new Error('Unhandled marker phase type.');
    }
  }

  const endOfThread = threadRange.end;

  // Loop over "start" markers without any "end" markers.
  for (const markerBucket of openIntervalMarkers.values()) {
    for (const startIndex of markerBucket) {
      const start = ensureExists(
        rawMarkers.startTime[startIndex],
        'Encountered a marker without a startTime. Eventually this needs to be handled ' +
          'for phase-style markers.'
      );
      addMarker([startIndex], {
        start,
        end: Math.max(endOfThread, start),
        name: stringArray[rawMarkers.name[startIndex]],
        data: rawMarkers.data[startIndex],
        category: rawMarkers.category[startIndex],
        threadId: rawMarkers.threadId ? rawMarkers.threadId[startIndex] : null,
        incomplete: true,
      });
    }
  }

  for (const startIndex of openNetworkMarkers.values()) {
    const startTime = ensureExists(
      rawMarkers.startTime[startIndex],
      'Network markers are assumed to always have a start time.'
    );
    addMarker([startIndex], {
      start: startTime,
      end: Math.max(endOfThread, startTime),
      name: stringArray[rawMarkers.name[startIndex]],
      category: rawMarkers.category[startIndex],
      threadId: rawMarkers.threadId ? rawMarkers.threadId[startIndex] : null,
      data: rawMarkers.data[startIndex],
      incomplete: true,
    });
  }

  // And we also need to add the "last screenshot markers".
  for (const previousScreenshotMarker of previousScreenshotMarkers.values()) {
    const start = ensureExists(
      rawMarkers.startTime[previousScreenshotMarker],
      'Expected to find a CompositorScreenshot marker with a start time.'
    );
    addMarker([previousScreenshotMarker], {
      start,
      end: Math.max(endOfThread, start),
      name: 'CompositorScreenshot',
      category: rawMarkers.category[previousScreenshotMarker],
      threadId: rawMarkers.threadId
        ? rawMarkers.threadId[previousScreenshotMarker]
        : null,
      data: rawMarkers.data[previousScreenshotMarker],
    });
  }

  return { markers, markerIndexToRawMarkerIndexes };
}

/**
 * This function filters markers from a thread's raw marker table using the
 * range specified as parameter. It's not used by the normal marker filtering
 * pipeline, but is used in profile comparison.
 */
export function filterRawMarkerTableToRange(
  markerTable: RawMarkerTable,
  derivedMarkerInfo: DerivedMarkerInfo,
  rangeStart: number,
  rangeEnd: number
): RawMarkerTable {
  const newMarkerTable = getEmptyRawMarkerTable();
  if (markerTable.threadId) {
    newMarkerTable.threadId = [];
  }

  const filteredMarkerIndexes = filterRawMarkerTableIndexesToRange(
    markerTable,
    derivedMarkerInfo,
    rangeStart,
    rangeEnd
  );

  for (const index of filteredMarkerIndexes) {
    newMarkerTable.startTime.push(markerTable.startTime[index]);
    newMarkerTable.endTime.push(markerTable.endTime[index]);
    newMarkerTable.phase.push(markerTable.phase[index]);
    newMarkerTable.name.push(markerTable.name[index]);
    newMarkerTable.data.push(markerTable.data[index]);
    newMarkerTable.category.push(markerTable.category[index]);
    if (markerTable.threadId && newMarkerTable.threadId) {
      newMarkerTable.threadId.push(markerTable.threadId[index]);
    }
    newMarkerTable.length++;
  }

  return newMarkerTable;
}

/**
 * This function filters a raw marker table to just the indexes that are in range.
 * This is done by going the derived Marker[] list, and finding the original markers
 * that make up that marker.
 */
export function filterRawMarkerTableIndexesToRange(
  markerTable: RawMarkerTable,
  derivedMarkerInfo: DerivedMarkerInfo,
  rangeStart: number,
  rangeEnd: number
): IndexIntoRawMarkerTable[] {
  const { markers, markerIndexToRawMarkerIndexes } = derivedMarkerInfo;
  const inRange: Set<IndexIntoRawMarkerTable> = new Set();
  for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    const { start, end } = markers[markerIndex];
    if (end === null) {
      if (start < rangeEnd && start >= rangeStart) {
        for (const rawIndex of markerIndexToRawMarkerIndexes[markerIndex]) {
          inRange.add(rawIndex);
        }
      }
    } else {
      if (start < rangeEnd && end >= rangeStart) {
        for (const rawIndex of markerIndexToRawMarkerIndexes[markerIndex]) {
          inRange.add(rawIndex);
        }
      }
    }
  }

  return [...inRange].sort((a, b) => a - b);
}

/**
 * This function filters markers from a thread's raw marker table using the
 * range and marker indexes array specified as parameters.
 *
 * Uses `filterRawMarkerTableIndexesToRange` function and excludes
 * markers in `markersToDelete` set.
 */
export function filterRawMarkerTableToRangeWithMarkersToDelete(
  oldMarkerTable: RawMarkerTable,
  derivedMarkerInfo: DerivedMarkerInfo,
  markersToDelete: Set<IndexIntoRawMarkerTable>,
  filterRange: StartEndRange | null
): {
  rawMarkerTable: RawMarkerTable;
  oldMarkerIndexToNew: Map<IndexIntoRawMarkerTable, IndexIntoRawMarkerTable>;
} {
  const newMarkerTable = getEmptyRawMarkerTable();
  const newThreadId: (Tid | null)[] = [];
  if (oldMarkerTable.threadId) {
    newMarkerTable.threadId = newThreadId;
  }
  const oldMarkerIndexToNew: Map<
    IndexIntoRawMarkerTable,
    IndexIntoRawMarkerTable
  > = new Map();
  const addMarkerIndexIfIncluded = (index: IndexIntoRawMarkerTable) => {
    if (markersToDelete.has(index)) {
      return;
    }
    oldMarkerIndexToNew.set(index, newMarkerTable.length);
    newMarkerTable.name.push(oldMarkerTable.name[index]);
    newMarkerTable.startTime.push(oldMarkerTable.startTime[index]);
    newMarkerTable.endTime.push(oldMarkerTable.endTime[index]);
    newMarkerTable.phase.push(oldMarkerTable.phase[index]);
    newMarkerTable.data.push(oldMarkerTable.data[index]);
    newMarkerTable.category.push(oldMarkerTable.category[index]);
    if (oldMarkerTable.threadId) {
      newThreadId.push(oldMarkerTable.threadId[index]);
    }
    newMarkerTable.length++;
  };

  if (filterRange === null) {
    // If user doesn't want to filter out the full time range, remove only
    // markers that we want to remove.
    for (let i = 0; i < oldMarkerTable.length; i++) {
      addMarkerIndexIfIncluded(i);
    }
  } else {
    // If user wants to remove full time range, filter all the markers
    // accordingly.
    const { start, end } = filterRange;
    const filteredMarkerIndexes = filterRawMarkerTableIndexesToRange(
      oldMarkerTable,
      derivedMarkerInfo,
      start,
      end
    );

    for (const index of filteredMarkerIndexes) {
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
  getMarker: (markerIndex: MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  filterFunc: (marker: Marker) => boolean
): MarkerIndex[] {
  return markerIndexes.filter((markerIndex) => {
    return filterFunc(getMarker(markerIndex));
  });
}

export function filterMarkerIndexesToRange(
  getMarker: (markerIndex: MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  rangeStart: number,
  rangeEnd: number
): MarkerIndex[] {
  return filterMarkerIndexes(
    getMarker,
    markerIndexes,
    (marker) =>
      marker.start <= rangeEnd && (marker.end || marker.start) >= rangeStart
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

  if (
    name === 'FirstContentfulPaint' ||
    name === 'FirstContentfulComposite' ||
    name === 'LargestContentfulPaint'
  ) {
    // Add the performance metric markers.
    return true;
  }

  if (!data) {
    return false;
  }

  if ((data as any).innerWindowID && name === 'Navigation::Start') {
    return true;
  }

  if ((data as any).category === 'Navigation') {
    // Filter by payloads.
    if (name === 'Load' || name === 'DOMContentLoaded') {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if the marker is an on-thread FileIO marker, false if off-thread,
 * and undefined if the marker is not FileIO.
 *
 * The FileIO markers can be either on-thread or off-thread. If the FileIO marker
 * has a threadId, that means the marker does not belong to that thread but rather
 * belongs to the thread with the given threadId, which is off-thread.
 *
 * We don't want to display the off-thread markers in some parts of the UI because
 * they bring a lot of noise.
 */
export function isOnThreadFileIoMarker(marker: Marker): boolean | void {
  const { data } = marker;
  if (!data || data.type !== 'FileIO') {
    // This is not a FileIO marker, do make a decision on filtering.
    return undefined;
  }

  // If thread ID isn't there, that means this FileIO marker belongs to that thread.
  return data.threadId === undefined;
}

/**
 * This function is used by the marker chart and marker table. When filtering by
 * schema for these areas, we want to be as permissive as possible when no schema
 * is present.
 */
export function getAllowMarkersWithNoSchema(
  markerSchemaByName: MarkerSchemaByName
): (marker: Marker) => boolean | void {
  return (marker) => {
    const { data } = marker;

    if (!data) {
      // Keep the marker if there is no payload.
      return true;
    }

    if (!markerSchemaByName[data.type]) {
      // Keep the marker if there is no schema. In the marker chart
      // and marker table, most likely we want to show everything.
      return true;
    }
    return undefined;
  };
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
  getMarker: (markerIndex: MarkerIndex) => Marker,
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

/**
 * Sanitize Extension Text marker's name property for potential add-on ids.
 */
export function sanitizeExtensionTextMarker(
  markerName: string,
  payload: TextMarkerPayload
): TextMarkerPayload {
  if (['ExtensionParent', 'ExtensionChild'].includes(markerName)) {
    return {
      ...payload,
      name: payload.name.replace(/^.*, (api_(call|event): )/, '$1'),
    };
  }

  if (markerName === 'Extension Suspend') {
    return {
      ...payload,
      name: payload.name.replace(/ by .*$/, ''),
    };
  }

  return payload;
}

export function sanitizeFromMarkerSchema(
  markerSchema: MarkerSchema,
  markerPayload: MarkerPayload
): MarkerPayload {
  for (const { key, format } of markerSchema.fields) {
    if (!(key in markerPayload)) {
      continue;
    }

    // We're typing the result of the sanitization with `any` because Flow
    // doesn't like much our enormous enum of non-exact objects that's used as
    // MarkerPayload type, and this code is too generic for Flow in this context.
    if (format === 'url') {
      markerPayload = {
        ...markerPayload,
        [key]: removeURLs((markerPayload as any)[key]),
      } as any;
    } else if (format === 'file-path') {
      markerPayload = {
        ...markerPayload,
        [key]: removeFilePath((markerPayload as any)[key]),
      } as any;
    } else if (format === 'sanitized-string') {
      markerPayload = {
        ...markerPayload,
        [key]: '<sanitized>',
      } as any;
    }
  }

  return markerPayload;
}

/**
 * Markers can be filtered by display area using the marker schema. Get a list of
 * marker "types" (the type field in the Payload) for a specific location.
 */
export function getMarkerTypesForDisplay(
  markerSchema: MarkerSchema[],
  displayArea: MarkerDisplayLocation
): Set<string> {
  const types = new Set<string>();
  for (const { display, name } of markerSchema) {
    if (display.includes(displayArea)) {
      types.add(name);
    }
  }
  return types;
}

function _doNotAutomaticallyAdd(_data: Marker): boolean | void {
  return undefined;
}

/**
 * Filter markers to a smaller set based on the location.
 */
export function filterMarkerByDisplayLocation(
  getMarker: (markerIndex: MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  markerSchema: MarkerSchema[],
  markerSchemaByName: MarkerSchemaByName,
  displayLocation: MarkerDisplayLocation,
  // This argument allows a filtering function to customize the result, without having
  // to loop through all of the markers again. Return a boolean if making a decision,
  // or undefined if not.
  preemptiveFilterFunc: (
    data: Marker
  ) => boolean | void = _doNotAutomaticallyAdd
): MarkerIndex[] {
  const markerTypes = getMarkerTypesForDisplay(markerSchema, displayLocation);
  return filterMarkerIndexes(getMarker, markerIndexes, (marker): boolean => {
    const additionalResult = preemptiveFilterFunc(marker);

    if (additionalResult !== undefined) {
      // This is a boolean value, use it rather than the schema.
      return additionalResult as boolean;
    }

    const schemaName = marker.data ? (marker.data.type ?? null) : null;
    return schemaName !== null && markerTypes.has(schemaName);
  });
}

/**
 * Compute the Screenshot image's thumbnail size.
 */
export function computeScreenshotSize(
  payload: { windowWidth: number; windowHeight: number },
  maximumSize: number
): { readonly width: number; readonly height: number } {
  const { windowWidth, windowHeight } = payload;

  // Coefficient should be according to bigger side.
  const coefficient =
    windowHeight > windowWidth
      ? maximumSize / windowHeight
      : maximumSize / windowWidth;
  let width = windowWidth * coefficient;
  let height = windowHeight * coefficient;

  width = Math.round(width);
  height = Math.round(height);

  return {
    width,
    height,
  };
}

export type MarkerSearchFieldMap = Map<
  string,
  { positive: RegExp | null; negative: RegExp | null }
>;

export type MarkerRegExps = $ReadOnly<{
  generic: RegExp | null;
  fieldMap: MarkerSearchFieldMap;
}>;

/**
 * Concatenate an array of strings into multiple RegExps that match on all
 * the marker strings which can include positive and negative field specific search.
 */
export const stringsToMarkerRegExps = (
  strings: string[] | null
): MarkerRegExps | null => {
  if (!strings || !strings.length) {
    return null;
  }

  // We create this map to group all the field specific search strings and then
  // we aggregate them to create a single regexp for each field later.
  const fieldStrings: Map<string, { positive: string[]; negative: string[] }> =
    new Map();
  // These are the non-field specific search strings. They have to be positive
  // as we don't support negative generic filtering.
  const genericPositiveStrings = [];
  for (const string of strings) {
    // Then try to match specific properties.
    // First capture group is used to determine if it has a "-" in front of the
    // field to understand if it's a negative filter.
    // Second capture group is used to get the field name.
    // Third capture group is to get the filter value.
    const prefixMatch = string.match(
      /^(?<maybeNegative>-?)(?<key>\w+):(?<value>.+)/i
    );
    if (prefixMatch && prefixMatch.groups) {
      // This is a key-value pair that will only be matched for a specific field.
      const { maybeNegative, value } = prefixMatch.groups;
      const key = prefixMatch.groups.key.toLowerCase();
      let fieldStrs = fieldStrings.get(key);
      if (!fieldStrs) {
        fieldStrs = { positive: [], negative: [] };
        fieldStrings.set(key, fieldStrs);
      }

      // First capture group checks if we have "-" in front of the string to see
      // if it's a negative filtering.
      if (maybeNegative.length === 0) {
        fieldStrs.positive.push(value);

        // Always try to match the full string as well.
        genericPositiveStrings.push(string);
      } else {
        fieldStrs.negative.push(value);
      }
    } else {
      genericPositiveStrings.push(string);
    }
  }

  // Now we constructed the grouped arrays. Let's convert them into a map of RegExps.
  const fieldMap: MarkerSearchFieldMap = new Map();
  for (const [field, strings] of fieldStrings) {
    fieldMap.set(field, {
      positive: stringsToRegExp(strings.positive),
      negative: stringsToRegExp(strings.negative),
    });
  }

  return {
    generic: stringsToRegExp(genericPositiveStrings),
    fieldMap,
  };
};
