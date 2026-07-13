/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getCommittedRange,
  getProfile,
} from 'firefox-profiler/selectors/profile';
import { isNetworkMarker } from 'firefox-profiler/profile-logic/marker-data';
import type { Store } from '../types/store';
import type {
  ThreadIndex,
  MarkerIndex,
  StartEndRange,
} from 'firefox-profiler/types';
import type { NetworkPayload } from 'firefox-profiler/types/markers';
import type { ThreadMap } from './thread-map';
import type { MarkerMap } from './marker-map';
import type {
  NetworkSummaryRequest,
  ThreadNetworkSummary,
  ProfileNetworkSummary,
  ProfileNetworkThreadBreakdown,
} from './types';

type State = ReturnType<Store['getState']>;

/**
 * One derived network marker, resolved to absolute times and a handle.
 */
export type NetworkRecord = {
  threadIndex: ThreadIndex;
  threadIndexes: Set<ThreadIndex>;
  markerIndex: MarkerIndex;
  data: NetworkPayload;
  start: number;
  end: number;
  // In flight at the end of the recording (only a START event, no stop).
  incomplete: boolean;
  // Completed, but its START event predates the recording; duration is a
  // lower bound.
  startedBeforeRecording: boolean;
};

/**
 * Classify a request's cache status into hit / miss / unknown buckets.
 */
export function classifyCache(
  cache: string | undefined
): 'hit' | 'miss' | 'unknown' {
  // The strings are produced by Firefox's GetCacheState:
  // https://searchfox.org/firefox-main/rev/3ed11452652b84dea6d27db877a401a146e44ba3/netwerk/protocol/http/NetworkMarker.cpp#140
  // "Unresolved" is the undetermined default, so it counts as unknown rather than a miss.
  if (cache === 'Hit' || cache === 'HitViaReval') {
    return 'hit';
  }
  if (cache === 'Missed' || cache === 'MissedViaReval') {
    return 'miss';
  }
  return 'unknown';
}

/**
 * Cheap pre-scan of a thread's raw marker data for any Network payload. Used to
 * skip marker derivation for the majority of threads that never touch the
 * network (profiles can have >100 threads).
 */
function threadHasRawNetworkMarker(
  state: State,
  threadIndex: ThreadIndex
): boolean {
  const selectors = getThreadSelectors(new Set([threadIndex]));
  const rawThread = selectors.getRawThread(state);
  const dataColumn = rawThread.markers.data;
  for (let i = 0; i < dataColumn.length; i++) {
    const data = dataColumn[i];
    if (data && data.type === 'Network') {
      return true;
    }
  }
  return false;
}

/**
 * Gather the derived network markers for a thread set that intersect `range`.
 * Times are absolute (same scale as `range`); intervals are clamped by callers.
 */
export function gatherNetworkRecords(
  state: State,
  threadIndex: ThreadIndex,
  threadIndexes: Set<ThreadIndex>,
  range: StartEndRange
): NetworkRecord[] {
  const selectors = getThreadSelectors(threadIndexes);
  const fullMarkerList = selectors.getFullMarkerList(state);
  const indexes = selectors.getFullMarkerListIndexes(state);
  const records: NetworkRecord[] = [];
  for (const i of indexes) {
    const marker = fullMarkerList[i];
    if (!isNetworkMarker(marker)) {
      continue;
    }
    const start = marker.start;
    const end = marker.end ?? marker.start;
    // Only markers intersecting the range count.
    if (end < range.start || start > range.end) {
      continue;
    }
    const data = marker.data as NetworkPayload;
    // "In flight at end" is keyed off the status, not the derived `incomplete`
    // flag: that flag is also set for a STOP whose START predates the recording,
    // which did complete.
    const inFlight = data.status === 'STATUS_START';
    records.push({
      threadIndex,
      threadIndexes,
      markerIndex: i,
      data,
      start,
      end,
      incomplete: inFlight,
      startedBeforeRecording: marker.incomplete === true && !inFlight,
    });
  }
  return records;
}

/**
 * Interval union: total wall-clock time covered by any interval. Intervals are
 * [start, end] pairs already clamped to the range.
 */
export function intervalUnionMs(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) {
    return 0;
  }

  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start > curEnd) {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  total += curEnd - curStart;
  return total;
}

