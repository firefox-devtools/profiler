/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  interpretStandardizedEffect,
  makePermutationBaseIndices,
  minimumDetectableEffect,
  permutationTwoSidedP,
  standardizedMeanDifference,
  studentTCritical,
  studentTTwoSidedP,
  welchTTest,
} from '../../profile-logic/benchmark/perf-compare-stats';

describe('studentTTwoSidedP', function () {
  // Reference values obtained independently, by Simpson integration of the t
  // density tail to 12 significant figures.
  it('matches known two-sided tail probabilities', function () {
    expect(studentTTwoSidedP(0, 10)).toBeCloseTo(1, 12);
    expect(studentTTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 4);
    expect(studentTTwoSidedP(3.169, 10)).toBeCloseTo(0.01, 4);
    expect(studentTTwoSidedP(1.96, 1e7)).toBeCloseTo(0.05, 4);
    expect(studentTTwoSidedP(2.0, 100)).toBeCloseTo(0.04821218, 8);
    expect(studentTTwoSidedP(1.0, 1)).toBeCloseTo(0.5, 6);
    expect(studentTTwoSidedP(5.0, 200)).toBeCloseTo(1.250198e-6, 11);
  });

  it('is symmetric in the sign of t and monotone in |t|', function () {
    expect(studentTTwoSidedP(-2.5, 42)).toBe(studentTTwoSidedP(2.5, 42));
    let previous = 1;
    for (const t of [0.5, 1, 1.5, 2, 3, 5, 8]) {
      const p = studentTTwoSidedP(t, 42);
      expect(p).toBeLessThan(previous);
      previous = p;
    }
  });

  it('handles degenerate input without producing NaN', function () {
    expect(studentTTwoSidedP(Infinity, 10)).toBe(0);
    expect(studentTTwoSidedP(2, 0)).toBe(1);
    expect(studentTTwoSidedP(NaN, 10)).toBe(1);
  });
});

describe('studentTCritical', function () {
  it('inverts studentTTwoSidedP', function () {
    for (const df of [5, 10, 42, 200, 398]) {
      const critical = studentTCritical(df, 0.05);
      expect(studentTTwoSidedP(critical, df)).toBeCloseTo(0.05, 6);
    }
  });

  it('approaches the normal quantile for large df', function () {
    expect(studentTCritical(1e6, 0.05)).toBeCloseTo(1.96, 3);
  });
});

describe('welchTTest', function () {
  it('computes the mean difference and its standard error', function () {
    const base = [10, 12, 11, 13, 9, 11, 10, 12];
    const comp = [14, 16, 15, 13, 17, 15, 16, 14];
    const result = welchTTest(base, comp);
    expect(result.meanBase).toBeCloseTo(11, 10);
    expect(result.meanNew).toBeCloseTo(15, 10);
    expect(result.delta).toBeCloseTo(4, 10);
    // Both samples have sample variance 1.7142857..., so se = sqrt(2*v/8).
    const variance = 12 / 7;
    expect(result.se).toBeCloseTo(Math.sqrt((2 * variance) / 8), 10);
    expect(result.t).toBeCloseTo(result.delta / result.se, 12);
    // Equal variances and equal n give df = 2(n-1).
    expect(result.df).toBeCloseTo(14, 6);
  });

  it('is equivariant under a common rescale', function () {
    const base = [1, 0, 2, 1, 0, 1, 3, 1];
    const comp = [0, 1, 1, 0, 1, 0, 1, 1];
    const plain = welchTTest(base, comp);
    const scale = 2.5121;
    const scaled = welchTTest(
      base.map((v) => v * scale),
      comp.map((v) => v * scale)
    );
    // delta and se scale; t and the standardised effect do not.
    expect(scaled.delta).toBeCloseTo(plain.delta * scale, 10);
    expect(scaled.se).toBeCloseTo(plain.se * scale, 10);
    expect(scaled.t).toBeCloseTo(plain.t, 10);
    expect(standardizedMeanDifference(scaled)).toBeCloseTo(
      standardizedMeanDifference(plain),
      10
    );
  });

  it('does not produce NaN for a bucket with no variation', function () {
    const result = welchTTest([2, 2, 2, 2], [2, 2, 2, 2]);
    expect(result.se).toBe(0);
    expect(result.t).toBe(0);
    expect(standardizedMeanDifference(result)).toBe(0);
  });

  it('treats a perfect separation as maximally significant', function () {
    // An "appeared" bucket: zero weight in every base iteration, nonzero in
    // every new one. Zero spread on both sides, so se is zero -- and reporting
    // t = 0 there would call the most clear-cut change in the profile no change.
    const appeared = welchTTest(
      new Array<number>(8).fill(0),
      new Array<number>(8).fill(3)
    );
    expect(appeared.se).toBe(0);
    expect(appeared.t).toBe(Infinity);
    expect(studentTTwoSidedP(appeared.t, appeared.df)).toBe(0);

    const disappeared = welchTTest(
      new Array<number>(8).fill(3),
      new Array<number>(8).fill(0)
    );
    expect(disappeared.t).toBe(-Infinity);
  });

  it('reports an infinite standardised effect when only the mean moved', function () {
    // Zero spread on both sides but different means: the change is real and
    // unboundedly large in units of the (nonexistent) spread.
    const result = welchTTest([2, 2, 2, 2], [3, 3, 3, 3]);
    expect(standardizedMeanDifference(result)).toBe(Infinity);
  });
});

