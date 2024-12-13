/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  Thread,
  Milliseconds,
  SampleUnits,
  ThreadCPUDeltaUnit,
  Profile,
} from 'firefox-profiler/types';

/**
 * Compute the max CPU cycles per ms for the thread. Should only be called when
 * the cpu delta unit is 'variable CPU cycles'.
 * This computes the max value before the threadCPUDelta processing -
 * the threadCPUDelta processing wouldn't do anything other than remove nulls
 * anyway, because if the unit is 'variable CPU cycles' then we don't do any
 * clamping.
 */
function _computeMaxVariableCPUCyclesPerMs(
  threads: Thread[],
  profileInterval: Milliseconds
): number {
  let maxThreadCPUDeltaPerMs = 0;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const { samples } = threads[threadIndex];
    const { threadCPUDelta } = samples;

    if (!threadCPUDelta) {
      // The thread have any ThreadCPUDelta values. Older profiles don't have
      // this information.
      continue;
    }

    // First element of CPU delta is always null because back-end doesn't know
    // the delta since there is no previous sample.
    for (let i = 1; i < samples.length; i++) {
      const sampleTimeDeltaInMs =
        i === 0 ? profileInterval : samples.time[i] - samples.time[i - 1];
      if (sampleTimeDeltaInMs !== 0) {
        const cpuDeltaPerMs = (threadCPUDelta[i] || 0) / sampleTimeDeltaInMs;
        maxThreadCPUDeltaPerMs = Math.max(
          maxThreadCPUDeltaPerMs,
          cpuDeltaPerMs
        );
      }
    }
  }

  return maxThreadCPUDeltaPerMs;
}

/**
 * Returns the expected cpu delta per sample if cpu is at 100% and
 * sampling happens at the declared interval.
 *
 * Returns null if the profile does not use cpu deltas.
 * Otherwise, returns a ratio that can be used to compare activity
 * between threads with cpu deltas and threads without cpu deltas.
 *
 * Examples:
 *  - interval: 2 (ms), sampleUnits: undefined
 *    Returns null.
 *  - interval: 5 (ms), sampleUnits.threadCPUDelta: "µs"
 *    Returns 5000, i.e. "5000µs cpu delta per sample if each sample ticks at
 *    the declared 5ms interval and the CPU usage is at 100%".
 *  - interval: 3 (ms), sampleUnits.threadCPUDelta: "variable CPU cycles",
 *    max_{sample}(sample.cpuDelta / sample.timeDelta) == 1234567 cycles per ms
 *    Returns 1234567 * 3, i.e. "3703701 cycles per sample if each sample ticks at
 *    the declared 3ms interval and the CPU usage is at the observed maximum".
 */
export function computeMaxCPUDeltaPerInterval(profile: Profile): number | null {
  const sampleUnits = profile.meta.sampleUnits;
  if (!sampleUnits) {
    return null;
  }

  const interval = profile.meta.interval;
  const threadCPUDeltaUnit = sampleUnits.threadCPUDelta;

  switch (threadCPUDeltaUnit) {
    case 'µs':
    case 'ns': {
      const cpuDeltaTimeUnitMultiplier =
        getCpuDeltaTimeUnitMultiplier(threadCPUDeltaUnit);
      return cpuDeltaTimeUnitMultiplier * interval;
    }
    case 'variable CPU cycles': {
      const maxThreadCPUDeltaPerMs = _computeMaxVariableCPUCyclesPerMs(
        profile.threads,
        interval
      );
      return maxThreadCPUDeltaPerMs * interval;
    }
    default:
      throw assertExhaustiveCheck(
        threadCPUDeltaUnit,
        'Unhandled threadCPUDelta unit in computeMaxCPUDeltaPerInterval.'
      );
  }
}

/**
 * Process the CPU delta values of that thread. It will throw an error if it
 * fails to find threadCPUDelta array.
 * It does two different processing:
 *
 * 1. For the threadCPUDelta values with timing units, it limits these values
 * to the interval. This is mostly a bug on macOS platform (with µs values)
 * because we could only detect these values in that platform so far. But to be
 * safe, we are also doing this processing for Linux platform (ns values).
 * 2. We are checking for null values and converting them to non-null values if
 * there are any by getting the closest threadCPUDelta value.
 */
