/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type ThreadInfo = {
  threadIndex: number;
  name: string;
  cpuMs: number;
  pid: string;
};

export type ProcessInfo = {
  pid: string;
  processIndex: number;
  name: string;
  cpuMs: number;
  threads: Array<{ threadIndex: number; name: string; cpuMs: number }>;
};

export type ProcessListItem = {
  processIndex: number;
  pid: string;
  name: string;
  cpuMs: number;
  threads: Array<{ threadIndex: number; name: string; cpuMs: number }>;
  remainingThreads?: {
    count: number;
    combinedCpuMs: number;
    maxCpuMs: number;
  };
  startTime?: number;
  endTime?: number | null;
};

export type ProcessThreadListResult = {
  processes: ProcessListItem[];
  remainingProcesses?: {
    count: number;
    combinedCpuMs: number;
    maxCpuMs: number;
  };
};

/**
 * Build a hierarchical list of processes and threads for display.
 *
 * Shows:
 * - Top 5 processes by CPU time
 * - Any additional processes that contain threads from the top 20 threads overall
 * - For each process, shows its top threads:
 *   - If the process has threads in the top 20 overall, show ALL of those threads
 *   - Otherwise, show up to 5 threads
 * - Summary of remaining threads if any
 * - Summary of remaining processes if any
 */
export function buildProcessThreadList(
  threads: ThreadInfo[],
  processIndexMap: Map<string, number>
): ProcessThreadListResult {
  // Aggregate threads by process
  const processCPUMap = new Map<string, ProcessInfo>();

  threads.forEach((thread) => {
    const { pid, threadIndex, name, cpuMs } = thread;
    const existing = processCPUMap.get(pid);

    if (existing) {
      existing.cpuMs += cpuMs;
      existing.threads.push({ threadIndex, name, cpuMs });
    } else {
      const processIndex = processIndexMap.get(pid);
      if (processIndex === undefined) {
        throw new Error(`Process index not found for pid ${pid}`);
      }
      // Infer process name from first thread's process info
      // In real usage, this would come from the thread's processName field
      processCPUMap.set(pid, {
        pid,
        processIndex,
        name: pid, // Will be overridden by caller
        cpuMs,
        threads: [{ threadIndex, name, cpuMs }],
      });
    }
  });

  // Sort threads within each process by CPU
  processCPUMap.forEach((processInfo) => {
    processInfo.threads.sort((a, b) => b.cpuMs - a.cpuMs);
  });

  // Get all processes sorted by CPU
  const allProcesses = Array.from(processCPUMap.values());
  allProcesses.sort((a, b) => b.cpuMs - a.cpuMs);

  // Get top 5 processes by CPU
  const top5ProcessPids = new Set(allProcesses.slice(0, 5).map((p) => p.pid));

  // Get top 20 threads overall
  const allThreadsSorted = [...threads].sort((a, b) => b.cpuMs - a.cpuMs);
  const top20Threads = allThreadsSorted.slice(0, 20);
  const top20ThreadPids = new Set(top20Threads.map((t) => t.pid));

  // Build a set of threadIndexes that are in the top 20
  const top20ThreadIndexes = new Set(top20Threads.map((t) => t.threadIndex));

  // Determine which processes to show
  const processesToShow = allProcesses.filter(
    (p) => top5ProcessPids.has(p.pid) || top20ThreadPids.has(p.pid)
  );

  // Build the result list
  const result: ProcessListItem[] = processesToShow.map((processInfo) => {
    const { pid, processIndex, name, cpuMs, threads: allThreads } = processInfo;

    // Separate threads into top-20 and others
    const top20ThreadsInProcess = allThreads.filter((t) =>
      top20ThreadIndexes.has(t.threadIndex)
    );
    const otherThreads = allThreads.filter(
      (t) => !top20ThreadIndexes.has(t.threadIndex)
    );

    // Show all top-20 threads, plus fill up to 5 with other threads if needed
    const threadsToShow = [...top20ThreadsInProcess];
    const remainingSlots = Math.max(0, 5 - threadsToShow.length);
    threadsToShow.push(...otherThreads.slice(0, remainingSlots));

    // Calculate remaining threads summary
    const remainingThreads = otherThreads.slice(remainingSlots);
    let remainingThreadsInfo: ProcessListItem['remainingThreads'] = undefined;

    if (remainingThreads.length > 0) {
      const combinedCpuMs = remainingThreads.reduce(
        (sum, t) => sum + t.cpuMs,
        0
      );
      const maxCpuMs = Math.max(...remainingThreads.map((t) => t.cpuMs));
      remainingThreadsInfo = {
        count: remainingThreads.length,
        combinedCpuMs,
        maxCpuMs,
      };
    }

    return {
      processIndex,
      pid,
      name,
      cpuMs,
      threads: threadsToShow,
      remainingThreads: remainingThreadsInfo,
    };
  });

  // Calculate remaining processes summary
  const remainingProcesses = allProcesses.slice(processesToShow.length);
  let remainingProcessesInfo: ProcessThreadListResult['remainingProcesses'] =
    undefined;

  if (remainingProcesses.length > 0) {
    const combinedCpuMs = remainingProcesses.reduce(
      (sum, p) => sum + p.cpuMs,
      0
    );
    const maxCpuMs = Math.max(...remainingProcesses.map((p) => p.cpuMs));
    remainingProcessesInfo = {
      count: remainingProcesses.length,
      combinedCpuMs,
      maxCpuMs,
    };
  }

  return {
    processes: result,
    remainingProcesses: remainingProcessesInfo,
  };
}
