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
import { collectSliceTree } from '../cpu-activity';
import type { Store } from '../../types/store';
import type { ThreadInfo, ProcessListItem } from '../process-thread-list';
import type { TimestampManager } from '../timestamps';
import type { ThreadMap } from '../thread-map';
import type { ProfileInfoResult } from '../types';

/**
 * Filter a list of processes by a search string.
 * A process is included if its name or pid matches.
 * A thread is included if its name or tid matches, or if its parent process matches.
 */
function applySearchFilter(
  processes: ProcessListItem[],
  search: string
): ProcessListItem[] {
  const query = search.toLowerCase();
  const result: ProcessListItem[] = [];

  for (const process of processes) {
    const processMatches =
      process.name.toLowerCase().includes(query) ||
      String(process.pid).includes(query);

    const matchingThreads = processMatches
      ? process.threads
      : process.threads.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            String(t.tid).includes(query)
        );

    if (matchingThreads.length > 0) {
      result.push({
        ...process,
        threads: matchingThreads,
        remainingThreads: undefined,
      });
    }
  }

  return result;
}

/**
 * Collect profile information in structured format.
 */
export function collectProfileInfo(
  store: Store,
  timestampManager: TimestampManager,
  threadMap: ThreadMap,
  processIndexMap: Map<string, number>,
  showAll: boolean = false,
  search?: string
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
    tid: thread.tid,
    cpuMs: threadCPUTimeMs ? threadCPUTimeMs[index] : 0,
    pid: thread.pid,
  }));

  // Build the process/thread list (always show all when searching)
  const result = buildProcessThreadList(
    threads,
    processIndexMap,
    showAll || search !== undefined
  );

  // Apply process names and timing from the profile
  result.processes.forEach((processItem) => {
    const threadFromProcess = profile.threads.find(
      (t) => t.pid === processItem.pid
    );
    if (threadFromProcess) {
      processItem.name =
        threadFromProcess.processName ||
        threadFromProcess.processType ||
        'unknown';
      processItem.startTime = threadFromProcess.processStartupTime;
      processItem.endTime = threadFromProcess.processShutdownTime;
    }
  });

  // Apply search filter after process names are resolved
  const processesToShow =
    search !== undefined
      ? applySearchFilter(result.processes, search)
      : result.processes;

  const processesData: ProfileInfoResult['processes'] = processesToShow.map(
    (processItem) => {
      let startTimeName: string | undefined;
      let endTimeName: string | null | undefined;
      if (processItem.startTime !== undefined) {
        startTimeName = timestampManager.nameForTimestamp(
          processItem.startTime
        );
        if (processItem.endTime !== null && processItem.endTime !== undefined) {
          endTimeName = timestampManager.nameForTimestamp(processItem.endTime);
        } else {
          endTimeName = null;
        }
      }

      return {
        processIndex: processItem.processIndex,
        pid: processItem.pid,
        name: processItem.name,
        cpuMs: processItem.cpuMs,
        startTime: processItem.startTime,
        startTimeName,
        endTime: processItem.endTime,
        endTimeName,
        threads: processItem.threads.map((thread) => ({
          threadIndex: thread.threadIndex,
          threadHandle: threadMap.handleForThreadIndex(thread.threadIndex),
          name: thread.name,
          tid: thread.tid,
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
    showAll: showAll && search === undefined,
    searchQuery: search,
    processes: processesData,
    remainingProcesses:
      search !== undefined ? undefined : result.remainingProcesses,
    cpuActivity,
  };
}
