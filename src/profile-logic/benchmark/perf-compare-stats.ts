// Statistics for comparing performance samples.
//
// Welch's t:       Welch (1947), Biometrika 34(1-2):28-35
// Permutation:     Fisher (1935); Ernst (2004), Statistical Science 19(4):676-685
// Incomplete beta: Press et al., Numerical Recipes 3rd ed. §6.4
// FDR and FWER:    see the header on computeFamilyCorrection
//
// Everything here is on the path from two sets of per-iteration weights to the
// numbers a comparison row shows, and nothing here is kept for a caller that
// might want it one day. A Shapiro-Wilk test, a bootstrap CI for the median
// difference, Cohen's d, and a bitmask-DP matcher for distribution modes all used
// to live here, unreferenced by anything but their own tests, from a version of
// this view that reported them; they are in the history if they are ever wanted
// back.
//
// The benchmark comparison used to use Mann-Whitney U and Cliff's delta. Those
// were removed rather than left available, because they are actively wrong for
// this data and their failure is silent: per-iteration bucket weights are small
// integers, so base and new tie on 13-44% of all pairs in a real Speedometer
// profile, and a rank statistic on such data is dominated by how ties are
// handled rather than by the difference being measured. See
// docs-developer/benchmark-auto-bucketing.md §3.1.

import { runToCompletion } from './chunked-work';
import type { SlicedWork } from './chunked-work';

// ---------------------------------------------------------------------------
// Student's t distribution
// ---------------------------------------------------------------------------

function logGamma(x: number): number {
  // Lanczos approximation, g = 7, n = 9.
  const c = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection, so the series is only ever evaluated for x >= 0.5.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < c.length; i++) {
    a += c[i] / (z + i + 1);
  }
  const t = z + 7.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

/** Continued fraction for the incomplete beta function (Lentz's method). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 3e-16;
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) {
    d = TINY;
  }
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) {
      d = TINY;
    }
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) {
      c = TINY;
    }
    d = 1 / d;
    h *= d * c;
    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) {
      d = TINY;
    }
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) {
      c = TINY;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) {
      break;
    }
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  const front =
    logGamma(a + b) -
    logGamma(a) -
    logGamma(b) +
    a * Math.log(x) +
    b * Math.log1p(-x);
  // Converges quickly only on one side of the mean; use the symmetry relation
  // I_x(a,b) = 1 - I_{1-x}(b,a) for the other.
  if (x < (a + 1) / (a + b + 2)) {
    return (Math.exp(front) * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (Math.exp(front) * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a t statistic with `df` degrees of freedom. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (df <= 0 || Number.isNaN(t)) {
    return 1;
  }
  if (!isFinite(t)) {
    return 0;
  }
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

/** |t| at which `studentTTwoSidedP` equals `alpha`. Bisection: this is called
 * once per bucket, not in any inner loop. */
export function studentTCritical(df: number, alpha: number = 0.05): number {
  if (df <= 0) {
    return Infinity;
  }
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (studentTTwoSidedP(mid, df) > alpha) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Welch's t test on the mean difference
// ---------------------------------------------------------------------------

export type WelchResult = {
  meanBase: number;
  meanNew: number;
  /** newMean - baseMean. The quantity that adds up across a bucket partition,
   * which is why the whole comparison is built on it. */
  delta: number;
  /** Standard error of `delta`. */
  se: number;
  /** delta / se. Infinite when the spread is zero but the means differ, which
   * is what an "appeared" or "disappeared" bucket looks like; zero when there is
   * no difference to measure at all. */
  t: number;
  /** Welch-Satterthwaite degrees of freedom. */
  df: number;
};

export function welchTTest(
  base: ArrayLike<number>,
  comp: ArrayLike<number>
): WelchResult {
  const n1 = base.length;
  const n2 = comp.length;
  const meanBase = arrayMean(base);
  const meanNew = arrayMean(comp);
  const varBase = sampleVariance(base, meanBase);
  const varNew = sampleVariance(comp, meanNew);
  const seSquaredBase = n1 > 0 ? varBase / n1 : 0;
  const seSquaredNew = n2 > 0 ? varNew / n2 : 0;
  const se = Math.sqrt(seSquaredBase + seSquaredNew);
  const delta = meanNew - meanBase;
  const denominator =
    (n1 > 1 ? (seSquaredBase * seSquaredBase) / (n1 - 1) : 0) +
    (n2 > 1 ? (seSquaredNew * seSquaredNew) / (n2 - 1) : 0);
  const df =
    denominator > 0
      ? (seSquaredBase + seSquaredNew) ** 2 / denominator
      : Math.max(0, n1 + n2 - 2);
  return {
    meanBase,
    meanNew,
    delta,
    se,
    t: tStatistic(delta, se),
    df,
  };
}

/**
 * delta / se, with the degenerate case spelled out: zero spread on both sides
 * and different means is a perfect separation, so |t| is infinite rather than
 * zero. Returning zero there would report an appeared-or-disappeared bucket -
 * base weight 0 in every iteration, new weight 1 in every iteration - as no
 * change at all.
 */
function tStatistic(delta: number, se: number): number {
  if (se > 0) {
    return delta / se;
  }
  if (delta === 0) {
    return 0;
  }
  return delta > 0 ? Infinity : -Infinity;
}

function arrayMean(a: ArrayLike<number>): number {
  const n = a.length;
  if (n === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += a[i];
  }
  return sum / n;
}

function sampleVariance(a: ArrayLike<number>, mean: number): number {
  const n = a.length;
  if (n < 2) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (a[i] - mean) ** 2;
  }
  return sum / (n - 1);
}

