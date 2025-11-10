/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineCPUDataFromThreads } from 'firefox-profiler/profile-logic/combined-cpu';
import type { SamplesTable } from 'firefox-profiler/types';

function createSamplesTable(time: number[], cpuRatio: number[]): SamplesTable {
  return {
    time,
    threadCPURatio: Float64Array.from(cpuRatio),
    // Other required fields (stubbed for test purposes)
    stack: new Array(time.length).fill(null),
    length: time.length,
    weight: null,
    weightType: 'samples',
  };
}

describe('combineCPUDataFromThreads', function () {
  it('returns null when given empty array', function () {
    const result = combineCPUDataFromThreads([]);
    expect(result).toBeNull();
  });

  it('returns single thread data unchanged for one thread', function () {
    const samples = [createSamplesTable([0, 100, 200], [0.0, 0.5, 0.8])];

    const result = combineCPUDataFromThreads(samples);

    expect(result).not.toBeNull();
    expect(result!.time).toEqual([0, 100, 200]);
    expect(Array.from(result!.cpuRatio)).toEqual([0.0, 0.5, 0.8]);
  });

  it('combines two threads with same sample times', function () {
    const samples = [
      createSamplesTable([0, 100, 200], [0, 0.5, 0.3]),
      createSamplesTable([0, 100, 200], [0, 0.4, 0.5]),
    ];

    const result = combineCPUDataFromThreads(samples);

    expect(result).not.toBeNull();
    expect(result!.time).toEqual([0, 100, 200]);
    expect(Array.from(result!.cpuRatio)).toEqual([0, 0.9, 0.8]);
  });

  it('combines threads with different sample times', function () {
    const samples = [
      createSamplesTable([0, 100, 200], [0.0, 0.5, 0.8]),
      createSamplesTable([50, 150, 250], [0.0, 0.3, 0.4]),
    ];

    const result = combineCPUDataFromThreads(samples);

    expect(result).not.toBeNull();
    // Should have all unique time points
    expect(result!.time).toEqual([0, 50, 100, 150, 200, 250]);

    //       0: thread1=bef, thread2=bef → 0.0
    //   0- 50: thread1=0.5, thread2=bef → 0.5
    //  50-100: thread1=0.5, thread2=0.3 → 0.8
    // 100-150: thread1=0.8, thread2=0.3 → 1.1
    // 150-200: thread1=0.8, thread2=0.4 → 1.2
    // 200-250: thread1=end, thread2=0.4 → 0.4
    const expected = [0.0, 0.5, 0.8, 1.1, 1.2, 0.4];
    const actual = Array.from(result!.cpuRatio);
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i]).toBeCloseTo(expected[i], 10);
    }
  });

  it('handles threads with non-overlapping time ranges', function () {
    const samples = [
      createSamplesTable([0, 10, 20], [0.0, 0.3, 0.5]),
      createSamplesTable([30, 40, 50], [0.0, 0.4, 0.6]),
    ];

    const result = combineCPUDataFromThreads(samples);

    expect(result).not.toBeNull();
    expect(result!.time).toEqual([0, 10, 20, 30, 40, 50]);

    // At times 0, 10, 20: only thread1 has samples
    // At times 30, 40, 50: thread1 has ended (30 > 20), only thread2 contributes
    expect(Array.from(result!.cpuRatio)).toEqual([
      0.0, 0.3, 0.5, 0.0, 0.4, 0.6,
    ]);
  });
});
