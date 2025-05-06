// Non-parametric statistics for comparing performance samples.
//
// Mann-Whitney U:  Wilcoxon (1945), Biometrics Bulletin 1(6):80-83
// Cliff's delta:   Cliff (1993), Psychological Bulletin 114(3):494-509
// Shapiro-Wilk:    Shapiro & Wilk (1965), Biometrika 52(3-4):591-611
//   Coefficients:  Royston (1992), Statistics and Computing 2(3):117-119
//   p-value:       Royston (1995)

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
  if (!arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// Mann-Whitney U
// ---------------------------------------------------------------------------

export function mannWhitneyU(a: number[], b: number[]): number {
  let u = 0;
  for (const ai of a) {
    for (const bj of b) {
      if (ai < bj) u += 1;
      else if (ai === bj) u += 0.5;
    }
  }
  return u;
}

export function mannWhitneyPValue(
  u: number,
  n1: number,
  n2: number,
  allValues: number[]
): number {
  const mu = (n1 * n2) / 2;
  const counts = new Map<number, number>();
  for (const v of allValues) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieCorrection = 0;
  for (const t of counts.values()) {
    if (t > 1) tieCorrection += t * t * t - t;
  }
  const n = n1 + n2;
  const variance = ((n1 * n2) / 12) * (n + 1 - tieCorrection / (n * (n - 1)));
  if (variance <= 0) return 1;
  const z = (u - mu) / Math.sqrt(variance);
  return 2 * (1 - normalCDF(Math.abs(z)));
}

// ---------------------------------------------------------------------------
// Cliff's delta / CLES / effect size
// ---------------------------------------------------------------------------

export type EffectSize = 'Negligible' | 'Small' | 'Moderate' | 'Large';

export function cliffsDelta(u: number, n1: number, n2: number): number {
  return (2 * u) / (n1 * n2) - 1;
}

export function cles(u: number, n1: number, n2: number): number {
  return u / (n1 * n2);
}

export function interpretEffectSize(delta: number): EffectSize {
  const magnitude = Math.abs(delta);
  if (magnitude < 0.15) return 'Negligible';
  if (magnitude < 0.33) return 'Small';
  if (magnitude < 0.47) return 'Moderate';
  return 'Large';
}

const EFFECT_SIZE_ORDER: EffectSize[] = [
  'Negligible',
  'Small',
  'Moderate',
  'Large',
];

export function effectSizeLessThan(e1: EffectSize, e2: EffectSize): boolean {
  return EFFECT_SIZE_ORDER.indexOf(e1) < EFFECT_SIZE_ORDER.indexOf(e2);
}

// ---------------------------------------------------------------------------
// Confidence rating from p-value
// ---------------------------------------------------------------------------

export type ConfidenceRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export function pValueToConfidence(pValue: number): ConfidenceRating {
  if (pValue <= 0.05) return 'HIGH';
  if (pValue <= 0.15) return 'MEDIUM';
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
  if (data.length < 4) return data;
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
  if (n < 3 || n > 5000) return null;

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
  if (n > 5 && half > 1) a[1] = ann;
  const startJ = n > 5 ? 2 : 1;
  for (let j = startJ; j < half; j++) {
    a[j] = m[n - 1 - j] / sqrtPhi;
  }

  const xbar = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - xbar) ** 2, 0);
  if (ss === 0) return null;

  let num = 0;
  for (let j = 0; j < half; j++) num += a[j] * (x[n - 1 - j] - x[j]);
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
  if (base.length < 2 || comp.length < 2) return null;
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
  for (let i = 0; i < arr.length; i++)
    out[i] = arr[Math.floor(Math.random() * arr.length)];
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
  if (!n || !m)
    return { pairs: [], unmatchedBase: range(n), unmatchedNew: range(m) };

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
    if (all[i] < lo) lo = all[i];
    if (all[i] > hi) hi = all[i];
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
    if (dp[mask] === INF) continue;
    const i = popcount(mask);
    if (i >= n) continue;
    for (let j = 0; j < m; j++) {
      if ((mask >> j) & 1) continue;
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
    while (m < boundaries.length && v > boundaries[m]) m++;
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
    while (m < boundaries.length && x[i] > boundaries[m]) m++;
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