/**
 * Smallest |delta| this bucket could have shown and still been called
 * significant at `alpha`. Reporting it turns "no significant change" from a
 * non-answer into a quantitative one: a null result next to a small MDE means
 * the bucket really did not move, while a null result next to a large MDE means
 * the measurement could not resolve it.
 */
export function minimumDetectableEffect(
  // Only the spread and the degrees of freedom, so that a caller holding a
  // finished comparison row can re-derive this at a corrected alpha without
  // having to keep the whole WelchResult around. `WelchResult` satisfies it.
  spread: { se: number; df: number },
  alpha: number = 0.05
): number {
  return studentTCritical(spread.df, alpha) * spread.se;
}

// ---------------------------------------------------------------------------
// Permutation test
// ---------------------------------------------------------------------------

/** Deterministic PRNG, so the same profile pair always yields the same
 * p-values. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Group relabellings for a permutation test, generated once and reused for every
 * bucket. Each entry lists the pooled indices assigned to the base group.
 *
 * Reusing one set across buckets is not just a saving: it means every bucket is
 * judged against the same relabellings, so their p-values are comparable and the
 * correlation between buckets (they are the same iterations) is preserved.
 *
 * Index lists rather than 0/1 masks because the inner loop then touches nBase
 * entries instead of nBase + nNew, and the other group's sums come from
 * subtracting these from the totals.
 */
export function makePermutationBaseIndices(
  nBase: number,
  nNew: number,
  count: number,
  seed: number = 0x5eed
): Int32Array[] {
  const rng = mulberry32(seed);
  const total = nBase + nNew;
  const permutations: Int32Array[] = [];
  const order = new Int32Array(total);
  for (let p = 0; p < count; p++) {
    for (let i = 0; i < total; i++) {
      order[i] = i;
    }
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    permutations.push(order.slice(0, nBase));
  }
  return permutations;
}

/**
 * |t| for one relabelling, from the base group's sums and the pooled totals.
 *
 * **Why this is not `welchTTest`.** That takes two passes over each group: a mean,
 * then the squared deviations from it, which is the numerically better way round
 * and the right choice for the number a row *reports*. This takes one pass over
 * the base group only, and gets the other group by subtraction — which is what
 * makes `memberCount × drawCount` of them affordable at all, 13.6 million for the
 * global view of a Speedometer pair. The price is the computational formula's
 * cancellation: `Σx² − n·mean²` is a difference of similar magnitudes, so it loses
 * a few of the last digits and can come out very slightly negative where the true
 * variance is zero, hence the clamp.
 *
 * So a relabelling's |t| and `welchTTest`'s agree to about nine digits rather than
 * exactly, which is fine — every threshold either value is compared against is
 * widened by `COMPARISON_TOLERANCE`, which is three orders of magnitude wider than
 * the disagreement. What is *not* fine is two copies of this arithmetic drifting
 * apart, so both callers accumulate their sums however suits their data layout and
 * then come here: the permutation test walks a dense pooled array with an index
 * list, the family pass walks one member's nonzeros with a mask.
 */
function absTFromGroupSums(
  sumBase: number,
  sumSquaresBase: number,
  totalSum: number,
  totalSumSquares: number,
  nBase: number,
  nNew: number
): number {
  const meanBase = sumBase / nBase;
  const meanNew = (totalSum - sumBase) / nNew;
  const ssBase = Math.max(0, sumSquaresBase - nBase * meanBase * meanBase);
  const ssNew = Math.max(
    0,
    totalSumSquares - sumSquaresBase - nNew * meanNew * meanNew
  );
  const se = Math.sqrt(
    (nBase > 1 ? ssBase / (nBase - 1) / nBase : 0) +
      (nNew > 1 ? ssNew / (nNew - 1) / nNew : 0)
  );
  const t = Math.abs(tStatistic(meanNew - meanBase, se));
  // A group of one has no spread to divide by, so `se` is zero and `tStatistic`
  // has already answered; anything still NaN got there through a NaN weight, and
  // reporting it as "not extreme" is the only useful reading of that.
  return Number.isNaN(t) ? 0 : t;
}

