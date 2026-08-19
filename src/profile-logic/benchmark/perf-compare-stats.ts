// Statistics for comparing performance samples.
//
// Welch's t:       Welch (1947), Biometrika 34(1-2):28-35
// Permutation:     Fisher (1935); Ernst (2004), Statistical Science 19(4):676-685
// Incomplete beta: Press et al., Numerical Recipes 3rd ed. §6.4
// Shapiro-Wilk:    Shapiro & Wilk (1965), Biometrika 52(3-4):591-611
//   Coefficients:  Royston (1992), Statistics and Computing 2(3):117-119
//   p-value:       Royston (1995)
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
// Normal distribution
// ---------------------------------------------------------------------------

function normalQuantile(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

// Abramowitz & Stegun 7.1.26 via the error function.
// The coefficients are for erf(z), not Φ(x) directly.
export function normalCDF(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erfVal = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erfVal) : 0.5 * (1 - erfVal);
}

// ---------------------------------------------------------------------------
// Median
// ---------------------------------------------------------------------------

export function median(arr: number[]): number {
  if (!arr.length) {
    return NaN;
  }
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

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
  sdBase: number;
  sdNew: number;
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
    sdBase: Math.sqrt(varBase),
    sdNew: Math.sqrt(varNew),
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

// ---------------------------------------------------------------------------
// Effect size
// ---------------------------------------------------------------------------

export type EffectSize = 'Negligible' | 'Small' | 'Moderate' | 'Large';

/**
 * Standardised mean difference (Cohen's d): the change expressed in units of
 * the run-to-run spread, so it is comparable between a 200ms bucket and a 2ms
 * one.
 */
export function standardizedMeanDifference(result: WelchResult): number {
  const pooledSd = Math.sqrt(
    (result.sdBase * result.sdBase + result.sdNew * result.sdNew) / 2
  );
  if (pooledSd === 0) {
    return result.delta === 0 ? 0 : Infinity;
  }
  return result.delta / pooledSd;
}

/**
 * Cohen's conventional cut points. These land close to the Cliff's delta cut
 * points this replaced: for normally distributed data delta and d are related by
 * delta = 2*Phi(d/sqrt(2)) - 1, which maps the old 0.15/0.33/0.47 boundaries to
 * d = 0.27/0.60/0.89.
 */
export function interpretStandardizedEffect(d: number): EffectSize {
  const magnitude = Math.abs(d);
  if (magnitude < 0.2) {
    return 'Negligible';
  }
  if (magnitude < 0.5) {
    return 'Small';
  }
  if (magnitude < 0.8) {
    return 'Moderate';
  }
  return 'Large';
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
 * |t| for one relabelling. Single pass over the base group, deriving the other
 * group's sums from the pooled totals, because this runs once per relabelling
 * per bucket and there are millions of those per profile pair.
 */
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
  const sumNew = totalSum - sumBase;
  const sumSquaresNew = totalSumSquares - sumSquaresBase;
  const meanBase = sumBase / nBase;
  const meanNew = sumNew / nNew;
  // Sum of squared deviations via the computational formula. Clamped at zero:
  // it is a difference of similar magnitudes, so rounding can make an exactly
  // zero variance come out very slightly negative.
  const ssBase = Math.max(0, sumSquaresBase - nBase * meanBase * meanBase);
  const ssNew = Math.max(0, sumSquaresNew - nNew * meanNew * meanNew);
  const se = Math.sqrt(
    (nBase > 1 ? ssBase / (nBase - 1) / nBase : 0) +
      (nNew > 1 ? ssNew / (nNew - 1) / nNew : 0)
  );
  return Math.abs(tStatistic(meanNew - meanBase, se));
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
  // A relative tolerance, so that relabellings which are numerically identical
  // to the observed one count as "at least as extreme" rather than falling on
  // the wrong side of a floating-point comparison. Stays correct when `observed`
  // is Infinity: only equally perfect separations then clear the bar.
  const threshold = observed * (1 - 1e-9);

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
    if (t >= threshold) {
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
 * Relative slack when asking whether one |t| reaches another. Matches the
 * tolerance `permutationTwoSidedP` applies to its own threshold.
 */
const COMPARISON_TOLERANCE = 1e-9;

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
    const meanBase = sumBase / nBase;
    const meanNew = (totalSum[m] - sumBase) / nNew;
    // Clamped: a difference of similar magnitudes, so an exactly zero variance
    // can come out very slightly negative.
    const ssBase = Math.max(0, sumSquaresBase - nBase * meanBase * meanBase);
    const ssNew = Math.max(
      0,
      totalSumSquares[m] - sumSquaresBase - nNew * meanNew * meanNew
    );
    const se = Math.sqrt(
      ssBase / (nBase - 1) / nBase + ssNew / (nNew - 1) / nNew
    );
    const t = Math.abs(tStatistic(meanNew - meanBase, se));
    return Number.isNaN(t) ? 0 : t;
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
  //
  // Widened by a relative tolerance, for the same reason permutationTwoSidedP
  // uses one, but with more at stake here: a null value is compared against
  // *other* buckets' thresholds, and |t| is computed through a subtraction of
  // similar magnitudes, so two arithmetically equal values can land an ULP
  // apart. Without the tolerance, multiplying every bucket by one shared
  // constant — which is exactly what the geomean-normalised global view does —
  // shifts q by a count or two. Erring towards counting an exceedance keeps that
  // on the conservative side.
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
      const widened = v * (1 + COMPARISON_TOLERANCE);
      if (widened >= absT[m]) {
        ownHits[m]++;
      }
      nullsClearing[countAtOrBelow(ascending, widened)]++;
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
  // they are just the sorted `absT` every range agreed on.
  const ascending = absT.slice().sort();

  // nullExceeding[i] = null values reaching ascending[i], i.e. clearing more
  // than i thresholds.
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
      (1 + drawCount - countBelow(maxima, t * (1 - COMPARISON_TOLERANCE))) /
      (drawCount + 1);
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

export function confidenceLessThan(
  conf1: ConfidenceRating,
  conf2: ConfidenceRating
): boolean {
  return (
    (conf2 === 'HIGH' && conf1 !== 'HIGH') ||
    (conf2 === 'MEDIUM' && conf1 === 'LOW')
  );
}

// ---------------------------------------------------------------------------
// Shapiro-Wilk normality test
// ---------------------------------------------------------------------------

function poly5(coeffs: number[], u: number): number {
  return (
    ((((coeffs[0] * u + coeffs[1]) * u + coeffs[2]) * u + coeffs[3]) * u +
      coeffs[4]) *
      u +
    coeffs[5]
  );
}

function iqrFilter(data: number[]): number[] {
  if (data.length < 4) {
    return data;
  }
  const s = [...data].sort((a, b) => a - b);
  const n = s.length;
  const q1 = s[Math.floor(n * 0.25)];
  const q3 = s[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  return s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
}

export function shapiroWilkTest(
  data: number[]
): { w: number; pvalue: number } | null {
  const x = iqrFilter(data).sort((a, b) => a - b);
  const n = x.length;
  if (n < 3 || n > 5000) {
    return null;
  }

  const m = Array.from({ length: n }, (_, i) =>
    normalQuantile((i + 1 - 0.375) / (n + 0.25))
  );
  const md = m.reduce((s, v) => s + v * v, 0);
  const sqrtMd = Math.sqrt(md);

  const c1 = [-2.706056, 4.434685, -2.07119, -0.147981, 0.221157, 0];
  const c2 = [-3.582633, 5.682633, -1.752461, -0.293762, 0.042981, 0];
  const u = 1 / Math.sqrt(n);
  c1[5] = m[n - 1] / sqrtMd;
  c2[5] = m[n - 2] / sqrtMd;
  const an = poly5(c1, u);
  const ann = poly5(c2, u);

  const half = Math.floor(n / 2);
  let phi: number;
  if (n > 5) {
    phi =
      (md - 2 * m[n - 1] ** 2 - 2 * m[n - 2] ** 2) /
      (1 - 2 * an ** 2 - 2 * ann ** 2);
  } else {
    phi = (md - 2 * m[n - 1] ** 2) / (1 - 2 * an ** 2);
  }
  const sqrtPhi = Math.sqrt(phi);

  const a: number[] = Array.from<number>({ length: half });
  a[0] = an;
  if (n > 5 && half > 1) {
    a[1] = ann;
  }
  const startJ = n > 5 ? 2 : 1;
  for (let j = startJ; j < half; j++) {
    a[j] = m[n - 1 - j] / sqrtPhi;
  }

  const xbar = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - xbar) ** 2, 0);
  if (ss === 0) {
    return null;
  }

  let num = 0;
  for (let j = 0; j < half; j++) {
    num += a[j] * (x[n - 1 - j] - x[j]);
  }
  const w = Math.min(num ** 2 / ss, 1);

  const logn = Math.log(n);
  let g: number, mu2: number, sigma: number;
  if (n < 12) {
    const gamma = 0.459 * n - 2.273;
    g = -Math.log(gamma - Math.log(1 - w));
    mu2 = -0.0006714 * n ** 3 + 0.025054 * n ** 2 - 0.39978 * n + 0.544;
    sigma = Math.exp(
      -0.0020322 * n ** 3 + 0.062767 * n ** 2 - 0.77857 * n + 1.3822
    );
  } else {
    g = Math.log(1 - w);
    mu2 =
      0.0038915 * logn ** 3 - 0.083751 * logn ** 2 - 0.31082 * logn - 1.5861;
    sigma = Math.exp(0.0030302 * logn ** 2 - 0.082676 * logn - 0.4803);
  }

  const pvalue = 1 - normalCDF((g - mu2) / sigma);
  return { w, pvalue };
}

// ---------------------------------------------------------------------------
// Bootstrap CI for the median difference (comp − base)
// ---------------------------------------------------------------------------

export type BootstrapCIResult = {
  shift: number;
  lo: number;
  hi: number;
};

export function bootstrapMedianCI(
  base: number[],
  comp: number[],
  nIter: number = 500
): BootstrapCIResult | null {
  if (base.length < 2 || comp.length < 2) {
    return null;
  }
  const shifts = new Array<number>(nIter);
  for (let i = 0; i < nIter; i++) {
    shifts[i] = median(bootSample(comp)) - median(bootSample(base));
  }
  shifts.sort((a, b) => a - b);
  return {
    shift: median(comp) - median(base),
    lo: shifts[Math.floor(0.025 * nIter)],
    hi: shifts[Math.ceil(0.975 * nIter) - 1],
  };
}

function bootSample(arr: number[]): number[] {
  const out = new Array<number>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = arr[Math.floor(Math.random() * arr.length)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mode matching — min-cost bipartite assignment (bitmask DP, exact for ≤8 modes)
//
// Cost = 0.75 × normalised location distance + 0.25 × fraction difference
// ---------------------------------------------------------------------------

export type MatchResult = {
  pairs: [number, number][];
  unmatchedBase: number[];
  unmatchedNew: number[];
};

export function matchModes(
  baseLocs: number[],
  baseFracs: number[],
  newLocs: number[],
  newFracs: number[]
): MatchResult {
  const n = baseLocs.length;
  const m = newLocs.length;
  if (!n || !m) {
    return { pairs: [], unmatchedBase: range(n), unmatchedNew: range(m) };
  }

  if (n > m) {
    const sw = matchModes(newLocs, newFracs, baseLocs, baseFracs);
    return {
      pairs: sw.pairs.map(([a, b]) => [b, a]),
      unmatchedBase: sw.unmatchedNew,
      unmatchedNew: sw.unmatchedBase,
    };
  }

  // n <= m: assign all n base modes to n of the m new modes
  const all = baseLocs.concat(newLocs);
  let lo = all[0],
    hi = all[0];
  for (let i = 1; i < all.length; i++) {
    if (all[i] < lo) {
      lo = all[i];
    }
    if (all[i] > hi) {
      hi = all[i];
    }
  }
  const span = hi - lo || 1;

  const cost = baseLocs.map((bl, i) =>
    newLocs.map(
      (nl, j) =>
        (0.75 * Math.abs(bl - nl)) / span +
        0.25 * Math.abs(baseFracs[i] - newFracs[j])
    )
  );

  const INF = 1e9;
  const states = 1 << m;
  const dp = new Float64Array(states).fill(INF);
  const prev = new Int16Array(states).fill(-1);
  dp[0] = 0;
  for (let mask = 0; mask < states; mask++) {
    if (dp[mask] === INF) {
      continue;
    }
    const i = popcount(mask);
    if (i >= n) {
      continue;
    }
    for (let j = 0; j < m; j++) {
      if ((mask >> j) & 1) {
        continue;
      }
      const nm = mask | (1 << j);
      const c = dp[mask] + cost[i][j];
      if (c < dp[nm]) {
        dp[nm] = c;
        prev[nm] = j;
      }
    }
  }

  let best = -1;
  let bc = INF;
  for (let mask = 0; mask < states; mask++) {
    if (popcount(mask) === n && dp[mask] < bc) {
      bc = dp[mask];
      best = mask;
    }
  }

  const pairs: [number, number][] = [];
  let cur = best;
  for (let i = n - 1; i >= 0; i--) {
    const j = prev[cur];
    pairs.unshift([i, j]);
    cur ^= 1 << j;
  }
  const matchedNew = new Set(pairs.map(([, b]) => b));
  return {
    pairs,
    unmatchedBase: [],
    unmatchedNew: range(m).filter((j) => !matchedNew.has(j)),
  };
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>= 1;
  }
  return c;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

// Split raw samples into mode buckets using boundary x-values.
export function splitByMode(data: number[], boundaries: number[]): number[][] {
  const buckets: number[][] = Array.from(
    { length: boundaries.length + 1 },
    () => []
  );
  for (const v of data) {
    let m = 0;
    while (m < boundaries.length && v > boundaries[m]) {
      m++;
    }
    buckets[m].push(v);
  }
  return buckets;
}

// Fraction of KDE area in each mode bucket (trapezoid rule).
export function areaFractions(
  x: number[],
  y: number[],
  boundaries: number[]
): number[] {
  const buckets = new Array(boundaries.length + 1).fill(0);
  let total = 0;
  for (let i = 1; i < x.length; i++) {
    const area = 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]);
    total += area;
    let m = 0;
    while (m < boundaries.length && x[i] > boundaries[m]) {
      m++;
    }
    buckets[m] += area;
  }
  return total > 0
    ? buckets.map((b: number) => b / total)
    : buckets.map(() => 1 / buckets.length);
}

// Assign letter labels: A = lowest value (fastest), B = next, etc.
export function assignModeLetters(peakLocs: number[]): string[] {
  const sorted = peakLocs
    .map((_, i) => i)
    .sort((a, b) => peakLocs[a] - peakLocs[b]);
  const letters = new Array<string>(peakLocs.length);
  sorted.forEach((idx, rank) => {
    letters[idx] = String.fromCharCode(65 + rank);
  });
  return letters;
}