/**
 * Peak concurrency: the maximum number of intervals overlapping at any instant.
 * A request that ends exactly when another starts is not double-counted (ends
 * are processed before starts at the same timestamp).
 */
export function peakConcurrency(intervals: Array<[number, number]>): number {
  const events: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    events.push([start, 1]);
    events.push([end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > peak) {
      peak = current;
    }
  }
  return peak;
}

/**
 * Clamp a record's interval to the range.
 */
export function clampInterval(
  record: NetworkRecord,
  range: StartEndRange
): [number, number] {
  return [Math.max(record.start, range.start), Math.min(record.end, range.end)];
}

/**
 * The request's in-range duration. A request can start before the range or end
 * after it; clamping keeps the reported duration from exceeding what the
 * profile can actually show.
 */
export function clampedDurationMs(
  record: NetworkRecord,
  range: StartEndRange
): number {
  const [start, end] = clampInterval(record, range);
  return end - start;
}

function toSummaryRequest(
  record: NetworkRecord,
  range: StartEndRange,
  markerMap: MarkerMap,
  threadMap: ThreadMap
): NetworkSummaryRequest {
  const durationMs = clampedDurationMs(record, range);
  const { count, URI, responseStatus } = record.data;
  return {
    markerHandle: markerMap.handleForMarker(
      record.threadIndexes,
      record.markerIndex
    ),
    threadHandle: threadMap.handleForThreadIndexes(record.threadIndexes),
    url: URI,
    durationMs,
    startTime: record.start,
    transferSizeKB: count !== undefined ? count / 1024 : undefined,
    httpStatus: responseStatus,
    status: record.data.status,
    incomplete: record.incomplete,
    startedBeforeRecording: record.startedBeforeRecording,
  };
}

/**
 * Sort records by in-range duration descending and take the top N as
 * summary-request entries.
 */
function topSlowest(
  records: NetworkRecord[],
  range: StartEndRange,
  n: number,
  markerMap: MarkerMap,
  threadMap: ThreadMap
): NetworkSummaryRequest[] {
  return records
    .slice()
    .sort((a, b) => clampedDurationMs(b, range) - clampedDurationMs(a, range))
    .slice(0, n)
    .map((record) => toSummaryRequest(record, range, markerMap, threadMap));
}

function isCompleted(record: NetworkRecord): boolean {
  return record.data.status === 'STATUS_STOP';
}

/**
 * Compute a network summary for one thread (or combined thread set), scoped to
 * the current committed range. Returns null when the thread has no network
 * markers, so callers can omit the section entirely.
 */
export function computeThreadNetworkSummary(
  store: Store,
  threadIndexes: Set<ThreadIndex>,
  markerMap: MarkerMap,
  threadMap: ThreadMap
): ThreadNetworkSummary | null {
  const state = store.getState();
  // Pre-scan raw data so a combined selection with no network markers doesn't
  // trigger derivation.
  const hasNetwork = Array.from(threadIndexes).some((index) =>
    threadHasRawNetworkMarker(state, index)
  );
  if (!hasNetwork) {
    return null;
  }

  const range = getCommittedRange(state);
  // Use the combined selectors so the marker handle matches this exact thread
  // selection (which is what `zoom push m-N` will resolve against). Pick a
  // representative single index only for the record's threadIndex field.
  const [representativeIndex] = threadIndexes;
  const records = gatherNetworkRecords(
    state,
    representativeIndex,
    threadIndexes,
    range
  );
  if (records.length === 0) {
    return null;
  }

  const rangeDurationMs = range.end - range.start;
  const intervals = records.map((record) => clampInterval(record, range));
  const inFlightMs = intervalUnionMs(intervals);

  let requestCount = 0;
  let incompleteCount = 0;
  let errorCount = 0;
  let cacheHit = 0;
  let cacheMiss = 0;
  let cacheUnknown = 0;
  for (const record of records) {
    if (record.incomplete) {
      incompleteCount++;
    } else if (isCompleted(record)) {
      requestCount++;
    }
    if (
      record.data.responseStatus !== undefined &&
      record.data.responseStatus >= 400
    ) {
      errorCount++;
    }
    switch (classifyCache(record.data.cache)) {
      case 'hit':
        cacheHit++;
        break;
      case 'miss':
        cacheMiss++;
        break;
      default:
        cacheUnknown++;
    }
  }

  return {
    threadHandle: threadMap.handleForThreadIndexes(threadIndexes),
    threadName: getThreadSelectors(threadIndexes).getFriendlyThreadName(state),
    requestCount,
    incompleteCount,
    inFlightMs,
    inFlightPercentage:
      rangeDurationMs > 0 ? (inFlightMs / rangeDurationMs) * 100 : 0,
    peakConcurrency: peakConcurrency(intervals),
    errorCount,
    cacheHit,
    cacheMiss,
    cacheUnknown,
    rangeDurationMs,
    slowest: topSlowest(records, range, 3, markerMap, threadMap),
  };
}