/** `absTFromGroupSums` for one relabelling of a dense pooled array. */
function absTForAssignment(
  pooled: Float64Array,
  baseIndices: ArrayLike<number>,
  totalSum: number,
  totalSumSquares: number,
  nBase: number,
  nNew: number
): number {
  let sumBase = 0;
  let sumSquaresBase = 0;
  for (let k = 0; k < nBase; k++) {
    const v = pooled[baseIndices[k]];
    sumBase += v;
    sumSquaresBase += v * v;
  }
  return absTFromGroupSums(
    sumBase,
    sumSquaresBase,
    totalSum,
    totalSumSquares,
    nBase,
    nNew
  );
}

/**
 * Relative slack when asking whether one |t| reaches another.
 *
 * **One convention, everywhere: widen the candidate, never shrink the threshold.**
 * `atLeastAsExtreme` is the boolean form and `lowestReaching` the form a binary
 * search wants, and every "at least as extreme as" comparison in this file goes
 * through one of them.
 *
 * There has to be some slack. |t| is computed through a subtraction of similar
 * magnitudes, so two arithmetically equal values can land an ULP apart, and a
 * relabelling that is numerically the observed labelling has to count as at least
 * as extreme as it rather than fall on the wrong side of a `>=`. There is more at
 * stake in the family pass, where a null value is compared against *other*
 * buckets' thresholds: without the slack, multiplying every bucket by one shared
 * constant — which is exactly what the geomean-normalised global view does — shifts
 * q by a count or two. Erring towards counting an exceedance keeps that on the
 * conservative side.
 *
 * 1e-9 is far above the ~1e-15 the arithmetic can drift and far below any
 * difference between two |t| values that means anything.
 */
const COMPARISON_TOLERANCE = 1e-9;

/** Whether `value` reaches `threshold`, up to `COMPARISON_TOLERANCE`. */
function atLeastAsExtreme(value: number, threshold: number): boolean {
  return widened(value) >= threshold;
}

/** `value` with the tolerance applied, for comparing against many thresholds at
 * once (`countAtOrBelow(sortedThresholds, widened(v))` is how many of them it
 * reaches). */
function widened(value: number): number {
  return value * (1 + COMPARISON_TOLERANCE);
}

/** The smallest value that would reach `threshold`, for the binary searches that
 * need a bound rather than a predicate. `atLeastAsExtreme(v, threshold)` and
 * `v >= lowestReaching(threshold)` are the same question. */
function lowestReaching(threshold: number): number {
  return threshold / (1 + COMPARISON_TOLERANCE);
}

/**
 * Stop drawing relabellings once this many have come out at least as extreme as
 * the observed one. Sequential stopping (Besag & Clifford 1991): a p-value that
 * is obviously not small is established by a few dozen draws, and only the
 * candidates worth reporting need the full set. This is what makes the test
 * affordable over ~14000 buckets — most of them stop after well under a hundred
 * draws instead of running all 1999.
 */
const SEQUENTIAL_STOP_HITS = 20;

/**
 * Two-sided permutation p-value, using |t| as the statistic.
 *
 * Exact in the sense that matters here: it makes no distributional assumption,
 * so it stays valid for the many buckets whose per-iteration weight is zero in
 * most iterations and 1 or 2 in the rest, where a t-distribution p-value is not
 * trustworthy. The statistic is studentised rather than the raw mean difference
 * so that unequal spread between the two profiles does not distort it.
 *
 * Two regimes for the returned value, both valid p-values:
 *  - stopped early after `SEQUENTIAL_STOP_HITS` hits in k draws: hits / k;
 *  - exhausted all relabellings with h hits: (h + 1) / (count + 1), the standard
 *    correction that keeps the result away from exactly zero.
 */
export function permutationTwoSidedP(
  base: ArrayLike<number>,
  comp: ArrayLike<number>,
  permutations: Int32Array[]
): number {
  const nBase = base.length;
  const nNew = comp.length;
  const pooled = new Float64Array(nBase + nNew);
  let totalSum = 0;
  let totalSumSquares = 0;
  for (let i = 0; i < nBase; i++) {
    const v = base[i];
    pooled[i] = v;
    totalSum += v;
    totalSumSquares += v * v;
  }
  for (let i = 0; i < nNew; i++) {
    const v = comp[i];
    pooled[nBase + i] = v;
    totalSum += v;
    totalSumSquares += v * v;
  }

  const observedIndices = new Int32Array(nBase);
  for (let i = 0; i < nBase; i++) {
    observedIndices[i] = i;
  }
  const observed = absTForAssignment(
    pooled,
    observedIndices,
    totalSum,
    totalSumSquares,
    nBase,
    nNew
  );
  // Stays correct when `observed` is Infinity -- an appeared or disappeared
  // bucket: widening leaves it infinite, so only an equally perfect separation
  // clears the bar. See COMPARISON_TOLERANCE.
  let hits = 0;
  for (let p = 0; p < permutations.length; p++) {
    const t = absTForAssignment(
      pooled,
      permutations[p],
      totalSum,
      totalSumSquares,
      nBase,
      nNew
    );
    if (atLeastAsExtreme(t, observed)) {
      hits++;
      if (hits >= SEQUENTIAL_STOP_HITS) {
        return hits / (p + 1);
      }
    }
  }
  return (hits + 1) / (permutations.length + 1);
}

