/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Runnable prototype for the ideas in benchmark-auto-bucketing.md.
 *
 *   node docs-developer/auto-bucketing-prototype.mjs
 *   node docs-developer/auto-bucketing-prototype.mjs --tree /tmp/subtree.json
 *
 * Self-contained: no imports, no dependency on the profiler source. Everything
 * is seeded, so the numbers quoted in the report are reproducible.
 *
 * ---------------------------------------------------------------------------
 * Model
 * ---------------------------------------------------------------------------
 * A tree of nodes. Each node carries its *self* weight per iteration, for the
 * base profile and the new profile. A "bucket" is the set of nodes whose
 * nearest ancestor-or-self in a chosen split set S is the same node — exactly
 * the rule the current extractor uses with S = {funcs marked relevantForJS},
 * generalised from a set of funcs to a set of tree nodes.
 *
 * Because buckets partition the samples, per-iteration weights add up, and so
 * do the mean differences: sum over buckets of delta == delta of the whole.
 * That is what makes a bucket list readable as a *budget* for the total change.
 */

import fs from 'fs';

/** Iterations per side. Speedometer 3 as run here gives 200 (20 browser runs of
 * 10 iterations), so the examples use the same count. */
const N = 200;

// ---------------------------------------------------------------------------
// Seeded RNG and samplers
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNormal(rng) {
  let spare = null;
  return function normal(mean, sd) {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return mean + sd * v;
    }
    let u, v, s;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return mean + sd * u * mul;
  };
}

/** Per-iteration weights from a normal, clamped at zero (weights can't be
 * negative) and quantised to whole samples, like real sample counts. */
function normalVec(normal, count, mean, sd) {
  return Float64Array.from({ length: count }, () =>
    Math.max(0, Math.round(normal(mean, sd)))
  );
}

/** "Janitor" work: fires with probability `p` in an iteration and then costs
 * roughly `magnitude`. Mostly zero, occasionally large — a threshold-triggered
 * GC or cache eviction. */