describe('interpretStandardizedEffect', function () {
  it('uses Cohen conventional cut points, symmetric in sign', function () {
    expect(interpretStandardizedEffect(0)).toBe('Negligible');
    expect(interpretStandardizedEffect(0.19)).toBe('Negligible');
    expect(interpretStandardizedEffect(0.2)).toBe('Small');
    expect(interpretStandardizedEffect(0.49)).toBe('Small');
    expect(interpretStandardizedEffect(0.5)).toBe('Moderate');
    expect(interpretStandardizedEffect(0.79)).toBe('Moderate');
    expect(interpretStandardizedEffect(0.8)).toBe('Large');
    expect(interpretStandardizedEffect(-0.8)).toBe('Large');
    expect(interpretStandardizedEffect(-0.19)).toBe('Negligible');
  });
});

describe('minimumDetectableEffect', function () {
  it('is the delta that would sit exactly at the significance boundary', function () {
    const result = welchTTest(
      [10, 12, 11, 13, 9, 11, 10, 12],
      [11, 13, 12, 14, 10, 12, 11, 13]
    );
    const mde = minimumDetectableEffect(result, 0.05);
    // A delta of exactly the MDE produces a p-value of exactly alpha.
    expect(studentTTwoSidedP(mde / result.se, result.df)).toBeCloseTo(0.05, 8);
  });

  it('grows with the spread', function () {
    const quiet = welchTTest(
      [10, 10, 10, 10, 10, 10],
      [10, 10, 10, 10, 10, 11]
    );
    const noisy = welchTTest([2, 18, 5, 15, 8, 12], [3, 17, 6, 14, 9, 13]);
    expect(minimumDetectableEffect(noisy)).toBeGreaterThan(
      minimumDetectableEffect(quiet)
    );
  });
});

describe('permutationTwoSidedP', function () {
  const masks = makePermutationBaseIndices(12, 12, 999, 1);

  it('assigns each relabelling the right group sizes, without repeats', function () {
    const groups = makePermutationBaseIndices(5, 7, 20, 42);
    expect(groups).toHaveLength(20);
    for (const group of groups) {
      expect(group).toHaveLength(5);
      // Distinct indices, all within the pooled range.
      expect(new Set(group).size).toBe(5);
      for (const index of group) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(12);
      }
    }
  });

  it('is deterministic for a given seed', function () {
    const asArrays = (groups: Int32Array[]) => groups.map((g) => Array.from(g));
    expect(asArrays(makePermutationBaseIndices(4, 4, 5, 7))).toEqual(
      asArrays(makePermutationBaseIndices(4, 4, 5, 7))
    );
    expect(asArrays(makePermutationBaseIndices(4, 4, 5, 7))).not.toEqual(
      asArrays(makePermutationBaseIndices(4, 4, 5, 8))
    );
  });

  it('finds no evidence when the two sides are interchangeable', function () {
    const base = [1, 0, 2, 1, 0, 1, 1, 0, 2, 1, 0, 1];
    const comp = [0, 1, 1, 2, 1, 0, 1, 1, 0, 1, 2, 0];
    expect(permutationTwoSidedP(base, comp, masks)).toBeGreaterThan(0.2);
  });

  it('finds a clean separation, down to the resolution of the mask count', function () {
    const base = new Array<number>(12).fill(1);
    const comp = new Array<number>(12).fill(9);
    // Zero spread within each group, so the only relabellings that are at least
    // as extreme are the observed one and its exact complement -- and 999 draws
    // from the 2704156 possible splits will not hit the complement. So the floor
    // of 1 / (999 + 1).
    expect(permutationTwoSidedP(base, comp, masks)).toBeCloseTo(1 / 1000, 12);
  });

  it('never returns zero', function () {
    const base = new Array<number>(12).fill(0);
    const comp = new Array<number>(12).fill(1000);
    expect(permutationTwoSidedP(base, comp, masks)).toBeGreaterThan(0);
  });

  it('is invariant under a common rescale, exactly', function () {
    // The property the geomean-normalised global view depends on: scaling both
    // sides by one constant must not move the p-value at all.
    const base = [1, 0, 2, 1, 0, 1, 1, 0, 2, 1, 0, 1];
    const comp = [0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0];
    const plain = permutationTwoSidedP(base, comp, masks);
    for (const scale of [0.5, 2.5121, 1e-3]) {
      expect(
        permutationTwoSidedP(
          base.map((v) => v * scale),
          comp.map((v) => v * scale),
          masks
        )
      ).toBe(plain);
    }
  });

  it('stays valid for sparse buckets, where the t approximation does not', function () {
    // Zero in most iterations, which is the common case for a single function's
    // per-iteration weight. Both sides come from the same process, so a correct
    // test should not flag it.
    const base = new Array<number>(12).fill(0);
    const comp = new Array<number>(12).fill(0);
    base[3] = 5;
    base[9] = 4;
    comp[1] = 6;
    comp[7] = 3;
    const p = permutationTwoSidedP(base, comp, masks);
    expect(p).toBeGreaterThan(0.5);
  });

  it('is calibrated: about 5% of null comparisons land below 0.05', function () {
    // Bernoulli-ish sparse counts, no difference between the groups. The Welch
    // p-value is not trustworthy on data shaped like this; the permutation one
    // should be.
    let seed = 12345;
    const nextRandom = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const sharedMasks = makePermutationBaseIndices(20, 20, 499, 3);
    let below = 0;
    const trials = 400;
    for (let trial = 0; trial < trials; trial++) {
      const draw = () =>
        Array.from({ length: 20 }, () => (nextRandom() < 0.25 ? 1 : 0));
      if (permutationTwoSidedP(draw(), draw(), sharedMasks) <= 0.05) {
        below++;
      }
    }
    // Heavily discrete data makes an exact 5% unattainable (the achievable
    // p-values are coarse), so a permutation test is conservative here. What
    // must hold is that it is not *anti*-conservative.
    expect(below / trials).toBeLessThan(0.06);
  });
});