// ---------------------------------------------------------------------------
// Multiple comparisons: FDR and FWER from one joint relabelling of the family
// ---------------------------------------------------------------------------

/**
 * One bucket's two per-iteration weight vectors. Every member of a family must
 * have the same two lengths, since they are the same iterations.
 */
export type FamilyMember = {
  base: ArrayLike<number>;
  comp: ArrayLike<number>;
};

/**
 * One range of draws' contribution to a family correction, before anything a
 * caller asked for has been derived from it.
 *
 * The draws are independent, so this is the unit that lets one family be spread
 * over several threads: `accumulateFamilyPartialInSlices` over a range of draws,
 * once per thread, then `combineFamilyPartials` over the results. Everything
 * accumulated here is separable — see the field comments — which is what makes
 * combining *exact* rather than merely close, and so makes a q-value independent
 * of how many cores the reader has.
 */
export type FamilyPartialCorrection = {
  memberCount: number;
  /** Total draws in the family's relabelling set, not the count in this range.
   * Every quantity read off the null is a fraction of this. */
  drawCount: number;
  /** Iterations per side, as the accumulator validated them. */
  nBase: number;
  nNew: number;
  /** The half-open range of draws this covers. Empty ranges are allowed — a
   * family can be split more ways than it has draws. */
  drawStart: number;
  drawEnd: number;
  /** Observed |t| per member, in input order. Not accumulated at all: it is
   * derived from the family alone, so every range recomputes the identical
   * array rather than having it shipped to it. `combineFamilyPartials` checks
   * that they do agree, since a disagreement would mean the ranges had counted
   * exceedances against different thresholds. */
  absT: Float64Array;
  /** Histogram over "how many observed thresholds did this null value clear",
   * summed over every member of every draw in this range. Length
   * `memberCount + 1`. Integer counts, so ranges add elementwise, exactly. */
  nullsClearing: Float64Array;
  /** Per member, how many of this range's draws reached its own observation.
   * Integer counts again, and again added elementwise. */
  ownHits: Float64Array;
  /** Largest |t| anywhere in the family, per draw — so each range writes only
   * the `[drawStart, drawEnd)` slice, and zero elsewhere. */
  maxima: Float64Array;
};

export type FamilyCorrection = {
  /** Observed |t| per member, in input order. Recomputed here rather than taken
   * from `welchTTest` so that it comes from exactly the same arithmetic as the
   * null values it is compared against. */
  absT: Float64Array;
  /**
   * Each member's own two-sided permutation p-value, judged against its own
   * relabellings alone and ignoring the rest of the family — "did *this* bucket
   * move", with no multiplicity in it.
   *
   * It comes out of this pass for nothing. The relabellings are already being
   * applied to every member, so counting how many of a member's own null values
   * reach its observed one is one comparison per value that would otherwise cost
   * a whole second pass. Exact for every member, too, which a separate pass could
   * not afford to be: it used to be worth spending relabellings only on the
   * buckets that might change verdict, leaving the rest with a Welch
   * approximation that is not trustworthy on sparse counts.
   */
  pValues: Float64Array;
  /** Estimated false discovery rate at the least stringent |t| threshold that
   * still rejects this member. Monotone: a larger |t| never gets a larger q. */
  qValues: Float64Array;
  /** Westfall-Young single-step FWER-adjusted p-value: the fraction of
   * relabellings whose *largest* |t| anywhere in the family reached this
   * member's observed |t|. */
  familyWisePValues: Float64Array;
  /**
   * The |t| a member has to reach to stand out from a family this size — the bar
   * this particular comparison set turned out to impose, which is what a
   * corrected minimum detectable effect has to be measured against.
   *
   * It is the family-wise bar: the `1 - familyWiseAlpha` quantile of the largest
   * |t| seen anywhere in the family per relabelling. That is the right bar for an
   * MDE even though rows are reported on `qValues`, because an MDE asks what a
   * row would have needed *on its own* — and for a lone row the two bars very
   * nearly coincide. `V̂(c) = E[#exceedances]` and the family-wise rate is
   * `P(#exceedances ≥ 1)`, which agree to first order once exceedances are rare,
   * i.e. exactly where a threshold sits. Where a table does have other
   * discoveries the FDR bar is genuinely lower, so this errs conservative.
   *
   * The alternative — reading the bar off the FDR curve — is not usable: on a
   * comparison with no real changes in it nothing on the observed grid reaches
   * `q ≤ alpha`, so the bar would come out as infinity for every row of exactly
   * the tables an MDE is most needed for.
   */
  criticalAbsT: number;
};