function spikeVec(rng, normal, count, p, magnitude) {
  return Float64Array.from({ length: count }, () =>
    rng() < p ? Math.max(0, Math.round(normal(magnitude, magnitude * 0.25))) : 0
  );
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function node(key, self, children = []) {
  return { key, self, children };
}

/** Node with no self weight of its own — a pure grouping frame. */
function group(key, children, iterations) {
  return node(
    key,
    {
      base: new Float64Array(iterations.base),
      new: new Float64Array(iterations.new),
    },
    children
  );
}

function preorder(root, out = []) {
  out.push(root);
  for (const c of root.children) {
    preorder(c, out);
  }
  return out;
}

/**
 * Flatten the tree into parallel arrays, with each node's base and new vectors
 * concatenated into one pooled vector of length nBase + nNew. Permuting group
 * labels is then just permuting which pooled indices count as "base", and it is
 * done identically for every node, which preserves the correlation between
 * nodes (they are the same iterations).
 */
function flatten(root) {
  const nodes = preorder(root);
  const nBase = root.self.base.length;
  const nNew = root.self.new.length;
  const index = new Map();
  nodes.forEach((n, i) => index.set(n, i));
  const pooled = nodes.map((n) => {
    const v = new Float64Array(nBase + nNew);
    v.set(n.self.base, 0);
    v.set(n.self.new, nBase);
    return v;
  });
  const parent = new Int32Array(nodes.length).fill(-1);
  const subtree = nodes.map(() => []);
  (function walk(n) {
    const i = index.get(n);
    const own = [i];
    for (const c of n.children) {
      parent[index.get(c)] = i;
      own.push(...walk(c));
    }
    subtree[i] = own;
    return own;
  })(root);
  return { nodes, pooled, parent, subtree, nBase, nNew };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Welch statistic for one bucket. `mask[i] === 1` means pooled index i belongs
 * to the base group.
 *
 * A Welch t rather than a rank test, deliberately: per-iteration bucket weights
 * are small integers, so a rank test is swamped by ties (that is what made the
 * geomean-normalised global view report phantom effects). The mean difference
 * is also the quantity that adds up across a partition, and its null
 * distribution comes from permutation rather than from a normality assumption,
 * so no distributional claim is being made here.
 */
function welch(pooledVec, mask, nBase, nNew) {
  let sumB = 0;
  let sumN = 0;
  for (let i = 0; i < pooledVec.length; i++) {
    if (mask[i]) {
      sumB += pooledVec[i];
    } else {
      sumN += pooledVec[i];
    }
  }
  const meanB = sumB / nBase;
  const meanN = sumN / nNew;
  let ssB = 0;
  let ssN = 0;
  for (let i = 0; i < pooledVec.length; i++) {
    if (mask[i]) {
      ssB += (pooledVec[i] - meanB) ** 2;
    } else {
      ssN += (pooledVec[i] - meanN) ** 2;
    }
  }
  const varB = nBase > 1 ? ssB / (nBase - 1) : 0;
  const varN = nNew > 1 ? ssN / (nNew - 1) : 0;
  const se = Math.sqrt(varB / nBase + varN / nNew);
  const delta = meanN - meanB;
  return {
    meanBase: meanB,
    meanNew: meanN,
    sdBase: Math.sqrt(varB),
    sdNew: Math.sqrt(varN),
    delta,
    se,
    t: se > 0 ? delta / se : 0,
  };
}

function totalWeight(pooledVec) {
  let s = 0;
  for (let i = 0; i < pooledVec.length; i++) {
    s += pooledVec[i];
  }
  return s;
}

/** Fraction of iterations with zero weight, and the share of the total carried
 * by the heaviest 5% of iterations. Both are high for intermittent work. */
function shape(pooledVec) {
  const sorted = Array.from(pooledVec).sort((a, b) => b - a);
  const total = sorted.reduce((s, v) => s + v, 0);
  const topCount = Math.max(1, Math.round(sorted.length * 0.05));
  const top = sorted.slice(0, topCount).reduce((s, v) => s + v, 0);
  const zeros = sorted.filter((v) => v === 0).length / sorted.length;
  return { zeroFraction: zeros, topShare: total > 0 ? top / total : 0 };
}

// ---------------------------------------------------------------------------
// Greedy partition refinement
// ---------------------------------------------------------------------------

/**
 * Split a bucket only if doing so makes some part of it more detectable than
 * the whole was. With B = C + R (disjoint, so the per-iteration vectors add):
 *
 *   gain = max(|t_C|, |t_R|) - |t_B|
 *
 * One rule covers both of the motivating cases. If the change lives in C, then
 * |t_C| beats |t_B| because B's unchanged half only added noise. If C is
 * variance with no change in it, then |t_R| beats |t_B| because removing C
 * removed variance without removing signal (variances add, means add, so
 * sd(R) < sd(B) while delta(R) == delta(B)).
 */
function greedy(flat, mask, opts) {
  const { pooled, subtree, nodes, nBase, nNew } = flat;
  const { gainCrit, maxSplits = 12, minWeight = 0 } = opts;

  // owner[i] = index of the node whose bucket node i belongs to.
  const owner = new Int32Array(nodes.length).fill(0);
  const splits = [0];
  const bucketVec = new Map([[0, sumOf(pooled, subtree[0])]]);

  const applied = [];
  for (let step = 0; step < maxSplits; step++) {
    let best = null;
    for (let v = 1; v < nodes.length; v++) {
      if (splits.includes(v)) {
        continue;
      }
      const o = owner[v];
      const own = subtree[v].filter((u) => owner[u] === o);
      if (own.length === 0) {
        continue;
      }
      const sub = sumOf(pooled, own);
      const wSub = totalWeight(sub);
      const whole = bucketVec.get(o);
      const rest = Float64Array.from(whole, (x, i) => x - sub[i]);
      const wRest = totalWeight(rest);
      if (wSub <= minWeight || wRest <= minWeight) {
        continue;
      }
      const tWhole = Math.abs(welch(whole, mask, nBase, nNew).t);
      const tSub = Math.abs(welch(sub, mask, nBase, nNew).t);
      const tRest = Math.abs(welch(rest, mask, nBase, nNew).t);
      const gain = Math.max(tSub, tRest) - tWhole;
      if (best === null || gain > best.gain) {
        best = { v, o, own, sub, rest, gain, tSub, tRest, tWhole };
      }
    }
    if (best === null || best.gain <= gainCrit) {
      break;
    }
    splits.push(best.v);
    for (const u of best.own) {
      owner[u] = best.v;
    }
    bucketVec.set(best.v, best.sub);
    bucketVec.set(best.o, best.rest);
    applied.push({
      key: nodes[best.v].key,
      parentBucket: nodes[best.o].key,
      gain: best.gain,
      tBefore: best.tWhole,
      tSplitOff: best.tSub,
      tRemainder: best.tRest,
    });
  }

  const buckets = splits.map((v) => ({
    key: nodes[v].key,
    vec: bucketVec.get(v),
    stats: welch(bucketVec.get(v), mask, nBase, nNew),
  }));
  return { buckets, applied, owner, splits };
}

function sumOf(pooled, indices) {
  const out = new Float64Array(pooled[0].length);
  for (const i of indices) {
    const v = pooled[i];
    for (let j = 0; j < out.length; j++) {
      out[j] += v[j];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Permutation calibration
// ---------------------------------------------------------------------------

function identityMask(nBase, nNew) {
  const mask = new Uint8Array(nBase + nNew);
  mask.fill(1, 0, nBase);
  return mask;
}

function permutedMask(rng, nBase, nNew) {
  const n = nBase + nNew;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < nBase; i++) {
    mask[idx[i]] = 1;
  }
  return mask;
}

/**
 * Two calibration passes, both under the null that base and new iterations are
 * exchangeable. Permuting whole iterations (rather than resampling within a
 * node) keeps every node's data aligned, so the null respects the fact that
 * nested nodes are the same samples counted twice.
 *
 *  - gainCrit: how large a split gain the *search itself* produces on data with
 *    no real difference in it. Anything at or below this is the search finding
 *    a lucky partition of noise.
 *  - tCrit: how large a |t| the whole procedure (search, then test the buckets
 *    it chose) produces under the null. Using the max over the final buckets
 *    controls the family-wise error across everything the search looked at,
 *    the same way a max-statistic permutation test does for a cluster search
 *    over a spatial map.
 */
function calibrate(
  flat,
  rng,
  { permutations = 400, maxSplits = 12, minWeight = 0 }
) {
  const { nBase, nNew } = flat;
  const gains = [];
  for (let p = 0; p < permutations; p++) {
    const mask = permutedMask(rng, nBase, nNew);
    gains.push(bestGain(flat, mask, minWeight));
  }
  const gainCrit = quantile(gains, 0.95);

  const ts = [];
  for (let p = 0; p < permutations; p++) {
    const mask = permutedMask(rng, nBase, nNew);
    const { buckets } = greedy(flat, mask, { gainCrit, maxSplits, minWeight });
    ts.push(Math.max(...buckets.map((b) => Math.abs(b.stats.t))));
  }
  return { gainCrit, tCrit: quantile(ts, 0.95) };
}

function bestGain(flat, mask, minWeight) {
  const { pooled, subtree, nodes, nBase, nNew } = flat;
  const whole = sumOf(pooled, subtree[0]);
  const tWhole = Math.abs(welch(whole, mask, nBase, nNew).t);
  let best = -Infinity;
  for (let v = 1; v < nodes.length; v++) {
    const sub = sumOf(pooled, subtree[v]);
    const rest = Float64Array.from(whole, (x, i) => x - sub[i]);
    if (totalWeight(sub) <= minWeight || totalWeight(rest) <= minWeight) {
      continue;
    }
    const tSub = Math.abs(welch(sub, mask, nBase, nNew).t);
    const tRest = Math.abs(welch(rest, mask, nBase, nNew).t);
    best = Math.max(best, Math.max(tSub, tRest) - tWhole);
  }
  return best === -Infinity ? 0 : best;
}

function quantile(values, q) {
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
}

// ---------------------------------------------------------------------------
// Labelling: improved / regressed / unchanged / unresolved
// ---------------------------------------------------------------------------

/**
 * "Unchanged" and "we couldn't tell" are different answers, and a perf tool
 * that conflates them is misleading. The separator is the minimum detectable
 * effect: tCrit * se is the smallest shift this bucket could have shown while
 * still clearing the calibrated bar. If that is small next to the bucket, a
 * null result means the bucket really didn't move. If it is large, the bucket
 * is simply too noisy to say anything, and the honest output is the MDE.
 */
function label(bucketStats, vec, tCrit, opts = {}) {
  const { tolerance = 0.05, materiality = 0.5 } = opts;
  const { t, delta, se, meanBase } = bucketStats;
  const mde = tCrit * se;
  const sh = shape(vec);
  if (Math.abs(t) > tCrit) {
    return { label: delta < 0 ? 'improved' : 'regressed', mde, ...sh };
  }
  // A bucket too small to move the score by `materiality` can't be actionable
  // whichever way it went, so say that rather than implying we measured it.
  if (meanBase < materiality && mde < materiality) {
    return { label: 'immaterial', mde, ...sh };
  }
  // Otherwise the question is whether we had the power to see a change worth
  // caring about. If yes, "unchanged" is a real finding; if no, the only honest
  // output is the MDE.
  return {
    label: mde <= tolerance * meanBase ? 'unchanged' : 'unresolved (noisy)',
    mde,
    ...sh,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(title, flat, result, crit) {
  const { nBase, nNew } = flat;
  const rootVec = sumOf(flat.pooled, flat.subtree[0]);
  const rootStats = welch(rootVec, identityMask(nBase, nNew), nBase, nNew);
  console.log(`\n### ${title}`);
  console.log(
    `whole tree: base=${rootStats.meanBase.toFixed(2)} new=${rootStats.meanNew.toFixed(2)} ` +
      `delta=${rootStats.delta.toFixed(2)} (${((rootStats.delta / rootStats.meanBase) * 100).toFixed(1)}%) ` +
      `|t|=${Math.abs(rootStats.t).toFixed(2)}  ` +
      `[calibrated: gainCrit=${crit.gainCrit.toFixed(2)} tCrit=${crit.tCrit.toFixed(2)}]`
  );
  if (Math.abs(rootStats.t) <= crit.tCrit) {
    console.log('  -> as one bucket: NOT detectable');
  } else {
    console.log('  -> as one bucket: detectable');
  }

  if (result.applied.length === 0) {
    console.log('splits: none');
  } else {
    console.log('splits applied:');
    for (const a of result.applied) {
      console.log(
        `  split "${a.key}" out of "${a.parentBucket}": ` +
          `|t| ${a.tBefore.toFixed(2)} -> split-off ${a.tSplitOff.toFixed(2)}, ` +
          `remainder ${a.tRemainder.toFixed(2)} (gain ${a.gain.toFixed(2)})`
      );
    }
  }

  console.log(
    'bucket'.padEnd(30),
    'base'.padStart(8),
    'new'.padStart(8),
    'delta'.padStart(8),
    '|t|'.padStart(6),
    'MDE'.padStart(7),
    'zero%'.padStart(6),
    'top5%'.padStart(6),
    ' verdict'
  );
  let deltaSum = 0;
  for (const b of result.buckets) {
    const l = label(b.stats, b.vec, crit.tCrit);
    deltaSum += b.stats.delta;
    console.log(
      b.key.slice(0, 29).padEnd(30),
      b.stats.meanBase.toFixed(2).padStart(8),
      b.stats.meanNew.toFixed(2).padStart(8),
      b.stats.delta.toFixed(2).padStart(8),
      Math.abs(b.stats.t).toFixed(2).padStart(6),
      l.mde.toFixed(2).padStart(7),
      (l.zeroFraction * 100).toFixed(0).padStart(6),
      (l.topShare * 100).toFixed(0).padStart(6),
      ' ' + l.label
    );
  }
  console.log(
    `sum of bucket deltas = ${deltaSum.toFixed(6)}, whole-tree delta = ${rootStats.delta.toFixed(6)}` +
      `  (partition is exact, so the buckets are a budget for the total)`
  );
}

function run(title, root, opts = {}) {
  const flat = flatten(root);
  const rng = mulberry32(opts.seed ?? 12345);
  const crit = calibrate(flat, rng, {
    permutations: opts.permutations ?? 400,
    maxSplits: opts.maxSplits ?? 12,
    minWeight: opts.minWeight ?? 0,
  });
  const mask = identityMask(flat.nBase, flat.nNew);
  const result = greedy(flat, mask, {
    gainCrit: crit.gainCrit,
    maxSplits: opts.maxSplits ?? 12,
    minWeight: opts.minWeight ?? 0,
  });
  report(title, flat, result, crit);
  return { flat, result, crit };
}

// ===========================================================================
// Example 1 - a bucket that is too big hides the change inside it
// ===========================================================================

function example1() {
  const rng = mulberry32(1);
  const normal = makeNormal(rng);
  const tree = group(
    'Update style',
    [
      // The part that actually improved: 8.0ms -> 6.8ms, and quiet.
      node('  RestyleRules (improved)', {
        base: normalVec(normal, N, 8.0, 1.0),
        new: normalVec(normal, N, 6.8, 1.0),
      }),
      // The part that did not change, bigger and seven times noisier - which is
      // what style and layout self time actually look like.
      node('  InvalidateFlags (flat)', {
        base: normalVec(normal, N, 12.0, 7.0),
        new: normalVec(normal, N, 12.0, 7.0),
      }),
    ],
    { base: N, new: N }
  );
  run('Example 1: masked improvement inside one label', tree, { seed: 101 });
}

// ===========================================================================
// Example 2 - intermittent "janitor" work drowns a real change
// ===========================================================================

function example2() {
  const rng = mulberry32(2);
  const normal = makeNormal(rng);
  const tree = group(
    'runIteration',
    [
      node('  work (improved 4%)', {
        base: normalVec(normal, N, 30.0, 0.8),
        new: normalVec(normal, N, 28.8, 0.8),
      }),
      // Fires about one iteration in eight, costs ~40ms, identical on both
      // sides. Contributes no signal and almost all of the variance.
      node('  janitorGC (unchanged)', {
        base: spikeVec(rng, normal, N, 0.125, 40),
        new: spikeVec(rng, normal, N, 0.125, 40),
      }),
    ],
    { base: N, new: N }
  );
  run('Example 2: intermittent work hides a real change', tree, { seed: 202 });
}

// ===========================================================================
// Example 3 - the trap: searching for a split finds one even in pure noise
// ===========================================================================

function example3() {
  const CHILDREN = 12;
  const TRIALS = 200;

  let naiveFalse = 0;
  let calibratedFalse = 0;
  let exampleLine = '';
  for (let trial = 0; trial < TRIALS; trial++) {
    const rng = mulberry32(9000 + trial);
    const normal = makeNormal(rng);
    const children = Array.from({ length: CHILDREN }, (_, i) =>
      node(`  child${i}`, {
        base: normalVec(normal, N, 4.0, 1.5),
        new: normalVec(normal, N, 4.0, 1.5), // no difference anywhere
      })
    );
    const tree = group('root', children, { base: N, new: N });
    const flat = flatten(tree);
    const mask = identityMask(N, N);

    // Naive: split on any positive gain, then judge each bucket at |t| > 1.96.
    const naive = greedy(flat, mask, { gainCrit: 0, maxSplits: 12 });
    if (naive.buckets.some((b) => Math.abs(b.stats.t) > 1.96)) {
      naiveFalse++;
    }

    // Calibrated: thresholds from permuting this same data.
    const crit = calibrate(flat, mulberry32(trial + 1), {
      permutations: 120,
      maxSplits: 12,
    });
    const cal = greedy(flat, mask, { gainCrit: crit.gainCrit, maxSplits: 12 });
    if (cal.buckets.some((b) => Math.abs(b.stats.t) > crit.tCrit)) {
      calibratedFalse++;
    }
    if (trial === 0) {
      exampleLine =
        `  trial 0: best naive bucket |t|=${Math.max(
          ...naive.buckets.map((b) => Math.abs(b.stats.t))
        ).toFixed(2)} (nominal cutoff 1.96), ` +
        `calibrated cutoffs gainCrit=${crit.gainCrit.toFixed(2)} tCrit=${crit.tCrit.toFixed(2)}`;
    }
  }

  console.log('\n### Example 3: false splits when nothing changed');
  console.log(
    `${TRIALS} trials, ${CHILDREN} children, no real difference in any of them.`
  );
  console.log(exampleLine);
  console.log(
    `  naive (split on any gain, judge at |t|>1.96): ` +
      `${((naiveFalse / TRIALS) * 100).toFixed(0)}% of trials report a "significant" bucket`
  );
  console.log(
    `  permutation-calibrated:                      ` +
      `${((calibratedFalse / TRIALS) * 100).toFixed(0)}% of trials report one (target: 5%)`
  );
}

// ===========================================================================
// Example 4 - recursion fragments a bucket across depths
// ===========================================================================

function example4() {
  const DEPTH = 12;
  const rng = mulberry32(4);
  const normal = makeNormal(rng);

  // A recursive function, self time spread over depths with a geometric decay.
  // Every depth improved by the same 4%, and every depth is equally noisy in
  // relative terms - so the ratio |t| is identical at every depth and it is the
  // *aggregate* that is detectable, not any single depth.
  const weightAt = (d) => 6.0 * Math.pow(0.75, d);
  function chain(d) {
    const self = {
      base: normalVec(normal, N, weightAt(d), weightAt(d) * 0.25),
      new: normalVec(normal, N, weightAt(d) * 0.96, weightAt(d) * 0.25),
    };
    return node(
      `  RuleNode::drop @depth${d}`,
      self,
      d + 1 < DEPTH ? [chain(d + 1)] : []
    );
  }
  const perDepth = group('Update style', [chain(0)], { base: N, new: N });

  console.log('\n### Example 4: recursion, per-depth nodes vs collapsed');
  const flatPerDepth = flatten(perDepth);
  const mask = identityMask(N, N);

  // (a) Sum of subtree totals over every node named RuleNode::drop, which is
  // what you get if you treat "the subtree rooted at each occurrence" as a
  // candidate bucket and add them up.
  let doubleCounted = 0;
  for (let v = 1; v < flatPerDepth.nodes.length; v++) {
    doubleCounted += totalWeight(
      sumOf(flatPerDepth.pooled, flatPerDepth.subtree[v])
    );
  }
  const actual = totalWeight(
    sumOf(flatPerDepth.pooled, flatPerDepth.subtree[0])
  );
  console.log(
    `  total weight actually present: ${actual.toFixed(0)}; ` +
      `sum of per-occurrence subtree totals: ${doubleCounted.toFixed(0)} ` +
      `(${(doubleCounted / actual).toFixed(1)}x over-counted)`
  );

  // (b) One bucket per recursion depth: signal split 12 ways.
  const perDepthTs = [];
  for (let d = 0; d < DEPTH; d++) {
    const i = d + 1; // node index in preorder along the chain
    perDepthTs.push(Math.abs(welch(flatPerDepth.pooled[i], mask, N, N).t));
  }
  console.log(
    `  one bucket per depth: |t| = ${perDepthTs.map((t) => t.toFixed(1)).join(' ')}`
  );
  console.log(
    `    max per-depth |t| = ${Math.max(...perDepthTs).toFixed(2)}, ` +
      `depths clearing 1.96: ${perDepthTs.filter((t) => t > 1.96).length}/${DEPTH}`
  );

  // (c) Collapse consecutive same-func frames into one node, which is what the
  // func-keyed rule does automatically.
  const collapsedSelf = { base: new Float64Array(N), new: new Float64Array(N) };
  for (let d = 0; d < DEPTH; d++) {
    const i = d + 1;
    for (let j = 0; j < N; j++) {
      collapsedSelf.base[j] += flatPerDepth.nodes[i].self.base[j];
      collapsedSelf.new[j] += flatPerDepth.nodes[i].self.new[j];
    }
  }
  const collapsed = group(
    'Update style',
    [node('  RuleNode::drop (collapsed)', collapsedSelf)],
    {
      base: N,
      new: N,
    }
  );
  const flatCollapsed = flatten(collapsed);
  const cs = welch(flatCollapsed.pooled[1], mask, N, N);
  console.log(
    `  collapsed into one bucket: base=${cs.meanBase.toFixed(2)} new=${cs.meanNew.toFixed(2)} ` +
      `delta=${cs.delta.toFixed(2)} |t|=${Math.abs(cs.t).toFixed(2)}`
  );

  // (d) What the extra candidates cost: more nodes to search over means a
  // higher calibrated bar, on top of each fragment having less signal.
  const critPerDepth = calibrate(flatPerDepth, mulberry32(41), {
    permutations: 300,
    maxSplits: 12,
  });
  const critCollapsed = calibrate(flatCollapsed, mulberry32(41), {
    permutations: 300,
    maxSplits: 12,
  });
  console.log(
    `  calibrated tCrit: ${critPerDepth.tCrit.toFixed(2)} with ${DEPTH} per-depth nodes, ` +
      `${critCollapsed.tCrit.toFixed(2)} with 1 collapsed node`
  );
}

// ===========================================================================
// Example 6 - a shared nuisance factor, removed without splitting anything
// ===========================================================================

/**
 * Not all noise is a subtree. Machine-level noise, thermal drift, an unlucky GC
 * schedule - these move many unrelated nodes in the same iteration, so no split
 * can isolate them, and every bucket pays for them in its denominator.
 *
 * They can be adjusted away instead, by regressing each bucket on a covariate
 * that measures the shared wobble and testing the group coefficient:
 *
 *     y = alpha + beta * isNew + gamma * f  ->  test beta
 *
 * The covariate has to be chosen carefully. The obvious move - take the leading
 * principal component of the (node x iteration) residual matrix and project it
 * out - does not work, and fails in an instructive direction. Residuals taken
 * around each *group's* mean have zero mean within each group by construction,
 * so the component you recover cannot explain any part of the base/new
 * difference. Projecting it out shrinks each bucket's variance while leaving the
 * factor's contribution to the mean difference untouched, which inflates the
 * null instead of the signal: measured on the data below, the calibrated cutoff
 * rose from 2.26 to 8.87 and nothing became detectable.
 *
 * A leave-one-out total works: for bucket B, use (everything - B) as f. It
 * carries the shared factor including its between-group part, and it cannot
 * contain B's own signal, so it is not circular.
 */

/** OLS for y = a + b*isNew + c*f, returning b and its t statistic. */
function ancova(y, mask, f) {
  const n = y.length;
  // Design columns: 1, isNew, f.
  const cols = [new Float64Array(n).fill(1), new Float64Array(n), f];
  for (let i = 0; i < n; i++) {
    cols[1][i] = mask[i] ? 0 : 1;
  }
  // Normal equations (3x3 symmetric) and right-hand side.
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhs = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        s += cols[a][i] * cols[b][i];
      }
      A[a][b] = s;
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += cols[a][i] * y[i];
    }
    rhs[a] = s;
  }
  const inv = invert3(A);
  if (inv === null) {
    return { beta: 0, t: 0 };
  }
  const beta = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    beta[a] = inv[a][0] * rhs[0] + inv[a][1] * rhs[1] + inv[a][2] * rhs[2];
  }
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const fit =
      beta[0] * cols[0][i] + beta[1] * cols[1][i] + beta[2] * cols[2][i];
    rss += (y[i] - fit) ** 2;
  }
  const s2 = rss / (n - 3);
  const varBeta = s2 * inv[1][1];
  return {
    beta: beta[1],
    t: varBeta > 0 ? beta[1] / Math.sqrt(varBeta) : 0,
  };
}

function invert3(m) {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!isFinite(det) || Math.abs(det) < 1e-12) {
    return null;
  }
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

function example6() {
  const NODES = 8;
  const rng = mulberry32(6);
  const normal = makeNormal(rng);

  // One shared per-iteration multiplier, same distribution on both sides: the
  // machine ran a little faster or slower during that iteration.
  const factorPer = Float64Array.from({ length: 2 * N }, () =>
    Math.max(0.5, normal(1.0, 0.15))
  );
  const children = [];
  for (let k = 0; k < NODES; k++) {
    const improved = k === 0;
    const base = new Float64Array(N);
    const nw = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      base[i] = Math.max(0, Math.round(normal(10.0, 0.3) * factorPer[i]));
      nw[i] = Math.max(
        0,
        Math.round(normal(improved ? 9.7 : 10.0, 0.3) * factorPer[N + i])
      );
    }
    children.push(
      node(`  ${improved ? 'hot (improved 3%)' : `sibling${k}`}`, {
        base,
        new: nw,
      })
    );
  }
  const tree = group('root', children, { base: N, new: N });
  const flat = flatten(tree);
  const mask = identityMask(N, N);
  const nodeVecs = flat.pooled.slice(1);
  const total = sumOf(flat.pooled, flat.subtree[0]);
  const loo = (k) => Float64Array.from(total, (x, i) => x - nodeVecs[k][i]);

  const raw = nodeVecs.map((v) => welch(v, mask, N, N));
  const adj = nodeVecs.map((v, k) => ancova(v, mask, loo(k)));

  // Calibrate both procedures the same way: permute iteration labels, redo the
  // whole thing, take the max over nodes.
  const prng = mulberry32(66);
  const rawMax = [];
  const adjMax = [];
  for (let p = 0; p < 300; p++) {
    const pm = permutedMask(prng, N, N);
    rawMax.push(
      Math.max(...nodeVecs.map((v) => Math.abs(welch(v, pm, N, N).t)))
    );
    adjMax.push(
      Math.max(...nodeVecs.map((v, k) => Math.abs(ancova(v, pm, loo(k)).t)))
    );
  }
  const rawCrit = quantile(rawMax, 0.95);
  const adjCrit = quantile(adjMax, 0.95);

  console.log('\n### Example 6: shared nuisance factor, adjusted away');
  console.log(
    `${NODES} sibling nodes, one improved by 3%; every iteration is scaled by a`
  );
  console.log('shared factor (sd 15%) drawn identically for both profiles.');
  console.log(
    'node'.padEnd(26),
    'delta'.padStart(8),
    '|t| raw'.padStart(9),
    'beta adj'.padStart(9),
    '|t| adj'.padStart(9)
  );
  for (let k = 0; k < NODES; k++) {
    console.log(
      flat.nodes[k + 1].key.slice(0, 25).padEnd(26),
      raw[k].delta.toFixed(2).padStart(8),
      Math.abs(raw[k].t).toFixed(2).padStart(9),
      adj[k].beta.toFixed(2).padStart(9),
      Math.abs(adj[k].t).toFixed(2).padStart(9)
    );
  }
  console.log(
    `  calibrated cutoff: raw ${rawCrit.toFixed(2)}, adjusted ${adjCrit.toFixed(2)}`
  );
  const rawHit = Math.abs(raw[0].t) > rawCrit;
  const adjHit = Math.abs(adj[0].t) > adjCrit;
  console.log(
    `  the improved node: raw |t|=${Math.abs(raw[0].t).toFixed(2)} vs ${rawCrit.toFixed(2)} -> ` +
      `${rawHit ? 'detected' : 'MISSED'};  ` +
      `adjusted |t|=${Math.abs(adj[0].t).toFixed(2)} vs ${adjCrit.toFixed(2)} -> ` +
      `${adjHit ? 'detected' : 'MISSED'}`
  );
  const falseRaw = raw.slice(1).filter((r) => Math.abs(r.t) > rawCrit).length;
  const falseAdj = adj.slice(1).filter((r) => Math.abs(r.t) > adjCrit).length;
  console.log(
    `  unchanged siblings falsely flagged: raw ${falseRaw}/${NODES - 1}, adjusted ${falseAdj}/${NODES - 1}`
  );
}

// ===========================================================================
// Example 5 - real subtree, if a dumped tree is supplied
// ===========================================================================

function example5(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  function build(n) {
    return node(
      n.key,
      {
        base: Float64Array.from(n.base),
        new: Float64Array.from(n.new),
      },
      (n.children ?? []).map(build)
    );
  }
  const tree = build(raw);
  run(`Example 5: real data - ${raw.key}`, tree, {
    seed: 505,
    permutations: 200,
    maxSplits: 8,
    minWeight: raw.minWeight ?? 0,
  });
}

// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const treeArg = args.indexOf('--tree');
  console.log(
    'Automatic bucketing prototype. Buckets partition samples by nearest'
  );
  console.log('split point in the call tree; splits are chosen greedily and');
  console.log('thresholds come from permuting iteration labels.');
  example1();
  example2();
  example3();
  example4();
  example6();
  if (treeArg !== -1) {
    example5(args[treeArg + 1]);
  }
}

main();
