/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getProfile,
  getCounters,
  getCounterSelectors,
  getCommittedRange,
  getProfileInterval,
  getMeta,
} from 'firefox-profiler/selectors/profile';
import {
  formatBytes,
  formatNumber,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';
import {
  pwhToWh,
  carbonForBytes,
  carbonForWattHours,
  POWER_LADDER,
  ENERGY_LADDER,
  pickTier,
} from 'firefox-profiler/components/timeline/TrackCounterTooltipFormat';
import { getSampleIndexRangeForSelection } from 'firefox-profiler/profile-logic/profile-data';
import { getCounterHandle, parseCounterHandle } from '../counter-map';
import { getProcessName } from '../process-thread-list';
import type {
  CounterIndex,
  CounterDisplayConfig,
  CounterTooltipDataSource,
  CounterTooltipFormat,
  CounterTooltipRow,
  ProfileMeta,
} from 'firefox-profiler/types';
import type { Store } from '../../types/store';
import type { ThreadMap } from '../thread-map';
import type { TimestampManager } from '../timestamps';
import type {
  CounterStat,
  CounterSummary,
  CounterTimeBucket,
  CounterListResult,
  CounterInfoResult,
} from '../types';

// Number of buckets in the detailed "over time" table.
const OVER_TIME_BUCKET_COUNT = 10;

// Width (in characters/points) of the higher-resolution sparkline series.
const GRAPH_BUCKET_COUNT = 50;

// The tooltip schema describes many per-sample and preview-selection rows that
// only make sense at a hover point. These are the two sources that aggregate
// over the whole committed range, so they are the only ones a CLI summary can
// resolve without a cursor.
const RANGE_AGGREGATE_SOURCES: Set<CounterTooltipDataSource> = new Set([
  'count-range',
  'committed-range-total',
]);

const naturalSort = new Intl.Collator('en-US', { numeric: true });

export function getSortedCounterIndexes(store: Store): CounterIndex[] {
  const state = store.getState();
  const counters = getCounters(state) ?? [];
  const order = counters.map((_, index) => index);
  if (getMeta(state).keepProfileThreadOrder) {
    return order;
  }
  return order.sort((a, b) => {
    const sortWeightDiff =
      counters[a].display.sortWeight - counters[b].display.sortWeight;
    if (sortWeightDiff !== 0) {
      return sortWeightDiff;
    }
    return naturalSort.compare(counters[a].name, counters[b].name);
  });
}

/**
 * Format a resolved counter value exactly as the timeline tooltip does, minus
 * the React/localization wrapping. Only the range-aggregate sources reach this,
 * so the power-`scale` ladder normalization (which needs a per-sample dt) never
 * applies; energy values are pWh sums converted to watt-hours.
 */
function formatCounterRowValue(
  value: number,
  format: CounterTooltipFormat,
  meta: ProfileMeta
): { formattedValue: string; carbon?: string } {
  if (format.scale) {
    const valueForLadder = format.scale === 'energy' ? pwhToWh(value) : value;
    const ladder = format.scale === 'power' ? POWER_LADDER : ENERGY_LADDER;
    const tier = pickTier(valueForLadder, ladder);
    const formattedValue = `${formatNumber(valueForLadder * tier.multiplier, tier.valueSignificantDigits)} ${tier.unitText}`;
    let carbon: string | undefined;
    if (format.co2 === 'per-watthour' && format.scale === 'energy') {
      const grams = carbonForWattHours(valueForLadder, meta);
      carbon = `${formatNumber(grams * tier.carbonMultiplier, tier.carbonSignificantDigits)} ${tier.carbonUnitText}`;
    }
    return { formattedValue, carbon };
  }

  let formattedValue: string;
  switch (format.unit) {
    case 'bytes':
      formattedValue = formatBytes(value);
      break;
    case 'bytes-per-second':
      formattedValue = `${formatBytes(value * 1000)} per second`;
      break;
    case 'percent':
      formattedValue = formatPercent(value);
      break;
    case 'number':
      formattedValue = formatNumber(value, 2, 0);
      break;
    default:
      formattedValue = formatNumber(value);
      break;
  }

  let carbon: string | undefined;
  if (format.co2 === 'per-byte') {
    const bytesForCarbon =
      format.unit === 'bytes-per-second' ? value * 1000 : value;
    carbon = `${formatNumber(carbonForBytes(bytesForCarbon))} g CO₂e`;
  }
  return { formattedValue, carbon };
}

/**
 * Resolve the counter's range-aggregate tooltip rows into formatted stats.
 */
function collectCounterStats(
  store: Store,
  counterIndex: CounterIndex
): CounterStat[] {
  const state = store.getState();
  const selectors = getCounterSelectors(counterIndex);
  const counter = selectors.getCounter(state);
  const accumulated = selectors.getAccumulateCounterSamples(state);
  const meta = getMeta(state);

  const stats: CounterStat[] = [];
  for (const row of counter.display.tooltipRows) {
    if (row.type !== 'value') {
      continue;
    }
    if (row.requiresPreviewSelection) {
      continue;
    }
    if (!RANGE_AGGREGATE_SOURCES.has(row.source)) {
      continue;
    }

    const value =
      row.source === 'count-range'
        ? accumulated.countRange
        : selectors.getCommittedRangeCounterSampleSum(state);

    const { formattedValue, carbon } = formatCounterRowValue(
      value,
      row.format,
      meta
    );
    stats.push({
      source: row.source,
      label: row.label,
      value,
      formattedValue,
      carbon,
    });
  }
  return stats;
}

/**
 * Build the shared summary for a single counter. The stats cover the current
 * committed (zoom) range, since the underlying counter selectors are
 * range-aware.
 */
export function collectCounterSummary(
  store: Store,
  threadMap: ThreadMap,
  processIndexMap: Map<string, number>,
  counterIndex: CounterIndex
): CounterSummary {
  const state = store.getState();
  const profile = getProfile(state);
  const selectors = getCounterSelectors(counterIndex);
  const counter = selectors.getCounter(state);
  const { display } = counter;

  const [rangeStartIndex, rangeEndIndex] = getInRangeSampleIndexes(
    store,
    counterIndex
  );

  const mainThread = profile.threads[counter.mainThreadIndex];

  return {
    counterHandle: getCounterHandle(counterIndex),
    counterIndex,
    name: counter.name,
    label: display.label || counter.name,
    category: counter.category,
    unit: display.unit,
    graphType: display.graphType,
    color: display.color,
    pid: counter.pid,
    processIndex: processIndexMap.get(counter.pid) ?? -1,
    processName: mainThread ? getProcessName(mainThread) : 'unknown',
    etld1: mainThread?.['eTLD+1'],
    mainThreadIndex: counter.mainThreadIndex,
    mainThreadHandle: threadMap.handleForThreadIndex(counter.mainThreadIndex),
    mainThreadName: mainThread?.name ?? '',
    rangeSampleCount: Math.max(0, rangeEndIndex - rangeStartIndex),
    stats: collectCounterStats(store, counterIndex),
    graph: collectCounterGraph(store, counterIndex),
  };
}

/**
 * Build summaries for every counter in the profile. Returns an empty list when
 * the profile has no counters.
 */
export function collectCounterList(
  store: Store,
  threadMap: ThreadMap,
  processIndexMap: Map<string, number>
): CounterListResult {
  return {
    type: 'counter-list',
    counters: getSortedCounterIndexes(store).map((index) =>
      collectCounterSummary(store, threadMap, processIndexMap, index)
    ),
  };
}

/**
 * Decide how to aggregate a counter's values per time bucket, and which tooltip
 * format to render them with. Accumulated counters report the running level;
 * rate counters report the amount summed over the bucket (using their
 * range-aggregate row's format), except process CPU, which averages its ratio.
 */
function getOverTimeMode(display: CounterDisplayConfig): {
  kind: 'level' | 'sum' | 'avg-ratio';
  format: CounterTooltipFormat;
} {
  type ValueRow = Extract<CounterTooltipRow, { type: 'value' }>;
  const rowFor = (source: CounterTooltipDataSource): ValueRow | undefined => {
    for (const row of display.tooltipRows) {
      if (row.type === 'value' && row.source === source) {
        return row;
      }
    }
    return undefined;
  };
  const fallback: CounterTooltipFormat = {
    unit: display.unit === 'bytes' ? 'bytes' : 'number',
  };

  if (display.graphType === 'line-accumulated') {
    return { kind: 'level', format: rowFor('accumulated')?.format ?? fallback };
  }

  const rangeRow = rowFor('count-range') ?? rowFor('committed-range-total');
  if (rangeRow) {
    return { kind: 'sum', format: rangeRow.format };
  }
  const cpuRow = rowFor('cpu-ratio');
  if (cpuRow) {
    return { kind: 'avg-ratio', format: cpuRow.format };
  }
  return { kind: 'sum', format: rowFor('count')?.format ?? fallback };
}

/**
 * The sample indexes strictly inside the committed range. The counter
 * selectors' committed range is padded by one sample on each side (for graph
 * continuity); those boundary samples are outside the current view, so counts,
 * sums, and time spans should exclude them.
 */
function getInRangeSampleIndexes(
  store: Store,
  counterIndex: CounterIndex
): [number, number] {
  const state = store.getState();
  const { samples } = getCounterSelectors(counterIndex).getCounter(state);
  const range = getCommittedRange(state);
  return getSampleIndexRangeForSelection(samples, range.start, range.end);
}

type CounterBucket = {
  startTime: number;
  endTime: number;
  value: number;
  delta?: number; // accumulated counters only
};

type CounterBuckets = {
  kind: 'level' | 'sum' | 'avg-ratio';
  format: CounterTooltipFormat;
  countRange: number; // for the accumulated (level) share
  totalSum: number; // for the rate (sum) share
  buckets: CounterBucket[];
};

/**
 * Split the current committed range into `requestedBucketCount` equal-width time
 * buckets and compute a raw value per bucket. Sample times are absolute. Shared
 * by the detailed "over time" table and the sparkline.
 *
 * `capToSampleCount` keeps the table from showing more rows than there are
 * samples; the sparkline leaves it off for a consistent width, filling
 * sample-less buckets by carrying the level forward (accumulated) or with zero.
 */
function getCounterBuckets(
  store: Store,
  counterIndex: CounterIndex,
  requestedBucketCount: number,
  capToSampleCount: boolean
): CounterBuckets | null {
  const state = store.getState();
  const selectors = getCounterSelectors(counterIndex);
  const counter = selectors.getCounter(state);
  const { samples, display } = counter;
  const range = getCommittedRange(state);
  const [startIndex, endIndex] = getInRangeSampleIndexes(store, counterIndex);
  const { minCount, countRange, accumulatedCounts } =
    selectors.getAccumulateCounterSamples(state);

  const span = range.end - range.start;
  if (endIndex <= startIndex || span <= 0) {
    return null;
  }

  const { kind, format } = getOverTimeMode(display);
  const interval = getProfileInterval(state);
  // Use the same range-aware max as the timeline's cpu-ratio tooltip
  // (getMaxRangeCounterSampleCountPerMs), so the CLI and UI agree.
  const maxCountPerMs =
    kind === 'avg-ratio'
      ? selectors.getMaxRangeCounterSampleCountPerMs(state)
      : 0;

  const bucketCount = Math.max(
    1,
    capToSampleCount
      ? Math.min(requestedBucketCount, endIndex - startIndex)
      : requestedBucketCount
  );
  const width = span / bucketCount;

  type Acc = {
    sum: number;
    ratioSum: number;
    ratioN: number;
    level: number | null;
  };
  const accs: Acc[] = Array.from({ length: bucketCount }, () => ({
    sum: 0,
    ratioSum: 0,
    ratioN: 0,
    level: null,
  }));

  for (let i = startIndex; i < endIndex; i++) {
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((samples.time[i] - range.start) / width))
    );
    const acc = accs[bucketIndex];
    if (kind === 'level') {
      acc.level = accumulatedCounts[i] - minCount;
    } else if (kind === 'sum') {
      acc.sum += samples.count[i];
    } else {
      const dt = i === 0 ? interval : samples.time[i] - samples.time[i - 1];
      if (dt > 0 && maxCountPerMs > 0) {
        acc.ratioSum += samples.count[i] / dt / maxCountPerMs;
        acc.ratioN += 1;
      }
    }
  }

  const totalSum = accs.reduce((sum, acc) => sum + acc.sum, 0);

  let carriedLevel = 0;
  const buckets: CounterBucket[] = accs.map((acc, bucketIndex) => {
    const startTime = range.start + bucketIndex * width;
    const endTime =
      bucketIndex === bucketCount - 1
        ? range.end
        : range.start + (bucketIndex + 1) * width;

    let value: number;
    let delta: number | undefined;
    if (kind === 'level') {
      const level = acc.level ?? carriedLevel;
      delta = level - carriedLevel;
      carriedLevel = level;
      value = level;
    } else if (kind === 'avg-ratio') {
      value = acc.ratioN > 0 ? acc.ratioSum / acc.ratioN : 0;
    } else {
      value = acc.sum;
    }
    return { startTime, endTime, value, delta };
  });

  return { kind, format, countRange, totalSum, buckets };
}

