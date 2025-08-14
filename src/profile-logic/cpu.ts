/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  ensureExists,
  assertExhaustiveCheck,
} from 'firefox-profiler/utils/types';
import { numberSeriesToDeltas } from 'firefox-profiler/utils/number-series';

import type {
  RawThread,
  SampleUnits,
  Profile,
  RawSamplesTable,
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
  let referenceCPUDeltaPerMs = 0;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const { samples } = threads[threadIndex];
    const { threadCPUDelta } = samples;

    if (!threadCPUDelta) {
      // The thread have any ThreadCPUDelta values. Older profiles don't have
      // this information.
      continue;
    }

    const timeDeltas =
      samples.time !== undefined
        ? numberSeriesToDeltas(samples.time)
        : ensureExists(samples.timeDeltas);

    // Ignore the first CPU delta value; it's meaningless because there is no
    // previous sample.
    for (let i = 1; i < samples.length; i++) {
      const sampleTimeDeltaInMs = timeDeltas[i];
      if (sampleTimeDeltaInMs !== 0) {
        const cpuDeltaPerMs = (threadCPUDelta[i] || 0) / sampleTimeDeltaInMs;
        referenceCPUDeltaPerMs = Math.max(
          referenceCPUDeltaPerMs,
          cpuDeltaPerMs
        );
      }
    }
  }

  return referenceCPUDeltaPerMs;
}

/**
 * Returns the expected cpu delta per millisecond if cpu is at 100%.
 *
 * Returns 1 if the profile does not use cpu deltas.
 *
 * If the profile uses CPU deltas given in 'variable CPU cycles', then we check
 * all threads and return the maximum observed cpu delta per millisecond value,
 * which becomes the reference for 100% CPU.
 *
 * If the profile uses CPU deltas in microseconds or nanoseconds, the we return
 * the conversion factor to milliseconds.
 */
export function computeReferenceCPUDeltaPerMs(profile: Profile): number {
  const sampleUnits = profile.meta.sampleUnits;
  if (!sampleUnits) {
    return 1;
  }

  const threadCPUDeltaUnit = sampleUnits.threadCPUDelta;
  switch (threadCPUDeltaUnit) {
    case 'µs':
      // ms to µs multiplier
      return 1000;
    case 'ns':
      // ms to ns multiplier
      return 1000000;
    case 'variable CPU cycles':
      return _computeMaxVariableCPUCyclesPerMs(profile.threads);
    default:
      throw assertExhaustiveCheck(
        threadCPUDeltaUnit,
        'Unhandled threadCPUDelta unit in computeReferenceCPUDeltaPerMs.'
      );
  }
}

/**
 * Computes the threadCPURatio column for the SamplesTable.
 *
 * The CPU ratio is a number between 0 and 1, and describes the CPU use between
 * the previous sample time and the current sample time. It is the ratio of cpu
 * time to elapsed wall clock time.
 *
 * This function returns undefined if `samples` does not have a `threadCPUDelta`
 * column.
 */
export function computeThreadCPURatio(
  samples: RawSamplesTable,
  sampleUnits: SampleUnits,
  timeDeltas: number[],
  referenceCPUDeltaPerMs: number
): Float64Array | undefined {
  const { threadCPUDelta } = samples;

  if (!threadCPUDelta) {
    return undefined;
  }

  const threadCPURatio: Float64Array = new Float64Array(threadCPUDelta.length);

  // Ignore threadCPUDelta[0] and set threadCPURatio[0] to zero - there is no
  // previous sample so there is no meaningful value we could compute here.
  threadCPURatio[0] = 0;

  // For the rest of the samples, compute the ratio based on the CPU delta and
  // on the elapsed time between samples (timeDeltas[i]).
  for (let i = 1; i < threadCPUDelta.length; i++) {
    const referenceCpuDelta = referenceCPUDeltaPerMs * timeDeltas[i];
    const cpuDelta = threadCPUDelta[i];
    if (cpuDelta === null || referenceCpuDelta === 0) {
      // Default to 100% CPU if the CPU delta isn't known or if no time has
      // elapsed between samples.
      // In profiles from Firefox, values at the beginning of threadCPUDelta can
      // be null if the samples at the beginning were collected by the base
      // profiler, which doesn't support collecting CPU delta information yet,
      // see bug 1756519.
      threadCPURatio[i] = 1;
      continue;
    }

    // Limit values to 1.0.
    threadCPURatio[i] =
      cpuDelta <= referenceCpuDelta ? cpuDelta / referenceCpuDelta : 1;
  }

  return threadCPURatio;
}
