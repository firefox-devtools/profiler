/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getProfile,
  getThreadCPUTimeMs,
  getRangeFilteredCombinedThreadActivitySlices,
} from 'firefox-profiler/selectors/profile';
import { getProfileNameWithDefault } from 'firefox-profiler/selectors/url-state';
import { buildProcessThreadList } from '../process-thread-list';
import { formatTimestamp } from '../../utils/format-numbers';
import { printSliceTree, collectSliceTree } from '../cpu-activity';
import type { Store } from '../../types/store';
import type { ThreadInfo } from '../process-thread-list';
import type { TimestampManager } from '../timestamps';
import type { ThreadMap } from '../thread-map';
import type { ProfileInfoResult } from '../types';

/**
 * Collect profile information in structured format.
 */
export function collectProfileInfo(
  store: Store,
  timestampManager: TimestampManager,
  threadMap: ThreadMap,
  processIndexMap: Map<string, number>
): ProfileInfoResult {
  const state = store.getState();
  const profile = getProfile(state);
  const profileName = getProfileNameWithDefault(state);
  const processCount = new Set(profile.threads.map((t) => t.pid)).size;
  const threadCPUTimeMs = getThreadCPUTimeMs(state);

  // Build thread info array
  const threads: ThreadInfo[] = profile.threads.map((thread, index) => ({
    threadIndex: index,
    name: thread.name,
    cpuMs: threadCPUTimeMs ? threadCPUTimeMs[index] : 0,
    pid: thread.pid,
  }));

  // Build the process/thread list
  const result = buildProcessThreadList(threads, processIndexMap);

  // Apply process names and timing from the profile
  const processesData: ProfileInfoResult['processes'] = result.processes.map(
    (processItem) => {
      // Find a thread from this process to get the process name and timing
      const threadFromProcess = profile.threads.find(
        (t) => t.pid === processItem.pid
      );

      let processName = 'unknown';
      let startTime: number | undefined;
      let startTimeName: string | undefined;
      let endTime: number | null | undefined;
      let endTimeName: string | null | undefined;

      if (threadFromProcess) {
        processName =
          threadFromProcess.processName ||
          threadFromProcess.processType ||
          'unknown';
        startTime = threadFromProcess.processStartupTime;
        if (startTime !== undefined) {
          startTimeName = timestampManager.nameForTimestamp(startTime);
          endTime = threadFromProcess.processShutdownTime;
          if (endTime !== null && endTime !== undefined) {
            endTimeName = timestampManager.nameForTimestamp(endTime);
          } else {
            endTimeName = null;
          }
        }
      }

      return {
        processIndex: processItem.processIndex,
        pid: processItem.pid,
        name: processName,
        cpuMs: processItem.cpuMs,
        startTime,
        startTimeName,
        endTime,
        endTimeName,
        threads: processItem.threads.map((thread) => ({
          threadIndex: thread.threadIndex,
          threadHandle: threadMap.handleForThreadIndex(thread.threadIndex),
          name: thread.name,
          cpuMs: thread.cpuMs,
        })),
        remainingThreads: processItem.remainingThreads,
      };
    }
  );

  // Collect CPU activity (respecting zoom)
  const combinedCpuActivity =
    getRangeFilteredCombinedThreadActivitySlices(state);
  const cpuActivity =
    combinedCpuActivity !== null
      ? collectSliceTree(combinedCpuActivity, timestampManager)
      : null;

  return {
    type: 'profile-info',
    name: profileName || 'Unknown Profile',
    platform: profile.meta.oscpu || 'Unknown',
    threadCount: profile.threads.length,
    processCount,
    processes: processesData,
    remainingProcesses: result.remainingProcesses,
    cpuActivity,
  };
}

export function formatProfileInfo(
  store: Store,
  timestampManager: TimestampManager,
  threadMap: ThreadMap,
  processIndexMap: Map<string, number>
): string {
  const state = store.getState();
  const profile = getProfile(state);
  const profileName = getProfileNameWithDefault(state);
  const processCount = new Set(profile.threads.map((t) => t.pid)).size;
  const threadCPUTimeMs = getThreadCPUTimeMs(state);

  // If no CPU time data, fall back to a simple message
  if (threadCPUTimeMs === null) {
    return `\
Name: ${profileName}
Platform: ${profile.meta.oscpu}

This profile contains ${profile.threads.length} threads across ${processCount} processes.
(CPU time information not available)`;
  }

  // Build thread info array for the function
  const threads: ThreadInfo[] = profile.threads.map((thread, index) => ({
    threadIndex: index,
    name: thread.name,
    cpuMs: threadCPUTimeMs[index],
    pid: thread.pid,
  }));

  // Use the testable function to build the process/thread list
  const result = buildProcessThreadList(threads, processIndexMap);

  // Apply process names and timing from the profile
  result.processes.forEach((processItem) => {
    // Find a thread from this process to get the process name and timing
    const threadFromProcess = profile.threads.find(
      (t) => t.pid === processItem.pid
    );
    if (threadFromProcess) {
      processItem.name =
        threadFromProcess.processName ||
        threadFromProcess.processType ||
        'unknown';
      // Add process start/end times (same for all threads in a process)
      processItem.startTime = threadFromProcess.processStartupTime;
      processItem.endTime = threadFromProcess.processShutdownTime;
    }
  });

  // Build the output lines
  const lines: string[] = [];
  result.processes.forEach(
    ({
      pid,
      name,
      cpuMs,
      processIndex,
      threads,
      remainingThreads,
      startTime,
      endTime,
    }) => {
      // Format process timing information
      let timingInfo = '';
      if (startTime !== undefined) {
        const startName = timestampManager.nameForTimestamp(startTime);
        if (endTime !== null && endTime !== undefined) {
          const endName = timestampManager.nameForTimestamp(endTime);
          timingInfo = ` [${startName} → ${endName}]`;
        } else {
          timingInfo = ` [${startName} → end]`;
        }
      }

      lines.push(
        `  p-${processIndex}: ${name} [pid ${pid}]${timingInfo} - ${formatTimestamp(cpuMs)}`
      );

      threads.forEach(
        ({ threadIndex, name: threadName, cpuMs: threadCpuMs }) => {
          const threadHandle = threadMap.handleForThreadIndex(threadIndex);
          lines.push(
            `    ${threadHandle}: ${threadName} - ${formatTimestamp(threadCpuMs)}`
          );
        }
      );

      // Add summary line for remaining threads
      if (remainingThreads) {
        lines.push(
          `    + ${remainingThreads.count} more threads with combined CPU time ${formatTimestamp(remainingThreads.combinedCpuMs)} and max CPU time ${formatTimestamp(remainingThreads.maxCpuMs)}`
        );
      }
    }
  );

  // Add summary line for remaining processes
  if (result.remainingProcesses) {
    lines.push(
      `  + ${result.remainingProcesses.count} more processes with combined CPU time ${formatTimestamp(result.remainingProcesses.combinedCpuMs)} and max CPU time ${formatTimestamp(result.remainingProcesses.maxCpuMs)}`
    );
  }

  const combinedCpuActivity =
    getRangeFilteredCombinedThreadActivitySlices(state);
  const cpuActivityLines =
    combinedCpuActivity !== null
      ? printSliceTree(combinedCpuActivity, timestampManager)
      : [];

  return `\
Name: ${profileName}
Platform: ${profile.meta.oscpu}

This profile contains ${profile.threads.length} threads across ${processCount} processes.

Top processes and threads by CPU usage:
${lines.join('\n')}

CPU activity over time:
${cpuActivityLines.join('\n')}
`;
}
