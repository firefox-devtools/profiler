/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeFamilyCorrection,
  interpretStandardizedEffect,
  makePermutationBaseIndices,
  minimumDetectableEffect,
  permutationTwoSidedP,
  standardizedMeanDifference,
  studentTCritical,
  studentTTwoSidedP,
  welchTTest,
} from '../../profile-logic/benchmark/perf-compare-stats';
import type { FamilyMember } from '../../profile-logic/benchmark/perf-compare-stats';

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

describe('computeFamilyCorrection', function () {
  const ITERATIONS = 20;

  /** Seeded, so every family below is the same one on every run. */
  function makeRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  /** Per-iteration weights shaped like a real bucket's: small counts, zero in
   * most iterations. `shift` adds a constant, i.e. a real change. */
  function drawBucket(random: () => number, shift: number = 0): number[] {
    return Array.from({ length: ITERATIONS }, () => {
      let v = shift;
      if (random() < 0.3) {
        v += 1;
      }
      if (random() < 0.1) {
        v += 1;
      }
      return v;
    });
  }

  function nullFamily(seed: number, size: number): FamilyMember[] {
    const random = makeRandom(seed);
    return Array.from({ length: size }, () => ({
      base: drawBucket(random),
      comp: drawBucket(random),
    }));
  }

  const permutations = makePermutationBaseIndices(
    ITERATIONS,
    ITERATIONS,
    999,
    11
  );

  function countAtOrBelow(values: Float64Array, threshold: number): number {
    let count = 0;
    for (const v of values) {
      if (v <= threshold) {
        count++;
      }
    }
    return count;
  }

  it('agrees with a direct transcription of the definitions', function () {
    // The fast path earns its speed with a sparse inner loop, a histogram of
    // "how many thresholds did this null value clear", and a suffix sum — none
    // of which can be checked by reading it. This pins it against the formulas
    // written out literally, with no data structures at all.
    //
    // Run over two shapes of data, because they exercise different halves of it.
    // Continuous weights give well-separated |t| values, so the histogram and the
    // suffix sum are checked without floating-point noise anywhere near a
    // threshold. Small integers -- what real bucket weights are -- make many
    // buckets land on exactly the same |t|, which is the only thing that
    // exercises the tie handling in the rejection count.
    const random = makeRandom(31415);
    const n = 10;
    const continuous: FamilyMember[] = Array.from({ length: 25 }, () => ({
      base: Array.from({ length: n }, random),
      comp: Array.from({ length: n }, random),
    }));
    const discrete: FamilyMember[] = Array.from({ length: 25 }, () => ({
      base: Array.from({ length: n }, () => (random() < 0.4 ? 1 : 0)),
      comp: Array.from({ length: n }, () => (random() < 0.4 ? 1 : 0)),
    }));
    // A third shape, with an unrealistically small number of iterations on
    // purpose: four per side is only 70 distinct relabellings, so 99 draws are
    // certain to include the observed labelling itself and its mirror image,
    // both of which reproduce the observed |t| exactly. That is the only way to
    // get a null value that ties with a threshold rather than merely coming
    // close, which is what separates "at least as extreme" from "more extreme"
    // -- the difference between a valid permutation p-value and one that is
    // slightly too eager.
    const tiny = Array.from({ length: 8 }, () => ({
      base: Array.from({ length: 4 }, random),
      comp: Array.from({ length: 4 }, random),
    }));

    const draws = makePermutationBaseIndices(n, n, 99, 5);
    const cases = [
      { shape: 'continuous', family: continuous, draws },
      { shape: 'discrete', family: discrete, draws },
      {
        shape: 'tiny',
        family: tiny,
        draws: makePermutationBaseIndices(4, 4, 99, 5),
      },
    ];
    for (const { shape, family, draws: familyDraws } of cases) {
      const { actual, expected } = againstDefinitions(family, familyDraws);
      // The shape rides along in the compared value so a failure says which of
      // the three it was.
      expect({ shape, ...actual }).toEqual({
        shape,
        q: expected.q.map((v) => expect.closeTo(v, 12)),
        familyWiseP: expected.familyWiseP.map((v) => expect.closeTo(v, 12)),
        criticalAbsT: expect.closeTo(expected.criticalAbsT, 12),
      });
    }
  });

  function againstDefinitions(family: FamilyMember[], draws: Int32Array[]) {
    const fast = computeFamilyCorrection(family, draws);
    if (fast === null) {
      throw new Error('expected a correction');
    }

    const absTOf = (m: FamilyMember) => Math.abs(welchTTest(m.base, m.comp).t);
    const observed = family.map(absTOf);

    // Every null value, the slow and obvious way: relabel by building the two
    // groups explicitly, then take Welch's |t| of them.
    const nulls: number[] = [];
    for (const baseIndices of draws) {
      const inBase = new Set(baseIndices);
      for (const { base, comp } of family) {
        const pooled = [...Array.from(base), ...Array.from(comp)];
        nulls.push(
          absTOf({
            base: pooled.filter((_, i) => inBase.has(i)),
            comp: pooled.filter((_, i) => !inBase.has(i)),
          })
        );
      }
    }

    // FDR(c) = V̂(c) / R(c) at each observed value, then q as the best FDR at any
    // threshold that still rejects the member.
    const fdrAt = (c: number) => {
      const rejected = observed.filter((t) => t >= c).length;
      const falsePositives = nulls.filter((v) => v * (1 + 1e-9) >= c).length;
      return Math.min(1, (falsePositives + 1) / (draws.length + 1) / rejected);
    };
    const expectedQ = observed.map((t) =>
      Math.min(...observed.filter((c) => c <= t).map(fdrAt))
    );
    const expectedFwer = observed.map((t) => {
      const reached = draws.filter(
        (_, d) =>
          Math.max(...nulls.slice(d * family.length, (d + 1) * family.length)) *
            (1 + 1e-9) >=
          t
      ).length;
      return (1 + reached) / (draws.length + 1);
    });

    // The bar, from what it is defined to mean rather than from a quantile
    // index: the smallest value a member could take and still be inside the
    // family-wise rate.
    const perDrawMax = draws.map((_, d) =>
      Math.max(...nulls.slice(d * family.length, (d + 1) * family.length))
    );
    const rateAt = (c: number) =>
      (1 + perDrawMax.filter((v) => v * (1 + 1e-9) >= c).length) /
      (draws.length + 1);
    const expectedCritical = Math.min(
      ...perDrawMax.filter((c) => rateAt(c) <= 0.05)
    );

    return {
      actual: {
        q: Array.from(fast.qValues),
        familyWiseP: Array.from(fast.familyWisePValues),
        criticalAbsT: fast.criticalAbsT,
      },
      expected: {
        q: expectedQ,
        familyWiseP: expectedFwer,
        criticalAbsT: expectedCritical,
      },
    };
  }

  it('counts a relabelling that ties with the observation as reaching it', function () {
    // "At least as extreme", not "more extreme". The difference only shows up
    // when a relabelling reproduces the observed statistic exactly, so build that
    // case by hand rather than hoping for it: the first draw below *is* the
    // observed labelling, so its |t| ties with the observation to the last bit.
    // Counting it makes pFWER 2/(draws+1); not counting it would make it
    // 1/(draws+1), which claims the observation was never matched when it was.
    const observedLabelling = new Int32Array([0, 1, 2, 3]);
    const mixed = [
      new Int32Array([0, 1, 2, 4]),
      new Int32Array([0, 4, 5, 6]),
      new Int32Array([1, 3, 5, 7]),
    ];
    const correction = computeFamilyCorrection(
      [{ base: [1, 2, 1, 2], comp: [8, 9, 8, 9] }],
      [observedLabelling, ...mixed]
    );
    if (correction === null) {
      throw new Error('expected a correction');
    }
    expect(correction.familyWisePValues[0]).toBeCloseTo(2 / 5, 12);
    expect(correction.qValues[0]).toBeCloseTo(2 / 5, 12);
  });

  it('agrees with itself about where the family-wise bar sits', function () {
    // criticalAbsT is what the corrected MDE is built from, and pFWER is what the
    // tooltips quote, so the two have to be the same statement: reaching the bar
    // and clearing the rate are one condition, not two. An off-by-one in the
    // quantile would leave a member sitting exactly on the bar reading 0.051.
    const random = makeRandom(777);
    const family = nullFamily(777, 200);
    for (let i = 0; i < 6; i++) {
      family.push({ base: drawBucket(random), comp: drawBucket(random, 1) });
    }
    const correction = computeFamilyCorrection(family, permutations, 0.05);
    if (correction === null) {
      throw new Error('expected a correction');
    }
    const reachesBar = Array.from(correction.absT).map(
      (t) => t >= correction.criticalAbsT
    );
    const clearsRate = Array.from(correction.familyWisePValues).map(
      (p) => p <= 0.05
    );
    expect(reachesBar).toEqual(clearsRate);
    // Not vacuous in either direction.
    expect(reachesBar).toContain(true);
    expect(reachesBar).toContain(false);
  });

  it('reports no discoveries on families where nothing changed', function () {
    // When every hypothesis is null the false discovery rate coincides with the
    // family-wise one, so q ≤ 0.05 should turn up nothing in the great majority
    // of families. Five independent ones; the expected total is under 0.25.
    let discoveries = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const correction = computeFamilyCorrection(
        nullFamily(seed * 7919, 300),
        permutations
      );
      if (correction === null) {
        throw new Error('expected a correction');
      }
      discoveries += countAtOrBelow(correction.qValues, 0.05);
    }
    expect(discoveries).toBe(0);
  });

  it('still finds real changes buried in a family of nulls', function () {
    const random = makeRandom(4242);
    const family: FamilyMember[] = [];
    for (let i = 0; i < 300; i++) {
      family.push({ base: drawBucket(random), comp: drawBucket(random) });
    }
    // Five buckets that really did move, at the end so their indices are known.
    for (let i = 0; i < 5; i++) {
      family.push({ base: drawBucket(random), comp: drawBucket(random, 2) });
    }
    const correction = computeFamilyCorrection(family, permutations);
    if (correction === null) {
      throw new Error('expected a correction');
    }
    for (let i = 300; i < 305; i++) {
      expect(correction.qValues[i]).toBeLessThanOrEqual(0.05);
      expect(correction.familyWisePValues[i]).toBeLessThanOrEqual(0.05);
    }
    // And it did not drag the nulls along with them.
    expect(countAtOrBelow(correction.qValues.slice(0, 300), 0.05)).toBe(0);
  });

  it('charges a bucket for the company it keeps', function () {
    // The same comparison, once on its own and once among 400 buckets that did
    // nothing. Being one of 400 is the entire thing a correction is for, and a
    // moderate mover is what shows it: an overwhelming one sits at the floor of
    // 1 / (draws + 1) either way, because no relabelling of anything in the
    // family reaches it.
    const random = makeRandom(99);
    const mover: FamilyMember = {
      base: drawBucket(random),
      comp: drawBucket(random, 0.5),
    };
    const alone = computeFamilyCorrection([mover], permutations);
    const crowded = computeFamilyCorrection(
      [mover, ...nullFamily(31337, 400)],
      permutations
    );
    if (alone === null || crowded === null) {
      throw new Error('expected a correction');
    }
    expect(crowded.absT[0]).toBeCloseTo(alone.absT[0], 12);
    expect(alone.qValues[0]).toBeLessThanOrEqual(0.05);
    expect(crowded.qValues[0]).toBeGreaterThan(alone.qValues[0]);
  });

  it('never gives a larger q to a more extreme bucket', function () {
    const correction = computeFamilyCorrection(
      nullFamily(2024, 200),
      permutations
    );
    if (correction === null) {
      throw new Error('expected a correction');
    }
    const order = Array.from(correction.absT.keys()).sort(
      (a, b) => correction.absT[a] - correction.absT[b]
    );
    let previous = Infinity;
    for (const i of order) {
      expect(correction.qValues[i]).toBeLessThanOrEqual(previous);
      previous = correction.qValues[i];
    }
  });

  it('is invariant under a common rescale where the invariance matters', function () {
    // The geomean-normalised global view multiplies every bucket by a shared
    // constant, and must not thereby change anyone's verdict. Unlike
    // permutationTwoSidedP, this cannot be exact everywhere: a q-value compares
    // one bucket's |t| against *other* buckets' null values, and rescaling moves
    // every |t| by an ULP or so. The relative tolerance in the exceedance count
    // absorbs that where the values are spread out, which is everywhere that
    // matters; where hundreds of nulls are packed shoulder to shoulder it still
    // moves q by a couple of hundredths, but that is the flat part of the curve,
    // at q around 0.8, where nothing is being claimed.
    const random = makeRandom(555);
    const family: FamilyMember[] = nullFamily(555, 100);
    for (let i = 0; i < 3; i++) {
      family.push({ base: drawBucket(random), comp: drawBucket(random, 1) });
    }
    const scale = 2.5121;
    const plain = computeFamilyCorrection(family, permutations);
    const scaled = computeFamilyCorrection(
      family.map(({ base, comp }) => ({
        base: Array.from(base, (v) => v * scale),
        comp: Array.from(comp, (v) => v * scale),
      })),
      permutations
    );
    if (plain === null || scaled === null) {
      throw new Error('expected a correction');
    }
    const discoveries = (c: typeof plain) =>
      Array.from(c.qValues.keys()).filter((i) => c.qValues[i] <= 0.05);
    expect(discoveries(scaled)).toEqual(discoveries(plain));
    expect(discoveries(plain)).toEqual([100, 101, 102]);

    // Compared as whole lists, restricted to the region where exactness is
    // attainable, so that a single reshuffled tie shows up as a diff.
    const claimed = Array.from(plain.qValues.keys()).filter(
      (i) => plain.qValues[i] <= 0.1
    );
    expect(claimed.length).toBeGreaterThanOrEqual(3);
    const pick = (from: Float64Array) => claimed.map((i) => from[i]);
    expect(pick(scaled.qValues)).toEqual(pick(plain.qValues));
    expect(pick(scaled.familyWisePValues)).toEqual(
      pick(plain.familyWisePValues)
    );
    for (let i = 0; i < family.length; i++) {
      expect(scaled.absT[i]).toBeCloseTo(plain.absT[i], 9);
    }
  });

  it('gives an appeared bucket the best q the draw count can support', function () {
    // Zero on one side in every iteration and nonzero in every one on the other:
    // |t| is infinite, and no relabelling of a mixed pool reproduces that. The
    // floor of 1 / (draws + 1) is as far as a permutation can go.
    const appeared: FamilyMember = {
      base: new Array<number>(ITERATIONS).fill(0),
      comp: new Array<number>(ITERATIONS).fill(3),
    };
    const correction = computeFamilyCorrection(
      [appeared, ...nullFamily(8080, 100)],
      permutations
    );
    if (correction === null) {
      throw new Error('expected a correction');
    }
    expect(correction.absT[0]).toBe(Infinity);
    expect(correction.qValues[0]).toBeCloseTo(1 / 1000, 12);
    expect(correction.familyWisePValues[0]).toBeCloseTo(1 / 1000, 12);
  });

  it('matches the observed |t| that welchTTest computes', function () {
    const family = nullFamily(606, 40);
    const correction = computeFamilyCorrection(family, permutations);
    if (correction === null) {
      throw new Error('expected a correction');
    }
    for (let i = 0; i < family.length; i++) {
      const { base, comp } = family[i];
      expect(correction.absT[i]).toBeCloseTo(
        Math.abs(welchTTest(base, comp).t),
        9
      );
    }
  });

  it('declines to correct a family it cannot calibrate', function () {
    expect(computeFamilyCorrection([], permutations)).toBe(null);
    expect(computeFamilyCorrection(nullFamily(1, 3), [])).toBe(null);
    // Members disagreeing about how many iterations there were means they are
    // not the same iterations, and a joint relabelling is meaningless.
    expect(
      computeFamilyCorrection(
        [
          { base: [1, 0, 1, 0], comp: [0, 1, 0, 1] },
          { base: [1, 0, 1], comp: [0, 1, 0] },
        ],
        makePermutationBaseIndices(4, 4, 99, 1)
      )
    ).toBe(null);
  });
});
