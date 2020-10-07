/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getEmptyRawMarkerTable } from './data-structures';
import { getFriendlyThreadName } from './profile-data';
import { removeFilePath, removeURLs } from '../utils/string';
import { ensureExists } from '../utils/flow';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';
import { getMarkerSchemaName } from './marker-schema';

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
  NetworkPayload,
  PrefMarkerPayload,
  FileIoPayload,
  TextMarkerPayload,
  StartEndRange,
  IndexedArray,
  DerivedMarkerInfo,
  MarkerSchema,
  MarkerSchemaByName,
  MarkerDisplayLocation,
} from 'firefox-profiler/types';

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
  thresholdInMs: number,
  otherCategoryIndex: IndexIntoCategoryList
): Marker[] {
  const addMarker = () =>
    jankInstances.push({
      start: lastTimestamp - lastResponsiveness,
      end: lastTimestamp,
      name: 'Jank',
      category: otherCategoryIndex,
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
  stringTable: UniqueStringArray,
  threadId: number,
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
  const openIntervalMarkers: Map<
    IndexIntoStringTable,
    MarkerIndex[]
  > = new Map();

  // The second map contains the start markers for network markers.
  // Note that we don't have more than 2 network markers with the same name as
  // the name contains an incremented index. Therefore we don't need to use an
  // array as value like for tracing markers.
  const openNetworkMarkers: Map<number, MarkerIndex> = new Map();

  function addMarker(indexes: IndexIntoRawMarkerTable[], marker: Marker) {
    markerIndexToRawMarkerIndexes.push(indexes);
    markers.push(marker);
  }

  // We don't add a screenshot marker as we find it, because to know its
  // duration we need to wait until the next one or the end of the profile. So
  // we keep it here.
  let previousScreenshotMarker: MarkerIndex | null = null;
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

              const startStartTime = ensureExists(
                rawMarkers.startTime[startIndex],
                ensureMessage
              );
              const endStartTime = ensureExists(maybeStartTime, ensureMessage);
              const endEndTime = ensureExists(maybeEndTime, ensureMessage);

              addMarker([startIndex, rawMarkerIndex], {
                start: startStartTime,
                end: endEndTime,
                name: stringTable.getString(name),
                category,
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
                name: stringTable.getString(name),
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

          continue;
        }

        case 'CompositorScreenshot': {
          // Screenshot markers are already ordered. In the raw marker table,
          // they're Instant markers, but since they're valid until the following
          // raw marker of the same type, we convert them to Interval markers with a
          // a start and end time.

          if (previousScreenshotMarker !== null) {
            const previousStartTime = ensureExists(
              rawMarkers.startTime[previousScreenshotMarker],
              'Expected to find a start time for a screenshot marker.'
            );
            const thisStartTime = ensureExists(
              maybeStartTime,
              'The CompositorScreenshot is assumed to have a start time.'
            );
            const data = rawMarkers.data[previousScreenshotMarker];
            addMarker([previousScreenshotMarker], {
              start: previousStartTime,
              end: thisStartTime,
              name: 'CompositorScreenshot',
              category,
              data,
            });
          }

          previousScreenshotMarker = rawMarkerIndex;

          continue;
        }

        case 'IPC': {
          const sharedData = ipcCorrelations.get(threadId, rawMarkerIndex);
          if (!sharedData) {
            // Since shared data is generated for every IPC message, this should
            // never happen unless something has gone catastrophically wrong.
            console.error('Unable to find shared data for IPC marker');
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
          name: stringTable.getString(name),
          category,
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
            name: stringTable.getString(name),
            category,
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
              name: stringTable.getString(name),
              end: endTime,
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
            const start = Math.min(endTime, threadRange.start);

            addMarker([rawMarkerIndex], {
              start,
              name: stringTable.getString(name),
              end: endTime,
              category,
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
        name: stringTable.getString(rawMarkers.name[startIndex]),
        data: rawMarkers.data[startIndex],
        category: rawMarkers.category[startIndex],
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
      name: stringTable.getString(rawMarkers.name[startIndex]),
      category: rawMarkers.category[startIndex],
      data: rawMarkers.data[startIndex],
      incomplete: true,
    });
  }

  // And we also need to add the "last screenshot marker".
  if (previousScreenshotMarker !== null) {
    const start = ensureExists(
      rawMarkers.startTime[previousScreenshotMarker],
      'Expected to find a CompositorScreenshot marker with a start time.'
    );
    addMarker([previousScreenshotMarker], {
      start,
      end: Math.max(endOfThread, start),
      name: 'CompositorScreenshot',
      category: rawMarkers.category[previousScreenshotMarker],
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
  rawMarkerTable: RawMarkerTable,
  oldMarkerIndexToNew: Map<IndexIntoRawMarkerTable, IndexIntoRawMarkerTable>,
} {
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
    newMarkerTable.name.push(oldMarkerTable.name[index]);
    newMarkerTable.startTime.push(oldMarkerTable.startTime[index]);
    newMarkerTable.endTime.push(oldMarkerTable.endTime[index]);
    newMarkerTable.phase.push(oldMarkerTable.phase[index]);
    newMarkerTable.data.push(oldMarkerTable.data[index]);
    newMarkerTable.category.push(oldMarkerTable.category[index]);
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
    marker =>
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
): Marker => boolean | void {
  return marker => {
    const { data } = marker;

    if (!data) {
      // Keep the marker if there is payload.
      return true;
    }

    if (!markerSchemaByName[data.type]) {
      // Keep the marker if there is no schema. Note that this function doesn't use
      // the getMarkerSchemaName function, as that function attempts to find a
      // marker schema name in a very permissive manner. In the marker chart
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

/**
 * Markers can be filtered by display area using the marker schema. Get a list of
 * marker "types" (the type field in the Payload) for a specific location.
 */
export function getMarkerTypesForDisplay(
  markerSchema: MarkerSchema[],
  displayArea: string
): Set<string> {
  const types = new Set();
  for (const { display, name } of markerSchema) {
    if (display.includes(displayArea)) {
      types.add(name);
    }
  }
  return types;
}

function _doNotAutomaticallyAdd(_data: Marker) {
  return undefined;
}

/**
 * Filter markers to a smaller set based on the location.
 */
export function filterMarkerByDisplayLocation(
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  markerSchema: MarkerSchema[],
  markerSchemaByName: MarkerSchemaByName,
  displayLocation: MarkerDisplayLocation,
  // This argument allows a filtering function to customize the result, without having
  // to loop through all of the markers again. Return a boolean if making a decision,
  // or undefined if not.
  preemptiveFilterFunc?: (
    data: Marker
  ) => boolean | void = _doNotAutomaticallyAdd
): MarkerIndex[] {
  const markerTypes = getMarkerTypesForDisplay(markerSchema, displayLocation);
  return filterMarkerIndexes(getMarker, markerIndexes, marker => {
    const additionalResult = preemptiveFilterFunc(marker);

    if (additionalResult !== undefined) {
      // This is a boolean value, use it rather than the schema.
      return additionalResult;
    }

    return markerTypes.has(getMarkerSchemaName(markerSchemaByName, marker));
  });
}
