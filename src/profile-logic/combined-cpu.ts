/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { SamplesTable } from 'firefox-profiler/types';

/**
 * Represents CPU usage over time for a single thread.
 */
export type CpuRatioTimeSeries = {
  time: number[];
  cpuRatio: Float64Array;
  maxCpuRatio: number;
  length: number;
};

/**
 * Combines CPU usage data from multiple threads into a single timeline.
 *
 * This function takes CPU ratio data from multiple threads, each with potentially
 * different sampling times, and creates a unified timeline where CPU ratios are
 * summed. The result can exceed 1.0 when multiple threads are active simultaneously.
 *
 * The algorithm:
 * 1. Maintains a cursor for each thread tracking the current sample index
 * 2. Processes all sample times in ascending order (using a min-heap approach)
 * 3. For each time point, sums CPU ratios from threads that are active at that time
 * 4. A thread is considered active only between its first and last sample times
 *
 * Note: cpuRatio[i] represents CPU usage between time[i-1] and time[i], so we don't
 * extend a thread's CPU usage beyond its last sample time.
 *
 * @param threadSamples - Array of SamplesTable objects, one per thread
 * @returns Combined CPU data with unified time array and summed CPU ratios,
 *          or null if no threads have CPU data
 */
export function combineCPUDataFromThreads(
  threadSamples: SamplesTable[]
): CpuRatioTimeSeries | null {
  // Filter threads that have CPU ratio data.
  // We require at least two samples per thread; the first sample's CPU ratio
  // is meaningless. samples.threadCPURatio[1] is the CPU percentage between
  // samples.time[0] and samples.time[1].
  const threadsWithCPU: CpuRatioTimeSeries[] = [];
  for (const samples of threadSamples) {
    if (samples.threadCPURatio && samples.time.length >= 2) {
      threadsWithCPU.push({
        time: samples.time,
        cpuRatio: samples.threadCPURatio,
        maxCpuRatio: Infinity,
        length: samples.length,
      });
    }
  }

  if (threadsWithCPU.length === 0) {
    return null;
  }

  // Initialize cursors for each thread
  const cursors = new Array(threadsWithCPU.length).fill(0);

  // Merge all time points from all threads using a single pass
  // Since each thread's times are already sorted, we can use a merge approach
  const combinedTime: number[] = [];
  const combinedCPURatio: number[] = [];
  let combinedMaxCpuRatio = 0;

  // Find the earliest start time and latest end time across all threads
  let earliestTime = Infinity;
  for (const thread of threadsWithCPU) {
    earliestTime = Math.min(earliestTime, thread.time[0]);
  }

  // Process time points by repeatedly finding the next smallest time
  while (true) {
    // Find the next smallest time point among all threads
    let sampleTime = Infinity;
    for (let threadIdx = 0; threadIdx < threadsWithCPU.length; threadIdx++) {
      const cursor = cursors[threadIdx];
      const thread = threadsWithCPU[threadIdx];
      if (cursor < thread.time.length) {
        sampleTime = Math.min(sampleTime, thread.time[cursor]);
      }
    }

    if (sampleTime === Infinity) {
      break; // No more time points
    }

    // Advance cursors for all threads at this time point, and
    // sum CPU ratios from all active threads at this time point
    let sumCPURatio = 0;
    for (let threadIdx = 0; threadIdx < threadsWithCPU.length; threadIdx++) {
      const thread = threadsWithCPU[threadIdx];
      const cursor = cursors[threadIdx];
      if (cursor === thread.time.length) {
        // This thread has already ended.
        continue;
      }
      if (cursor > 0) {
        sumCPURatio += thread.cpuRatio[cursor];
      }
      if (thread.time[cursor] === sampleTime) {
        cursors[threadIdx]++;
      }
    }

    // Add this time point
    combinedTime.push(sampleTime);
    combinedCPURatio.push(sumCPURatio);
    combinedMaxCpuRatio = Math.max(combinedMaxCpuRatio, sumCPURatio);
  }

  return {
    time: combinedTime,
    cpuRatio: Float64Array.from(combinedCPURatio),
    maxCpuRatio: combinedMaxCpuRatio,
    length: combinedTime.length,
  };
}
