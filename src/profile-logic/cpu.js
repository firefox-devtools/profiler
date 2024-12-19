/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { computeTimeColumnForRawSamplesTable } from './profile-data';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  RawThread,
  SampleUnits,
  ThreadCPUDeltaUnit,
  Profile,
  RawSamplesTable,
  SamplesTable,
} from 'firefox-profiler/types';

/**
 * Compute the max CPU cycles per ms for the thread. Should only be called when
 * the cpu delta unit is 'variable CPU cycles'.
 * This computes the max value before the threadCPUDelta processing -
 * the threadCPUDelta processing wouldn't do anything other than remove nulls
 * anyway, because if the unit is 'variable CPU cycles' then we don't do any
 * clamping.
 */
function _computeMaxVariableCPUCyclesPerMs(threads: RawThread[]): number {
  let maxThreadCPUDeltaPerMs = 0;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const { samples } = threads[threadIndex];
    const { threadCPUDelta } = samples;

    if (!threadCPUDelta) {
      // The thread have any ThreadCPUDelta values. Older profiles don't have
      // this information.
      continue;
    }

    // Ignore the first CPU delta value; it's meaningless because there is no
    // previous sample.
    const { time: samplesTimeCol, timeDeltas: samplesTimeDeltasCol } = samples;
    if (samplesTimeCol !== undefined) {
      for (let i = 1; i < samples.length; i++) {
        const sampleTimeDeltaInMs = samplesTimeCol[i] - samplesTimeCol[i - 1];
        if (sampleTimeDeltaInMs !== 0) {
          const cpuDeltaPerMs = (threadCPUDelta[i] || 0) / sampleTimeDeltaInMs;
          maxThreadCPUDeltaPerMs = Math.max(
            maxThreadCPUDeltaPerMs,
            cpuDeltaPerMs
          );
        }
      }
    } else if (samplesTimeDeltasCol !== undefined) {
      for (let i = 1; i < samples.length; i++) {
        const sampleTimeDeltaInMs = samplesTimeDeltasCol[i];
        if (sampleTimeDeltaInMs !== 0) {
          const cpuDeltaPerMs = (threadCPUDelta[i] || 0) / sampleTimeDeltaInMs;
          maxThreadCPUDeltaPerMs = Math.max(
            maxThreadCPUDeltaPerMs,
            cpuDeltaPerMs
          );
        }
      }
    } else {
      throw new Error(
        'samples table must always have a time or a timeDeltas column'
      );
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
 *    max_{sample}(sample.cpuDelta / sample.timeDeltas) == 1234567 cycles per ms
 *    Returns 1234567 * 3, i.e. "3703701 cycles per sample if each sample ticks at
 *    the declared 3ms interval and the CPU usage is at the observed maximum".
 */
export function computeMaxCPUDeltaPerMs(profile: Profile): number {
  const sampleUnits = profile.meta.sampleUnits;
  if (!sampleUnits) {
    return 1;
  }

  const threadCPUDeltaUnit = sampleUnits.threadCPUDelta;

  switch (threadCPUDeltaUnit) {
    case 'µs':
    case 'ns': {
      const deltaUnitPerMs = getCpuDeltaTimeUnitMultiplier(threadCPUDeltaUnit);
      return deltaUnitPerMs;
    }
    case 'variable CPU cycles': {
      const maxThreadCPUDeltaPerMs = _computeMaxVariableCPUCyclesPerMs(
        profile.threads
      );
      return maxThreadCPUDeltaPerMs;
    }
    default:
      throw assertExhaustiveCheck(
        threadCPUDeltaUnit,
        'Unhandled threadCPUDelta unit in computeMaxCPUDeltaPerMs.'
      );
  }
}

/**
 * Clamp the CPU delta values of the given thread and make them non-null.
 *
 * This function is a no-op if called on a thread without threadCPUDeltas.
 *
 * It does the following:
 *
 * 1. We replace null values with zeros.
 * 2. We clamp CPU delta values to the time delta between samples, if the CPU
 *    delta unit is time-based (i.e. microseconds or nanoseconds rather than
 *    'variable CPU cycles'). This gets rid of unexpected out-of-range values
 *    that we've observed on the macOS platform.
 */
export function computeSamplesTableFromRawSamplesTable(
  samples: RawSamplesTable,
  sampleUnits: SampleUnits | void
): SamplesTable {
  const { threadCPUDelta } = samples;

  const timeColumn = computeTimeColumnForRawSamplesTable(samples);

  if (!threadCPUDelta || !sampleUnits) {
    return {
      length: samples.length,
      responsiveness: samples.responsiveness,
      eventDelay: samples.eventDelay,
      stack: samples.stack,
      time: timeColumn,
      weight: samples.weight,
      weightType: samples.weightType,
      threadId: samples.threadId,
    };
  }

  const newThreadCPUDelta: Array<number> = new Array(samples.length);
  const threadCPUDeltaUnit = sampleUnits.threadCPUDelta;
  const cpuDeltaTimeUnitMultiplier =
    getCpuDeltaTimeUnitMultiplier(threadCPUDeltaUnit);

  let prevSampleTime = samples.length !== 0 ? timeColumn[0] : 0;
  for (let i = 0; i < samples.length; i++) {
    // Replace nulls with zeros.
    const rawThreadCPUDeltaValue = threadCPUDelta[i];
    const threadCPUDeltaValue =
      rawThreadCPUDeltaValue !== null ? rawThreadCPUDeltaValue : 0;

    const sampleTime = timeColumn[i];

    switch (threadCPUDeltaUnit) {
      // Check if the threadCPUDelta is more than the interval time and limit
      // that number to the interval if it's bigger than that. This is mostly
      // either a bug on the back-end or a bug on the operation system level.
      // This happens mostly with µs values which is coming from macOS. We can
      // remove that processing once we are sure that these numbers are reliable
      // and this issue doesn't occur.
      case 'µs':
      case 'ns': {
        const deltaUnitPerMs = cpuDeltaTimeUnitMultiplier;
        const sampleDeltaMs = sampleTime - prevSampleTime;
        const sampleDeltaInThreadCPUDeltaUnit = sampleDeltaMs * deltaUnitPerMs;
        if (threadCPUDeltaValue > sampleDeltaInThreadCPUDeltaUnit) {
          newThreadCPUDelta[i] = sampleDeltaInThreadCPUDeltaUnit;
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

    prevSampleTime = sampleTime;
  }

  const newSamples: SamplesTable = {
    length: samples.length,
    responsiveness: samples.responsiveness,
    eventDelay: samples.eventDelay,
    stack: samples.stack,
    weight: samples.weight,
    weightType: samples.weightType,
    threadId: samples.threadId,
    time: timeColumn,
    threadCPUDelta: newThreadCPUDelta,
  };

  return newSamples;
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