/**
 * The detailed "over time" table: a small number of buckets with formatted
 * values, deltas, and per-slice shares. Rate buckets are shown as a share of the
 * range total; accumulated buckets as a share of the range peak (countRange).
 */
function collectCounterOverTime(
  store: Store,
  counterIndex: CounterIndex,
  timestampManager: TimestampManager
): CounterTimeBucket[] {
  const counterBuckets = getCounterBuckets(
    store,
    counterIndex,
    OVER_TIME_BUCKET_COUNT,
    true
  );
  if (counterBuckets === null) {
    return [];
  }
  const meta = getMeta(store.getState());
  const { kind, format, countRange, totalSum, buckets } = counterBuckets;

  return buckets.map((bucket): CounterTimeBucket => {
    const { formattedValue, carbon } = formatCounterRowValue(
      bucket.value,
      format,
      meta
    );

    let formattedDelta: string | undefined;
    if (bucket.delta !== undefined) {
      if (bucket.delta === 0) {
        formattedDelta = '0';
      } else {
        const sign = bucket.delta < 0 ? '-' : '+';
        formattedDelta =
          sign +
          formatCounterRowValue(Math.abs(bucket.delta), format, meta)
            .formattedValue;
      }
    }

    let percentage: number | undefined;
    if (kind === 'level' && countRange > 0) {
      percentage = bucket.value / countRange;
    } else if (kind === 'sum' && totalSum > 0) {
      percentage = bucket.value / totalSum;
    }
    const formattedPercentage =
      percentage !== undefined ? formatPercent(percentage) : undefined;

    return {
      startTime: bucket.startTime,
      startTimeName: timestampManager.nameForTimestamp(bucket.startTime),
      startTimeStr: timestampManager.timestampString(bucket.startTime),
      endTime: bucket.endTime,
      endTimeName: timestampManager.nameForTimestamp(bucket.endTime),
      endTimeStr: timestampManager.timestampString(bucket.endTime),
      value: bucket.value,
      formattedValue,
      delta: bucket.delta,
      formattedDelta,
      percentage,
      formattedPercentage,
      carbon,
    };
  });
}