/**
 * Correct a whole family of bucket comparisons for multiplicity, by relabelling
 * the iterations of every bucket *jointly* and reading the null off the family
 * as a whole.
 *
 * ## Why not Benjamini-Hochberg on the per-bucket p-values
 *
 * BH needs the smallest p-value to be under `alpha / n`, which for the ~6800
 * buckets of the global view is 7.4e-6. A permutation p-value from
 * `PERMUTATION_COUNT` relabellings cannot go below 1 / (count + 1) = 5.0e-4, so
 * BH rejects nothing at all — not even a bucket that moved by 73% with a Cohen's
 * d of 1.0. The p-value floor, not the evidence, is the binding constraint.
 *
 * The way out is to stop going through per-bucket p-values. What FDR control
 * actually needs is `E[V(c)]`, the number of *buckets* expected to clear a
 * threshold `c` by chance — a quantity about the family, not about any one
 * bucket. Estimating it pools `memberCount × drawCount` null statistics (13.6
 * million for the global view), so the resolution problem disappears: the floor
 * on the estimate is one null exceedance in the whole pooled set, not one in
 * `drawCount`.
 *
 * ## The estimator
 *
 * With `R(c)` the observed count at or above `c` and `V̂(c)` the mean null count
 * at or above `c` over the relabellings,
 *
 *     FDR(c) = V̂(c) / R(c),   q(bucket) = min over c ≤ |t_bucket| of FDR(c)
 *
 * (Tusher, Tibshirani & Chu 2001, PNAS 98(9):5116-5121 — SAM; Storey & Tibshirani
 * 2003, PNAS 100(16):9440-9445 for the q-value.) `V̂` averages over relabellings
 * rather than assuming a null distribution, and it makes no assumption that the
 * buckets are alike: it estimates `Σ_b P(|t_b| ≥ c)` term by term, which is
 * exactly what `E[V(c)]` is when every bucket is null. Buckets that are *not*
 * null inflate `V̂`, so the estimate errs conservative — the usual `π₀` refinement
 * would sharpen it, but with a handful of real movers among thousands of buckets
 * `π₀` is within a rounding error of 1 and is not worth the extra assumption.
 *
 * ## Dependence
 *
 * The buckets partition the same samples, so they are negatively correlated by
 * construction, and BH's validity condition (positive regression dependence) does
 * not obviously hold. This construction does not need it: the relabelling is
 * applied to all buckets at once, so whatever dependence exists is reproduced in
 * every draw. That is also why `familyWisePValues` is exact under arbitrary
 * dependence (Westfall & Young 1993; the same max-statistic construction as
 * cluster-based permutation inference, Nichols & Holmes 2002).
 *
 * ## The statistic
 *
 * Thresholding a studentised |t| shared across buckets, rather than each bucket's
 * own p-value, means a sparse bucket and a dense one are held to the same bar
 * even though the sparse one has the heavier null tail. That costs the dense
 * buckets a little power; it does not cost validity, because `V̂` counts the
 * sparse buckets' null exceedances too and so prices their heavier tail into the
 * FDR at every threshold.
 *
 * Returns null if the family is empty or its members disagree about how many
 * iterations there were, in which case there is nothing to correct against.
 *
 * This is the whole cost of a bucket table: `drawCount × memberCount` evaluations
 * of `absTForMember`, about a second for the ~3200-member global view of a
 * Speedometer pair. `computeFamilyCorrectionInSlices` is the same computation with
 * a yield point after every draw, for callers that cannot hold the main thread
 * for a second; this one runs it straight through. Both are that one second on one
 * thread — `accumulateFamilyPartialInSlices` plus `combineFamilyPartials` are the
 * same computation again, split so the draws can be shared out over several.
 */
export function computeFamilyCorrection(
  members: ReadonlyArray<FamilyMember>,
  permutations: Int32Array[],
  familyWiseAlpha: number = 0.05
): FamilyCorrection | null {
  return runToCompletion(
    computeFamilyCorrectionInSlices(members, permutations, familyWiseAlpha)
  );
}

/**
 * `computeFamilyCorrection`, interruptible between permutation draws. See there
 * for what this computes and why.
 *
 * Every draw at once, which is one thread's worth of work; the two halves it is
 * written in terms of are what a caller with more than one thread uses.
 */
export function* computeFamilyCorrectionInSlices(
  members: ReadonlyArray<FamilyMember>,
  permutations: Int32Array[],
  familyWiseAlpha: number = 0.05
): SlicedWork<FamilyCorrection | null> {
  const partial = yield* accumulateFamilyPartialInSlices(members, permutations);
  if (partial === null) {
    return null;
  }
  return combineFamilyPartials([partial], familyWiseAlpha);
}

/**
 * Apply the draws in `[drawStart, drawEnd)` to the whole family, and report what
 * they found. `combineFamilyPartials` turns one or more of these into the
 * correction itself.
 *
 * Returns null if the family is empty or its members disagree about how many
 * iterations there were — the cases `computeFamilyCorrection` has nothing to
 * correct against. Deterministic from `(members, permutations)`, so every range
 * over one family reaches the same verdict about that.
 *
 * The draw loop is the only yield point, and it is a fine one: it is where all the
 * time goes, and a single draw is ~0.5ms even for the largest family, so a driver
 * can pace itself to whatever slice it wants. The per-draw work stays in a
 * separate function rather than being written inline here, so that the arithmetic
 * that runs millions of times is in an ordinary function and not in the body of a
 * generator.
 *
 * The set-up before the loop is *not* proportional to the draw range: it is the
 * whole family either way, ~150ms for the global view of a Speedometer pair. So a
 * range is worth splitting off only while the draws it takes with it still cost
 * more than that — see the shard count the worker pool picks.
 */
