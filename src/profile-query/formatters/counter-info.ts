/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getProfile,
  getProfileRootRange,
  getCounters,
  getCounterSelectors,
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
import { getCounterHandle, parseCounterHandle } from '../counter-map';
import type {
  CounterIndex,
  CounterTooltipDataSource,
  CounterTooltipFormat,
  ProfileMeta,
} from 'firefox-profiler/types';
import type { Store } from '../../types/store';
import type { ThreadMap } from '../thread-map';
import type {
  CounterStat,
  CounterSummary,
  CounterListResult,
  CounterInfoResult,
} from '../types';

// The tooltip schema describes many per-sample and preview-selection rows that
// only make sense at a hover point. These are the two sources that aggregate
// over the whole committed range, so they are the only ones a CLI summary can
// resolve without a cursor.
const RANGE_AGGREGATE_SOURCES: Set<CounterTooltipDataSource> = new Set([
  'count-range',
  'committed-range-total',
]);

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
  counterIndex: CounterIndex
): CounterSummary {
  const state = store.getState();
  const profile = getProfile(state);
  const selectors = getCounterSelectors(counterIndex);
  const counter = selectors.getCounter(state);
  const { display } = counter;

  const [rangeStartIndex, rangeEndIndex] =
    selectors.getCommittedRangeCounterSampleRange(state);

  const mainThreadName = profile.threads[counter.mainThreadIndex]?.name ?? '';

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
    mainThreadIndex: counter.mainThreadIndex,
    mainThreadHandle: threadMap.handleForThreadIndex(counter.mainThreadIndex),
    mainThreadName,
    rangeSampleCount: Math.max(0, rangeEndIndex - rangeStartIndex),
    stats: collectCounterStats(store, counterIndex),
  };
}

/**
 * Build summaries for every counter in the profile. Returns an empty list when
 * the profile has no counters.
 */
export function collectCounterList(
  store: Store,
  threadMap: ThreadMap
): CounterListResult {
  const counters = getCounters(store.getState()) ?? [];
  return {
    type: 'counter-list',
    counters: counters.map((_, index) =>
      collectCounterSummary(store, threadMap, index)
    ),
  };
}

/**
 * Build detailed information about a single counter, resolved by handle.
 */
export function collectCounterInfo(
  store: Store,
  threadMap: ThreadMap,
  counterHandle: string
): CounterInfoResult {
  const state = store.getState();
  const counters = getCounters(state) ?? [];
  const counterIndex = parseCounterHandle(counterHandle, counters.length);

  const summary = collectCounterSummary(store, threadMap, counterIndex);
  const selectors = getCounterSelectors(counterIndex);
  const counter = selectors.getCounter(state);
  const [rangeStartIndex, rangeEndIndex] =
    selectors.getCommittedRangeCounterSampleRange(state);

  const zeroAt = getProfileRootRange(state).start;
  const hasRange = rangeEndIndex > rangeStartIndex;
  const rangeStart = hasRange
    ? counter.samples.time[rangeStartIndex] + zeroAt
    : null;
  const rangeEnd = hasRange
    ? counter.samples.time[rangeEndIndex - 1] + zeroAt
    : null;

  return {
    ...summary,
    type: 'counter-info',
    description: counter.description,
    sampleCount: counter.samples.length,
    rangeStart,
    rangeEnd,
  };
}