export function processThreadCPUDelta(
  thread: Thread,
  sampleUnits: SampleUnits,
  profileInterval: Milliseconds
): Thread {
  const { samples } = thread;
  const { threadCPUDelta } = samples;

  if (!threadCPUDelta) {
    throw new Error(
      "processThreadCPUDelta should not be called for the profiles that don't include threadCPUDelta."
    );
  }
  // A helper function to shallow clone the thread with different threadCPUDelta values.
  function _newThreadWithNewThreadCPUDelta(
    threadCPUDelta: Array<number | null> | void
  ): Thread {
    const newSamples = {
      ...samples,
      threadCPUDelta,
    };

    const newThread = {
      ...thread,
      samples: newSamples,
    };

    return newThread;
  }

  const newThreadCPUDelta: Array<number | null> = new Array(samples.length);
  const cpuDeltaTimeUnitMultiplier = getCpuDeltaTimeUnitMultiplier(
    sampleUnits.threadCPUDelta
  );

  for (let i = 0; i < samples.length; i++) {
    // Ideally there shouldn't be any null values but that can happen if the
    // back-end fails to get the CPU usage numbers from the operation system.
    // In that case, try to find the closest number and use it to mitigate the
    // weird graph renderings.
    const threadCPUDeltaValue = findClosestNonNullValueToIdx(threadCPUDelta, i);

    const threadCPUDeltaUnit = sampleUnits.threadCPUDelta;
    switch (threadCPUDeltaUnit) {
      // Check if the threadCPUDelta is more than the interval time and limit
      // that number to the interval if it's bigger than that. This is mostly
      // either a bug on the back-end or a bug on the operation system level.
      // This happens mostly with µs values which is coming from macOS. We can
      // remove that processing once we are sure that these numbers are reliable
      // and this issue doesn't occur.
      case 'µs':
      case 'ns': {
        const intervalInThreadCPUDeltaUnit =
          i === 0
            ? profileInterval * cpuDeltaTimeUnitMultiplier
            : (samples.time[i] - samples.time[i - 1]) *
              cpuDeltaTimeUnitMultiplier;
        if (threadCPUDeltaValue > intervalInThreadCPUDeltaUnit) {
          newThreadCPUDelta[i] = intervalInThreadCPUDeltaUnit;
        } else {
          newThreadCPUDelta[i] = threadCPUDeltaValue;
        }
        break;
      }
      case 'variable CPU cycles':
        newThreadCPUDelta[i] = threadCPUDeltaValue;
        break;
      default:
        throw assertExhaustiveCheck(
          threadCPUDeltaUnit,
          'Unhandled threadCPUDelta unit in the processing.'
        );
    }
  }

  return _newThreadWithNewThreadCPUDelta(newThreadCPUDelta);
}

/**
 * A helper function that is used to convert ms time units to threadCPUDelta units.
 * Returns 1 for 'variable CPU cycles' as it's not a time unit.
 */
function getCpuDeltaTimeUnitMultiplier(unit: ThreadCPUDeltaUnit): number {
  switch (unit) {
    case 'µs':
      // ms to µs multiplier
      return 1000;
    case 'ns':
      // ms to ns multiplier
      return 1000000;
    case 'variable CPU cycles':
      // We can't convert the CPU cycle unit to any time units
      return 1;
    default:
      throw assertExhaustiveCheck(
        unit,
        'Unhandled threadCPUDelta unit in the processing.'
      );
  }
}

/**
 * A helper function that finds the closest non-null item in an element to an index.
 * This is useful for finding the non-null threadCPUDelta number to a sample.
 */
function findClosestNonNullValueToIdx(
  array: Array<number | null>,
  idx: number,
  distance: number = 0
): number {
  if (distance >= array.length) {
    throw new Error('Expected the distance to be less than the array length.');
  }

  if (idx + distance < array.length) {
    const itemAfter = array[idx + distance];
    if (itemAfter !== null) {
      return itemAfter;
    }
  }

  if (idx - distance >= 0) {
    const itemBefore = array[idx - distance];
    if (itemBefore !== null) {
      return itemBefore;
    }
  }

  return findClosestNonNullValueToIdx(array, idx, ++distance);
}
