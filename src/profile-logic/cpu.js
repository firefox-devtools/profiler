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
} from 'firefox-profiler/types';

/**
 * Compute the max CPU delta value for that thread. It computes the max value
 * after the threadCPUDelta processing.
 */
export function computeMaxThreadCPUDelta(
  threads: Thread[],
  interval: Milliseconds
): number {
  let maxThreadCPUDelta = 0;

  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const { samples } = threads[threadIndex];
    const { time, threadCPUDelta } = samples;

    if (!threadCPUDelta) {
      // The thread have any ThreadCPUDelta values. Older profiles don't have
      // this information.
      continue;
    }

    // First element of CPU delta is always null because back-end doesn't know
    // the delta since there is no previous sample.
    for (let i = 1; i < samples.length; i++) {
      const cpuDelta = threadCPUDelta[i] || 0;
      // Interval is not always steady depending on the overhead.
      const intervalFactor = (time[i] - time[i - 1]) / interval;
      const currentCPUPerInterval = cpuDelta / intervalFactor;
      maxThreadCPUDelta = Math.max(maxThreadCPUDelta, currentCPUPerInterval);
    }
  }

  return maxThreadCPUDelta;
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
  sampleUnits: SampleUnits
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

  // Check to see the CPU delta numbers are all null and if they are, remove
  // this array completely. For example on JVM threads, all the threadCPUDelta
  // values will be null and therefore it will fail to paint the activity graph.
  // Instead we should remove the whole array. This call will be quick for most
  // of the cases because we usually have values at least in the second sample.
  const hasCPUDeltaValues = threadCPUDelta.some(val => val !== null);
  if (!hasCPUDeltaValues) {
    // Remove the threadCPUDelta array and return the new thread.
    return _newThreadWithNewThreadCPUDelta(undefined);
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
        const intervalUs =
          (samples.time[i] - samples.time[i - 1]) * cpuDeltaTimeUnitMultiplier;
        if (threadCPUDeltaValue > intervalUs) {
          newThreadCPUDelta[i] = intervalUs;
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
