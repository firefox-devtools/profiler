/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { buildProcessThreadList } from 'firefox-profiler/profile-query/process-thread-list';

import type { ThreadInfo } from 'firefox-profiler/profile-query/process-thread-list';

describe('buildProcessThreadList', function () {
  function createThread(
    threadIndex: number,
    pid: string,
    name: string,
    cpuMs: number
  ): ThreadInfo {
    return { threadIndex, pid, name, cpuMs };
  }

  it('shows top 5 processes by CPU, plus any needed for top 20 threads', function () {
    // All 7 threads are in top 20, so all 7 processes should be shown
    const threads: ThreadInfo[] = [
      createThread(0, 'p1', 'Thread1', 100),
      createThread(1, 'p2', 'Thread2', 80),
      createThread(2, 'p3', 'Thread3', 60),
      createThread(3, 'p4', 'Thread4', 40),
      createThread(4, 'p5', 'Thread5', 20),
      createThread(5, 'p6', 'Thread6', 10),
      createThread(6, 'p7', 'Thread7', 5),
    ];

    const processIndexMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 1],
      ['p3', 2],
      ['p4', 3],
      ['p5', 4],
      ['p6', 5],
      ['p7', 6],
    ]);

    const result = buildProcessThreadList(threads, processIndexMap);

    // All 7 threads are in top 20, so all 7 processes are shown
    expect(result.processes.length).toBe(7);
    expect(result.processes.map((p) => p.pid)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
    ]);
  });

  it('includes processes with threads in top 20, even if not in top 5 processes', function () {
    // Process p1 has high CPU from one thread
    // Process p2 has low CPU total but has a thread in the top 20
    const threads: ThreadInfo[] = [
      createThread(0, 'p1', 'Thread1', 100),
      createThread(1, 'p1', 'Thread2', 1),
      createThread(2, 'p1', 'Thread3', 1),
      createThread(3, 'p2', 'HighCPU', 50), // This thread is in top 20
      createThread(4, 'p2', 'LowCPU', 0.5),
      createThread(5, 'p3', 'Thread6', 80),
      createThread(6, 'p4', 'Thread7', 70),
      createThread(7, 'p5', 'Thread8', 60),
      createThread(8, 'p6', 'Thread9', 55),
    ];

    const processIndexMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 1],
      ['p3', 2],
      ['p4', 3],
      ['p5', 4],
      ['p6', 5],
    ]);

    const result = buildProcessThreadList(threads, processIndexMap);

    // Should include p2 even though it's not in top 5 by total CPU
    // because it has a thread (t3) in the top 20
    expect(result.processes.map((p) => p.pid)).toContain('p2');
  });

  it('shows up to 5 threads per process when none are in top 20', function () {
    // Create 4 high-CPU processes that will be in top 5
    const threads: ThreadInfo[] = [];
    threads.push(createThread(0, 'p-high-0', 'High1', 10000));
    threads.push(createThread(1, 'p-high-1', 'High2', 9000));
    threads.push(createThread(2, 'p-high-2', 'High3', 8000));
    threads.push(createThread(3, 'p-high-3', 'High4', 7000));

    // p1 will be 5th by total CPU (with many threads but none in top 20)
    threads.push(createThread(10, 'p1', 'Thread1', 600));
    threads.push(createThread(11, 'p1', 'Thread2', 500));
    threads.push(createThread(12, 'p1', 'Thread3', 400));
    threads.push(createThread(13, 'p1', 'Thread4', 300));
    threads.push(createThread(14, 'p1', 'Thread5', 200));
    threads.push(createThread(15, 'p1', 'Thread6', 100));
    threads.push(createThread(16, 'p1', 'Thread7', 50));
    // p1 total: 2150ms, should be 5th place

    // Add threads that will fill positions 5-20 in top 20, pushing out p1's threads
    threads.push(createThread(4, 'p2', 'Med1', 6000));
    threads.push(createThread(5, 'p2', 'Med2', 5000));
    threads.push(createThread(6, 'p3', 'Med3', 4000));
    threads.push(createThread(7, 'p3', 'Med4', 3000));
    threads.push(createThread(8, 'p4', 'Med5', 2000));
    threads.push(createThread(9, 'p4', 'Med6', 1000));
    threads.push(createThread(20, 'p5', 'Med7', 900));
    threads.push(createThread(21, 'p5', 'Med8', 800));
    threads.push(createThread(22, 'p6', 'Med9', 700));
    threads.push(createThread(23, 'p6', 'Med10', 650));
    threads.push(createThread(24, 'p7', 'Med11', 640));
    threads.push(createThread(25, 'p7', 'Med12', 630));
    threads.push(createThread(26, 'p8', 'Med13', 620));
    threads.push(createThread(27, 'p8', 'Med14', 610));
    // Top 20 are now: 10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000, 900, 800, 700, 650, 640, 630, 620, 610, 600, 500
    // p1's highest is 600ms (position 19) and 500ms (position 20)

    const processIndexMap = new Map<string, number>([
      ['p-high-0', 0],
      ['p-high-1', 1],
      ['p-high-2', 2],
      ['p-high-3', 3],
      ['p1', 4],
      ['p2', 5],
      ['p3', 6],
      ['p4', 7],
      ['p5', 8],
      ['p6', 9],
      ['p7', 10],
      ['p8', 11],
    ]);

    const result = buildProcessThreadList(threads, processIndexMap);

    const p1 = result.processes.find((p) => p.pid === 'p1');
    expect(p1).toBeDefined();
    // t10 and t11 from p1 are in top 20, plus we fill up to 5 total
    expect(p1!.threads.length).toBe(5);
    // Should show the 2 from top 20 plus the next 3 highest
    expect(p1!.threads.map((t) => t.threadIndex)).toEqual([10, 11, 12, 13, 14]);
  });

  it('includes summary for remaining threads', function () {
    // Create scenario where only some threads from p1 are in top 20
    const threads: ThreadInfo[] = [];

    // Add 15 high-CPU threads from other processes
    for (let i = 0; i < 15; i++) {
      threads.push(
        createThread(i, `p-high-${i}`, `HighCPU${i}`, 1000 - i * 10)
      );
    }

    // Add p1 threads - the first 5 will be in top 20 (850ms is above 910ms cutoff)
    threads.push(createThread(15, 'p1', 'Thread1', 950)); // In top 20
    threads.push(createThread(16, 'p1', 'Thread2', 940)); // In top 20
    threads.push(createThread(17, 'p1', 'Thread3', 930)); // In top 20
    threads.push(createThread(18, 'p1', 'Thread4', 920)); // In top 20
    threads.push(createThread(19, 'p1', 'Thread5', 910)); // In top 20 (20th place)
    // These are not in top 20
    threads.push(createThread(20, 'p1', 'Thread6', 50));
    threads.push(createThread(21, 'p1', 'Thread7', 40));
    threads.push(createThread(22, 'p1', 'Thread8', 30));

    const processIndexMap = new Map<string, number>([['p1', 100]]);
    for (let i = 0; i < 15; i++) {
      processIndexMap.set(`p-high-${i}`, i);
    }

    const result = buildProcessThreadList(threads, processIndexMap);

    const p1 = result.processes.find((p) => p.pid === 'p1');
    expect(p1).toBeDefined();

    // Should show 5 top-20 threads
    expect(p1!.threads.length).toBe(5);
    expect(p1!.threads.map((t) => t.threadIndex)).toEqual([15, 16, 17, 18, 19]);

    // Should have remaining threads summary
    expect(p1!.remainingThreads).toEqual({
      count: 3,
      combinedCpuMs: 120, // 50 + 40 + 30
      maxCpuMs: 50,
    });
  });

  it('shows ALL top-20 threads from a process, even if more than 5', function () {
    // This is the critical test case for the bug fix:
    // If a process has 7 threads in the top 20, all 7 should be shown,
    // not just the first 5.
    const threads: ThreadInfo[] = [
      // Process p1 has 7 threads in the top 20
      createThread(0, 'p1', 'Thread1', 100),
      createThread(1, 'p1', 'Thread2', 95),
      createThread(2, 'p1', 'Thread3', 90),
      createThread(3, 'p1', 'Thread4', 85),
      createThread(4, 'p1', 'Thread5', 80),
      createThread(5, 'p1', 'Thread6', 75),
      createThread(6, 'p1', 'Thread7', 70),
      // These threads from p1 are not in top 20
      createThread(7, 'p1', 'Thread8', 5),
      createThread(8, 'p1', 'Thread9', 4),
      // Other processes to fill out the top 20
      createThread(9, 'p2', 'Thread10', 65),
      createThread(10, 'p2', 'Thread11', 60),
      createThread(11, 'p3', 'Thread12', 55),
      createThread(12, 'p3', 'Thread13', 50),
      createThread(13, 'p4', 'Thread14', 45),
      createThread(14, 'p4', 'Thread15', 40),
      createThread(15, 'p5', 'Thread16', 35),
      createThread(16, 'p5', 'Thread17', 30),
      createThread(17, 'p6', 'Thread18', 25),
      createThread(18, 'p6', 'Thread19', 20),
      createThread(19, 'p7', 'Thread20', 15),
      createThread(20, 'p7', 'Thread21', 10),
      createThread(21, 'p8', 'Thread22', 9),
      createThread(22, 'p8', 'Thread23', 8),
      createThread(23, 'p9', 'Thread24', 7),
      createThread(24, 'p9', 'Thread25', 6),
      // More threads below top 20 - these push out t7 and t8 from p1
    ];

    const processIndexMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 1],
      ['p3', 2],
      ['p4', 3],
      ['p5', 4],
      ['p6', 5],
      ['p7', 6],
      ['p8', 7],
      ['p9', 8],
    ]);

    const result = buildProcessThreadList(threads, processIndexMap);

    const p1 = result.processes.find((p) => p.pid === 'p1');
    expect(p1).toBeDefined();

    // Should show all 7 threads from top 20, not just 5
    expect(p1!.threads.length).toBe(7);
    expect(p1!.threads.map((t) => t.threadIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);

    // Should have remaining threads summary for the 2 threads not in top 20
    expect(p1!.remainingThreads).toEqual({
      count: 2,
      combinedCpuMs: 9, // 5 + 4
      maxCpuMs: 5,
    });
  });

  it('sorts threads by CPU within each process', function () {
    const threads: ThreadInfo[] = [
      createThread(0, 'p1', 'Low', 10),
      createThread(1, 'p1', 'High', 100),
      createThread(2, 'p1', 'Medium', 50),
    ];

    const processIndexMap = new Map<string, number>([['p1', 0]]);

    const result = buildProcessThreadList(threads, processIndexMap);

    expect(result.processes[0].threads.map((t) => t.name)).toEqual([
      'High',
      'Medium',
      'Low',
    ]);
  });

  it('handles empty thread list', function () {
    const threads: ThreadInfo[] = [];
    const processIndexMap = new Map<string, number>();

    const result = buildProcessThreadList(threads, processIndexMap);

    expect(result.processes).toEqual([]);
    expect(result.remainingProcesses).toBeUndefined();
  });

  it('handles single thread', function () {
    const threads: ThreadInfo[] = [createThread(0, 'p1', 'OnlyThread', 100)];

    const processIndexMap = new Map<string, number>([['p1', 0]]);

    const result = buildProcessThreadList(threads, processIndexMap);

    expect(result.processes.length).toBe(1);
    expect(result.processes[0].threads.length).toBe(1);
    expect(result.processes[0].remainingThreads).toBeUndefined();
    expect(result.remainingProcesses).toBeUndefined();
  });

  it('correctly aggregates CPU time per process', function () {
    const threads: ThreadInfo[] = [
      createThread(0, 'p1', 'Thread1', 100),
      createThread(1, 'p1', 'Thread2', 50),
      createThread(2, 'p1', 'Thread3', 25),
      createThread(3, 'p2', 'Thread4', 200),
    ];

    const processIndexMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 1],
    ]);

    const result = buildProcessThreadList(threads, processIndexMap);

    const p1 = result.processes.find((p) => p.pid === 'p1');
    const p2 = result.processes.find((p) => p.pid === 'p2');

    expect(p1!.cpuMs).toBe(175); // 100 + 50 + 25
    expect(p2!.cpuMs).toBe(200);
  });

  it('includes summary for remaining processes', function () {
    // Create a scenario with many processes, where only some are shown
    // We need the top 5 processes to be shown, but processes 6-10 should NOT have
    // any threads in the top 20 overall
    const threads: ThreadInfo[] = [];

    // Add 20 high-CPU threads from top 5 processes
    // Each of these processes gets 4 threads in the top 20
    for (let procNum = 0; procNum < 5; procNum++) {
      for (let threadNum = 0; threadNum < 4; threadNum++) {
        const threadIndex = procNum * 4 + threadNum;
        const cpuMs = 1000 - threadIndex * 10; // 1000, 990, 980, ... down to 810
        threads.push(
          createThread(
            threadIndex,
            `p${procNum}`,
            `Thread${threadIndex}`,
            cpuMs
          )
        );
      }
    }

    // Add 5 more processes with low CPU (not in top 20)
    // These should not be shown
    for (let procNum = 5; procNum < 10; procNum++) {
      const threadIndex = 20 + procNum - 5;
      const cpuMs = 50 - (procNum - 5) * 10; // 50, 40, 30, 20, 10
      threads.push(
        createThread(threadIndex, `p${procNum}`, `Thread${threadIndex}`, cpuMs)
      );
    }

    const processIndexMap = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      processIndexMap.set(`p${i}`, i);
    }

    const result = buildProcessThreadList(threads, processIndexMap);

    // Should show only top 5 processes (those with threads in top 20)
    expect(result.processes.length).toBe(5);
    expect(result.processes.map((p) => p.pid)).toEqual([
      'p0',
      'p1',
      'p2',
      'p3',
      'p4',
    ]);

    // Should have remaining processes summary for the last 5 processes
    expect(result.remainingProcesses).toEqual({
      count: 5,
      combinedCpuMs: 150, // 50 + 40 + 30 + 20 + 10
      maxCpuMs: 50,
    });
  });
});