/**
 * A higher-resolution series of raw per-bucket values for the sparkline,
 * independent of the detailed "over time" table's coarser buckets.
 */
function collectCounterGraph(
  store: Store,
  counterIndex: CounterIndex
): number[] {
  const counterBuckets = getCounterBuckets(
    store,
    counterIndex,
    GRAPH_BUCKET_COUNT,
    false
  );
  return counterBuckets === null
    ? []
    : counterBuckets.buckets.map((bucket) => bucket.value);
}

/**
 * Build detailed information about a single counter, resolved by handle.
 */
export function collectCounterInfo(
  store: Store,
  threadMap: ThreadMap,
  processIndexMap: Map<string, number>,
  timestampManager: TimestampManager,
  counterHandle: string
): CounterInfoResult {
  const state = store.getState();
  const counters = getCounters(state) ?? [];
  const counterIndex = parseCounterHandle(counterHandle, counters.length);

  const summary = collectCounterSummary(
    store,
    threadMap,
    processIndexMap,
    counterIndex
  );
  const selectors = getCounterSelectors(counterIndex);
  const counter = selectors.getCounter(state);
  const [rangeStartIndex, rangeEndIndex] = getInRangeSampleIndexes(
    store,
    counterIndex
  );

  // Sample times are already in absolute profile-time space (the same space as
  // the committed range), so they need no zeroAt offset here.
  const hasRange = rangeEndIndex > rangeStartIndex;
  const rangeStart = hasRange ? counter.samples.time[rangeStartIndex] : null;
  const rangeEnd = hasRange ? counter.samples.time[rangeEndIndex - 1] : null;

  return {
    ...summary,
    type: 'counter-info',
    description: counter.description,
    sampleCount: counter.samples.length,
    rangeStart,
    rangeEnd,
    overTime: collectCounterOverTime(store, counterIndex, timestampManager),
  };
}
