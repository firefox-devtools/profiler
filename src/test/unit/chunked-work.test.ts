/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  runInSlices,
  runToCompletion,
} from '../../profile-logic/benchmark/chunked-work';
import type { SlicedWork } from '../../profile-logic/benchmark/chunked-work';
import {
  computeFamilyCorrection,
  computeFamilyCorrectionInSlices,
  makePermutationBaseIndices,
} from '../../profile-logic/benchmark/perf-compare-stats';
import type { FamilyMember } from '../../profile-logic/benchmark/perf-compare-stats';

/** Counts its own steps, so a test can tell where a driver stopped. */
function countingWork(steps: number, log: number[]): SlicedWork<string> {
  return (function* () {
    for (let i = 0; i < steps; i++) {
      log.push(i);
      yield;
    }
    return 'done';
  })();
}

describe('runToCompletion', function () {
  it('runs every step and returns the value', function () {
    const log: number[] = [];
    expect(runToCompletion(countingWork(5, log))).toBe('done');
    expect(log).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('runInSlices', function () {
  it('runs every step and returns the value', async function () {
    const log: number[] = [];
    await expect(runInSlices(countingWork(5, log))).resolves.toBe('done');
    expect(log).toEqual([0, 1, 2, 3, 4]);
  });

  it('yields the main thread when a slice runs long, and still finishes', async function () {
    // Two slices' worth of work, so at least one real yield happens and the
    // MessageChannel path is exercised rather than skipped.
    const work = (function* (): SlicedWork<number> {
      const start = performance.now();
      let steps = 0;
      while (performance.now() - start < 30) {
        steps++;
        yield;
      }
      return steps;
    })();
    expect(await runInSlices(work)).toBeGreaterThan(0);
  });

  it('abandons the work when the signal is aborted', async function () {
    const log: number[] = [];
    const work = countingWork(5, log);
    await expect(
      runInSlices(work, AbortSignal.abort(new Error('never mind')))
    ).rejects.toThrow('never mind');
    // Stopped at the first yield point rather than at the next slice boundary,
    // which for a cheap computation would have been never.
    expect(log).toEqual([0]);
  });
});

describe('computeFamilyCorrectionInSlices', function () {
  const nullFamily = (members: number, n: number): FamilyMember[] => {
    const family: FamilyMember[] = [];
    for (let m = 0; m < members; m++) {
      const base = [];
      const comp = [];
      for (let i = 0; i < n; i++) {
        base.push(1 + ((m * 7 + i * 3) % 5));
        comp.push(1 + ((m * 5 + i * 11) % 5));
      }
      family.push({ base, comp });
    }
    return family;
  };

  it('is the same computation as computeFamilyCorrection, one draw at a time', async function () {
    const family = nullFamily(6, 8);
    const draws = makePermutationBaseIndices(8, 8, 40);

    const straightThrough = computeFamilyCorrection(family, draws);
    const inSlices = await runInSlices(
      computeFamilyCorrectionInSlices(family, draws)
    );
    expect(inSlices).toEqual(straightThrough);
  });

  it('offers a yield point per draw', function () {
    const draws = makePermutationBaseIndices(8, 8, 40);
    const work = computeFamilyCorrectionInSlices(nullFamily(6, 8), draws);
    let yieldPoints = 0;
    while (!work.next().done) {
      yieldPoints++;
    }
    expect(yieldPoints).toBe(draws.length);
  });
});