export function* accumulateFamilyPartialInSlices(
  members: ReadonlyArray<FamilyMember>,
  permutations: Int32Array[],
  drawStart: number = 0,
  drawEnd: number = permutations.length
): SlicedWork<FamilyPartialCorrection | null> {
  const memberCount = members.length;
  const drawCount = permutations.length;
  if (memberCount === 0 || drawCount === 0) {
    return null;
  }
  const nBase = members[0].base.length;
  const nNew = members[0].comp.length;
  if (nBase < 2 || nNew < 2) {
    return null;
  }
  for (const member of members) {
    if (member.base.length !== nBase || member.comp.length !== nNew) {
      return null;
    }
  }
  const total = nBase + nNew;

  // Pooled values in sparse form, all members in three flat arrays. Most buckets
  // are zero in most iterations — a single function accounts for no samples at
  // all in the majority of them — so iterating the nonzeros is what makes
  // memberCount × drawCount evaluations affordable at all. Flat arrays rather
  // than one pair per member because there are thousands of members.
  const offsets = new Int32Array(memberCount + 1);
  for (let m = 0; m < memberCount; m++) {
    const { base, comp } = members[m];
    let count = 0;
    for (let i = 0; i < nBase; i++) {
      if (base[i] !== 0) {
        count++;
      }
    }
    for (let i = 0; i < nNew; i++) {
      if (comp[i] !== 0) {
        count++;
      }
    }
    offsets[m + 1] = offsets[m] + count;
  }
  const pooledIndex = new Int32Array(offsets[memberCount]);
  const pooledValue = new Float64Array(offsets[memberCount]);
  const totalSum = new Float64Array(memberCount);
  const totalSumSquares = new Float64Array(memberCount);
  for (let m = 0; m < memberCount; m++) {
    const { base, comp } = members[m];
    let o = offsets[m];
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < nBase; i++) {
      const v = base[i];
      if (v !== 0) {
        pooledIndex[o] = i;
        pooledValue[o] = v;
        o++;
        sum += v;
        sumSquares += v * v;
      }
    }
    for (let i = 0; i < nNew; i++) {
      const v = comp[i];
      if (v !== 0) {
        pooledIndex[o] = nBase + i;
        pooledValue[o] = v;
        o++;
        sum += v;
        sumSquares += v * v;
      }
    }
    totalSum[m] = sum;
    totalSumSquares[m] = sumSquares;
  }

  // Which pooled positions the current relabelling assigns to the base group.
  // A mask rather than an index list, because the sparse inner loop walks the
  // bucket's nonzeros and asks which side each one landed on.
  const inBase = new Uint8Array(total);
  // One member's |t| under the current relabelling: walk its nonzeros, ask which
  // side each landed on, and let absTFromGroupSums do the statistic.
  const absTForMember = (m: number): number => {
    let sumBase = 0;
    let sumSquaresBase = 0;
    const end = offsets[m + 1];
    for (let o = offsets[m]; o < end; o++) {
      if (inBase[pooledIndex[o]] === 1) {
        const v = pooledValue[o];
        sumBase += v;
        sumSquaresBase += v * v;
      }
    }
    return absTFromGroupSums(
      sumBase,
      sumSquaresBase,
      totalSum[m],
      totalSumSquares[m],
      nBase,
      nNew
    );
  };

  const absT = new Float64Array(memberCount);
  for (let i = 0; i < nBase; i++) {
    inBase[i] = 1;
  }
  for (let m = 0; m < memberCount; m++) {
    absT[m] = absTForMember(m);
  }
  // Ascending, so index i is also the count of members strictly below it.
  // Infinity — a bucket that appeared or disappeared outright — sorts last,
  // which is where it belongs.
  const ascending = absT.slice().sort();

  // For each null value, the number of observed thresholds it clears; summed
  // into a histogram over that count so the pooled null never has to be stored.
  // See COMPARISON_TOLERANCE for why the null value is widened before it is asked.
  const nullsClearing = new Float64Array(memberCount + 1);
  const maxima = new Float64Array(drawCount);
  // How often each member's own relabellings reached its own observation. The
  // per-member p-value, for one comparison per null value.
  const ownHits = new Float64Array(memberCount);
  const accumulateDraw = (p: number) => {
    inBase.fill(0);
    const indices = permutations[p];
    for (let k = 0; k < indices.length; k++) {
      inBase[indices[k]] = 1;
    }
    let max = 0;
    for (let m = 0; m < memberCount; m++) {
      const v = absTForMember(m);
      if (v > max) {
        max = v;
      }
      const reach = widened(v);
      if (reach >= absT[m]) {
        ownHits[m]++;
      }
      nullsClearing[countAtOrBelow(ascending, reach)]++;
    }
    maxima[p] = max;
  };
  for (let p = drawStart; p < drawEnd; p++) {
    accumulateDraw(p);
    yield;
  }

  return {
    memberCount,
    drawCount,
    nBase,
    nNew,
    drawStart,
    drawEnd,
    absT,
    nullsClearing,
    ownHits,
    maxima,
  };
}

