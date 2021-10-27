/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { isContentThreadWithNoPaint } from './profile-data';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  Thread,
  Milliseconds,
  SampleUnits,
  ThreadCPUDeltaUnit,
  ThreadIndex,
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

  // Check to see the CPU delta numbers are all null and if they are, remove
  // this array completely. For example on JVM threads, all the threadCPUDelta
  // values will be null and therefore it will fail to paint the activity graph.
  // Instead we should remove the whole array. This call will be quick for most
  // of the cases because we usually have values at least in the second sample.
  const hasCPUDeltaValues = threadCPUDelta.some((val) => val !== null);
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

// Threshold to be used for checking if a single threadCPUDelta value is above
// the maxThreadCPUDelta. If the sample CPU value is using more than 10% of CPU,
// it's safe to assume that this sample is active and non-idle.
const CPU_IDLENESS_PERCENTAGE = 0.1;

/**
 * Compute the activity percentages for each threads by looking at their CPU usage
 * per thread. This will be used to determine the idle threads and also to
 * visualize the activity of threads in the UI.
 * A sample is considered active if its CPU value is above
 * `maxThreadCPUDelta * CPU_IDLENESS_PERCENTAGE`.
 */
export function computeThreadActivityPercentages(
  threads: Thread[],
  sampleUnits: SampleUnits | void,
  profileInterval: Milliseconds,
  maxThreadCPUDelta: number
): Map<ThreadIndex, number> {
  const activityPercentages = new Map();

  if (!sampleUnits) {
    // There is no CPU value in this thread, return empty map.
    return activityPercentages;
  }

  const cpuThresholdPerInterval = maxThreadCPUDelta * CPU_IDLENESS_PERCENTAGE;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const thread = threads[threadIndex];
    const { samples } = thread;
    const { threadCPUDelta } = samples;

    if (!threadCPUDelta) {
      // This should not happen because this is checked before. But continue
      // early just in case.
      activityPercentages.set(threadIndex, 0);
      continue;
    }

    let activeStackCount = 0;
    // Skipping zero because we know for sure that the first index will be null.
    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex++) {
      const currentThreadCPUDelta = threadCPUDelta[sampleIndex] || 0;
      // Interval is not always steady depending on the overhead.
      const intervalFactor =
        (samples.time[sampleIndex] - samples.time[sampleIndex - 1]) /
        profileInterval;
      const currentCPUPerInterval = currentThreadCPUDelta / intervalFactor;

      // Check if the sample's CPUDelta value is above the threshold.
      if (
        currentCPUPerInterval !== null &&
        currentCPUPerInterval >= cpuThresholdPerInterval
      ) {
        activeStackCount++;
      }
    }

    // Compute the activity percentage of the thread and add it to the map.
    const threadActivityPercentage = activeStackCount / samples.length;
    activityPercentages.set(threadIndex, threadActivityPercentage);
  }

  return activityPercentages;
}

// Threshold to be used for checking a thread's CPU activity percentage vs the
// most active thread CPU activity percentage. Currently, we assume a thread
// idle if it's activity below 10% compared to the most active thread.
const ACTIVE_SAMPLE_PERCENTAGE = 0.1;
// Threshold for only content processes with no paint markers. If there's no
// paint marker, it's safe to assume that the content process is not interesting
// for the user. So it should be marked as idle, even if it has slightly more CPU
// usage. It will be marked as non-idle if it has more than 20% of CPU activity.
const ACTIVE_SAMPLE_PERCENTAGE_CONTENT_PROCESS_NO_PAINT = 0.2;

/**
 * Get the activity percentages for all threads, and find out the idle threads
 * by looking at the relative CPU usage for each thread. It's relative to the
 * most active thread in the whole profile.
 */
export function computeIdleThreadsByCPU(
  threads: Thread[],
  threadActivityPercentages: Map<ThreadIndex, number>
): Set<ThreadIndex> {
  const idleThreads = new Set();
  // Find the max percentage value across profile. This will be used to compute
  // the idleness sample percentage threshold.
  let maxActivityPercentage = 0;
  threadActivityPercentages.forEach((activenessPercentage) => {
    maxActivityPercentage = Math.max(
      maxActivityPercentage,
      activenessPercentage
    );
  });

  // We have two thresholds for activeness. The first one is used most of the time.
  // But if there are any content process main threads with no paint markers,
  // then the second threshold will be used, which is higher. This means that
  // we're more agressively hiding content processes with no paint markers.
  const defaultThreshold = maxActivityPercentage * ACTIVE_SAMPLE_PERCENTAGE;
  const thresholdForContentProcessWithNoPaint =
    maxActivityPercentage * ACTIVE_SAMPLE_PERCENTAGE_CONTENT_PROCESS_NO_PAINT;

  for (const [
    threadIndex,
    activityPercentage,
  ] of threadActivityPercentages.entries()) {
    // Threshold changes for each thread. If it's a content process main thread
    // with no paint markers, the threshold will be higher.
    const thresholdForThread = isContentThreadWithNoPaint(threads[threadIndex])
      ? thresholdForContentProcessWithNoPaint
      : defaultThreshold;

    if (activityPercentage < thresholdForThread) {
      idleThreads.add(threadIndex);
    }
  }

  return idleThreads;
}
