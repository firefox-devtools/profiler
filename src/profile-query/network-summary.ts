/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
 * Interval union: total wall-clock time covered by any interval. Intervals are
 * [start, end] pairs (callers clamp them to the range of interest first).
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