/**
 * Derive the correction from one or more draw ranges over the same family.
 *
 * **The result does not depend on how the draws were divided up, and that is a
 * requirement rather than a nicety.** The q-values are load-bearing — they decide
 * which rows the report shows — so a reader on a laptop and a reader on a
 * workstation have to be given the same answers about the same two profiles. Two
 * facts make the combination exact rather than approximate: `nullsClearing` and
 * `ownHits` are integer counts, at most `memberCount × drawCount` and so far
 * inside float64's exactly-representable range, which makes summing them
 * order-independent; and `absT` is recomputed from the same members by every
 * range, so the thresholds those counts were taken against are bit-identical.
 * `maxima` needs neither argument, since the ranges are disjoint and each writes
 * only its own slice.
 *
 * The invariants that would break that are checked rather than assumed: the ranges
 * have to tile `[0, drawCount)` exactly once, and the ranges' `absT` have to
 * agree. Both are cheap next to the accumulation, and getting either wrong would
 * otherwise be a wrong number that still looks like a number.
 */
export function combineFamilyPartials(
  partials: ReadonlyArray<FamilyPartialCorrection>,
  familyWiseAlpha: number = 0.05
): FamilyCorrection | null {
  if (partials.length === 0) {
    return null;
  }
  const { memberCount, drawCount, absT } = partials[0];

  const nullsClearing = new Float64Array(memberCount + 1);
  const ownHits = new Float64Array(memberCount);
  const maxima = new Float64Array(drawCount);
  for (const partial of partials) {
    checkPartialAgrees(partial, partials[0]);
    for (let i = 0; i <= memberCount; i++) {
      nullsClearing[i] += partial.nullsClearing[i];
    }
    for (let m = 0; m < memberCount; m++) {
      ownHits[m] += partial.ownHits[m];
    }
    for (let p = partial.drawStart; p < partial.drawEnd; p++) {
      maxima[p] = partial.maxima[p];
    }
  }
  checkDrawRangesTile(partials, drawCount);

  // The same thresholds the ranges counted against, in the same order, since
  // they are just the sorted `absT` every range agreed on. Infinity — a bucket
  // that appeared or disappeared outright — sorts last, which is where it belongs.
  const ascending = absT.slice().sort();

  // ## What an index means from here down
  //
  // Everything below is indexed by position in `ascending`, and one reading holds
  // throughout: **index `i` is the threshold `ascending[i]`, the one that rejects
  // exactly the `memberCount - i` members at or above it.** So, for that i:
  //
  //   - `i` is itself the number of members strictly below the threshold, which is
  //     why `countBelow(ascending, t)` is the index to look a member's own q up at;
  //   - `memberCount - i` is the rejection count `R(c)` the FDR divides by;
  //   - `nullsClearing[k]` is over a *different* range, 0 to memberCount
  //     inclusive: it counts null values by how many thresholds they cleared, and
  //     a null value above every threshold clears all `memberCount` of them, hence
  //     the extra slot;
  //   - so the null values reaching threshold `i` are those that cleared more than
  //     `i` thresholds, i.e. the suffix `nullsClearing[i + 1 ..]`, which is what
  //     `nullExceeding[i]` below sums.
  //
  // The two ranges being one apart is the whole of the fiddliness, and it is why
  // ranges of draws can be added elementwise before any of this runs: a shard's
  // `nullsClearing` is a histogram over the same thresholds, since the thresholds
  // come from `absT` and every shard computes the same `absT`.
  const nullExceeding = new Float64Array(memberCount);
  let running = 0;
  for (let i = memberCount - 1; i >= 0; i--) {
    running += nullsClearing[i + 1];
    nullExceeding[i] = running;
  }

  // FDR at each distinct threshold. Ties share one threshold, so they must also
  // share one rejection count — the one for the whole tied group.
  const fdrAtThreshold = new Float64Array(memberCount);
  for (let i = 0; i < memberCount;) {
    let last = i;
    while (last + 1 < memberCount && ascending[last + 1] === ascending[i]) {
      last++;
    }
    // (+1) / (drawCount + 1) for the same reason permutationTwoSidedP uses it:
    // no finite number of relabellings can establish that a threshold is never
    // cleared by chance, so the smallest reportable q is 1 / (drawCount + 1).
    const expectedFalse = (nullExceeding[i] + 1) / (drawCount + 1);
    const value = Math.min(1, expectedFalse / (memberCount - i));
    for (let k = i; k <= last; k++) {
      fdrAtThreshold[k] = value;
    }
    i = last + 1;
  }

  // q is the best FDR available at any threshold that still rejects the member,
  // which also makes it monotone in |t| — the estimate itself need not be.
  let best = 1;
  for (let i = 0; i < memberCount; i++) {
    if (fdrAtThreshold[i] < best) {
      best = fdrAtThreshold[i];
    }
    fdrAtThreshold[i] = best;
  }

  maxima.sort();
  const pValues = new Float64Array(memberCount);
  const qValues = new Float64Array(memberCount);
  const familyWisePValues = new Float64Array(memberCount);
  for (let m = 0; m < memberCount; m++) {
    const t = absT[m];
    // The same (hits + 1) / (draws + 1) as permutationTwoSidedP: no finite set of
    // relabellings can show that an observation is never matched by chance.
    pValues[m] = (ownHits[m] + 1) / (drawCount + 1);
    qValues[m] = fdrAtThreshold[countBelow(ascending, t)];
    familyWisePValues[m] =
      (1 + drawCount - countBelow(maxima, lowestReaching(t))) / (drawCount + 1);
  }

  // The smallest |t| whose family-wise rate is within `familyWiseAlpha`, so that
  // "|t| ≥ criticalAbsT" and "pFWER ≤ alpha" are the same statement.
  //
  // Solving one for the other: a member at `maxima[k]` has `pFWER = (1 +
  // drawCount - k) / (drawCount + 1)`, which is within alpha exactly when
  // `k ≥ (1 - alpha) · (drawCount + 1)`. Clamped, because a small enough alpha
  // asks for a quantile past the largest draw, and the largest draw is then the
  // most the permutation can support.
  let criticalIndex = Math.min(
    drawCount - 1,
    Math.ceil((1 - familyWiseAlpha) * (drawCount + 1))
  );
  // That `k` is only the answer if it starts a run. Equal maxima all carry the
  // rate of the *first* of them — being one of six draws that tied at 4.2 is
  // still six draws that reached 4.2 — so an index landing part-way into a run
  // names a value whose real rate is worse than alpha. Skip to the next distinct
  // one. Ties are the common case rather than a curiosity here: per-iteration
  // bucket weights are small integers, so a whole run of relabellings can come
  // out at exactly the same |t|.
  while (
    criticalIndex > 0 &&
    criticalIndex < drawCount - 1 &&
    maxima[criticalIndex] === maxima[criticalIndex - 1]
  ) {
    criticalIndex++;
  }

  return {
    absT,
    pValues,
    qValues,
    familyWisePValues,
    criticalAbsT: maxima[criticalIndex],
  };
}