/**
 * Dedupe records across processes for the profile-wide numbers. The parent
 * process (necko) carries a copy of every request, so raw counts double-count.
 * Key on channel id + URI; prefer the content-process copy (it has
 * innerWindowID / page attribution).
 */
function dedupeRecords(records: NetworkRecord[]): NetworkRecord[] {
  const byKey = new Map<string, NetworkRecord>();
  for (const record of records) {
    const key = `${record.data.id}|${record.data.URI}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, record);
      continue;
    }
    // Prefer the copy with page attribution (content process).
    const existingHasWindow = existing.data.innerWindowID !== undefined;
    const candidateHasWindow = record.data.innerWindowID !== undefined;
    if (candidateHasWindow && !existingHasWindow) {
      byKey.set(key, record);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Compute the profile-wide network summary. Runs the per-thread scan for every
 * thread that passed the raw pre-scan, dedupes across processes for the
 * headline numbers, and keeps per-thread (non-deduped) counts in `byThread`.
 * Returns null when no thread has network markers.
 */
export function computeProfileNetworkSummary(
  store: Store,
  threadMap: ThreadMap,
  markerMap: MarkerMap
): ProfileNetworkSummary | null {
  const state = store.getState();
  const range = getCommittedRange(state);
  const rangeDurationMs = range.end - range.start;

  const allRecords: NetworkRecord[] = [];
  const byThread: ProfileNetworkThreadBreakdown[] = [];

  const threadCount = getProfile(state).threads.length;
  for (let threadIndex = 0; threadIndex < threadCount; threadIndex++) {
    if (!threadHasRawNetworkMarker(state, threadIndex)) {
      continue;
    }
    const threadIndexes = new Set([threadIndex]);
    const records = gatherNetworkRecords(
      state,
      threadIndex,
      threadIndexes,
      range
    );
    if (records.length === 0) {
      continue;
    }
    allRecords.push(...records);

    const threadIntervals = records.map((record) =>
      clampInterval(record, range)
    );
    const threadRequestCount = records.filter(
      (record) => isCompleted(record) || record.incomplete
    ).length;
    byThread.push({
      threadHandle: threadMap.handleForThreadIndexes(threadIndexes),
      threadName:
        getThreadSelectors(threadIndexes).getFriendlyThreadName(state),
      requestCount: threadRequestCount,
      inFlightMs: intervalUnionMs(threadIntervals),
    });
  }

  if (allRecords.length === 0) {
    return null;
  }

  const deduped = dedupeRecords(allRecords);
  const dedupedIntervals = deduped.map((record) =>
    clampInterval(record, range)
  );
  const inFlightMs = intervalUnionMs(dedupedIntervals);

  let requestCount = 0;
  let incompleteCount = 0;
  let errorCount = 0;
  for (const record of deduped) {
    if (record.incomplete) {
      incompleteCount++;
    } else if (isCompleted(record)) {
      requestCount++;
    }
    if (
      record.data.responseStatus !== undefined &&
      record.data.responseStatus >= 400
    ) {
      errorCount++;
    }
  }

  byThread.sort((a, b) => b.inFlightMs - a.inFlightMs);

  return {
    requestCount,
    incompleteCount,
    inFlightMs,
    inFlightPercentage:
      rangeDurationMs > 0 ? (inFlightMs / rangeDurationMs) * 100 : 0,
    peakConcurrency: peakConcurrency(dedupedIntervals),
    errorCount,
    rangeDurationMs,
    slowest: topSlowest(deduped, range, 5, markerMap, threadMap),
    byThread: byThread.slice(0, 5),
  };
}