/**
 * Throw unless two ranges are talking about the same family.
 *
 * `absT` element by element, not just the shapes: it is the one thing a range
 * recomputes rather than being told, so it is also the one thing that could
 * silently differ — a range handed a different member order, or a different
 * profile's weights, would still produce arrays of the right length full of
 * plausible counts.
 */
function checkPartialAgrees(
  partial: FamilyPartialCorrection,
  first: FamilyPartialCorrection
) {
  for (const field of ['memberCount', 'drawCount', 'nBase', 'nNew'] as const) {
    if (partial[field] !== first[field]) {
      throw new Error(
        `Cannot combine draw ranges of different families: they disagree about ` +
          `${field} (${partial[field]} against ${first[field]}).`
      );
    }
  }
  for (let m = 0; m < first.memberCount; m++) {
    if (partial.absT[m] !== first.absT[m]) {
      throw new Error(
        `Cannot combine draw ranges of different families: they disagree about member ${m}'s observed |t|.`
      );
    }
  }
}

/** Throw unless the ranges cover every draw exactly once. */
function checkDrawRangesTile(
  partials: ReadonlyArray<FamilyPartialCorrection>,
  drawCount: number
) {
  const ranges = partials
    .map(({ drawStart, drawEnd }) => ({ drawStart, drawEnd }))
    .sort((a, b) => a.drawStart - b.drawStart);
  let next = 0;
  for (const { drawStart, drawEnd } of ranges) {
    if (drawStart !== next || drawEnd < drawStart) {
      throw new Error(
        `Draw ranges do not tile [0, ${drawCount}): expected one starting at ${next}, got [${drawStart}, ${drawEnd}).`
      );
    }
    next = drawEnd;
  }
  if (next !== drawCount) {
    throw new Error(
      `Draw ranges cover [0, ${next}) but the family has ${drawCount} draws.`
    );
  }
}

/** Number of entries of an ascending array that are <= `value`. */
function countAtOrBelow(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Number of entries of an ascending array that are < `value`. */
function countBelow(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Confidence rating from p-value
// ---------------------------------------------------------------------------

export type ConfidenceRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export function pValueToConfidence(pValue: number): ConfidenceRating {
  if (pValue <= 0.05) {
    return 'HIGH';
  }
  if (pValue <= 0.15) {
    return 'MEDIUM';
  }
  return 'LOW';
}
