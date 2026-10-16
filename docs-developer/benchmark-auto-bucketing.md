# Automatic bucketing for benchmark comparisons

An exploration of whether the buckets in the benchmark compare view can be
chosen automatically from the call tree instead of by hand-annotating functions
as `relevantForJS`, and whether that choice can be driven by which grouping
actually resolves a statistically significant difference.

The synthetic examples are reproduced by:

```sh
node docs-developer/auto-bucketing-prototype.mjs
```

The prototype is self-contained and seeded, so its numbers are stable. To run it
against a real profile pair (§5, Example 5), dump the call subtree below one
bucket first:

```sh
yarn build-node-tools
node node-tools-dist/dump-bucket-subtree.js \
  --base base.jslb.gz --new new.jslb.gz \
  --suite React-Complex --bucket "Update style" \
  --depth 3 --minShare 0.02 --out /tmp/subtree.json
node docs-developer/auto-bucketing-prototype.mjs --tree /tmp/subtree.json
```

Real-profile measurements are noted as such throughout, and were taken on the
Speedometer 3 pair from the benchmark compare view's motivating comparison (two
try pushes, 20 browser runs × 10 iterations each). The structural counts and the
intraclass correlations in §6 came from one-off instrumentation that is not kept
in the tree; §6 says precisely what was computed so they can be re-derived.

## 1. What the current scheme really is

[`computeJsOnlySampleBuckets`](../src/profile-logic/benchmark/extract-benchmark-stats.ts)
assigns each sample to the deepest frame on its stack whose func is `isJS` or
`relevantForJS`. Written differently: given a set `S` of funcs, a sample's bucket
is its nearest ancestor-or-self in `S`.

That is worth stating explicitly, because it means the current design is already
the general one, just with a hand-picked `S`:

- **Buckets partition the samples.** Every sample lands in exactly one bucket.
- **Therefore per-iteration weights add, and so do mean differences.**
  `Σ_buckets Δ = Δ_total`, exactly. This is what lets the UI present a bucket
  list as a _budget_ for the score change, and it is the single most valuable
  property in the whole design. Any automatic scheme has to keep it.
- **Recursion is handled for free.** If `f` calls itself, the deepest `f` frame
  is still `f`, so all of `f`'s self time lands in bucket `f` regardless of
  depth.

So "automatic bucketing" is not a new mechanism. It is: **choose `S`
automatically**, and let `S` contain call-tree nodes (call paths) rather than
only funcs, so a func can be split by context where that helps.

## 2. The two dimensions, and what each is for

The awkwardness the problem has is real, and it helps to name the two axes
separately because they do different jobs:

|                    | what it is                               | what it gives you                                        |
| ------------------ | ---------------------------------------- | -------------------------------------------------------- |
| **Iteration axis** | 200 per-iteration weight totals per side | the _replication_ — all variance estimates, all p-values |
| **Tree axis**      | stacks aggregated into a tree            | the _candidate space_ — which groupings you may propose  |

A candidate bucket is a **set of tree nodes**; its data is one vector per side,
length 200. All statistics live on the iteration axis; the tree axis only
proposes candidates. Keeping this separation straight resolves most of the
traps:

- **Nested candidates are not independent hypotheses.** `subtree(v)` and
  `subtree(parent(v))` are largely the same samples. Testing both and reporting
  both as findings double-counts. The fix is to only ever _report_ a partition,
  even though the search _considers_ nested candidates.
- **"Total time of a subtree" is ill-defined under recursion.** If `f` appears at
  depths 3 and 7, `subtree(f@3)` contains `subtree(f@7)`. Summing per-occurrence
  subtree totals over-counts; in the prototype's recursion example it
  over-counts by **3.4×**. Defining bucket membership by _nearest_ split
  ancestor makes this impossible by construction.
- **The iteration axis has its own structure**, and it needs checking rather
  than assuming — see §6.

## 3. The statistical core

### 3.1 Test the mean difference, and get the null by permutation

The comparison used Mann-Whitney U when this was written. For per-iteration
bucket weights that is the wrong tool, for a concrete reason: the weights are
small integers (a function accounts for 0, 1 or 2 samples in an iteration), so
base and new tie on 13–44% of all pairs in real data. Rank statistics are then
dominated by tie handling, which is exactly how the geomean-normalised global
view came to report 75 phantom effects, none of which survived a correct
normalisation. This section is now implemented for the fixed-bucket comparison
too — see [§9](#what-step-1-turned-into).

Use the **mean difference** instead:

- It is the quantity that adds up across a partition, so it is the same number
  the budget column shows.
- Its null distribution comes from **permuting iteration labels**, so no
  normality or continuity is assumed and ties are a non-issue.
- Permuting _whole iterations jointly across all nodes_ preserves the
  correlation between nodes, which matters precisely because nested candidates
  are the same samples.

Use a Welch `t = Δ / se` as the search criterion (it is cheap and monotone in
detectability) and permutation for every threshold.

### 3.2 Why splitting a bucket can help: variance adds, means add

Take a bucket `B` split into disjoint parts `C` and `R`. Per-iteration vectors
add, so:

```
Δ_B  = Δ_C + Δ_R
Var(B) = Var(C) + Var(R) + 2·Cov(C, R)
```

Two regimes follow, and they are exactly the two the problem statement
describes:

- **The change lives in `C`.** Then `Δ_R ≈ 0` and `Δ_C ≈ Δ_B`, but `sd(C) <
sd(B)`, so `|t_C| > |t_B|`. The "Style improved but only one part of it did"
  case.
- **`C` is variance with no change in it.** Then `Δ_R = Δ_B` while `sd(R) <
sd(B)`, so `|t_R| > |t_B|`. The GC / janitor case: splitting it off removes
  variance without removing signal.

Both are captured by one criterion:

```
gain(B → C, R) = max(|t_C|, |t_R|) − |t_B|
```

Split when the gain is positive and large enough to have not come from the
search itself. There is no need for separate "find the improvement" and "isolate
the noise" heuristics; they are the same inequality read in two directions.

### 3.3 Why splitting must be paid for: the search is a multiple test

This is where a naive version of this idea goes wrong, and it goes wrong badly.
With 12 sibling children and **no real difference anywhere**, splitting on any
positive gain and judging buckets at the nominal `|t| > 1.96` reports a
"significant" bucket in **62% of trials** (prototype, Example 3). The search
finds a lucky partition of noise essentially every time.

Calibrate the whole procedure by permutation, in two passes:

1. **`gainCrit`** — permute labels, record the best gain the search _would_ have
   taken. Its 95th percentile is how much gain pure noise supplies. Splits at or
   below it are not real.
2. **`tCrit`** — permute again, run the full search with `gainCrit` in place, and
   record `max |t|` over the resulting buckets. Its 95th percentile controls the
   family-wise error across everything the search looked at.

That brings the false-positive rate to **6%** against a 5% target, on the same
data where the naive version was at 62%.

This is the same construction as cluster-based permutation inference on a
spatially structured statistic map (Nichols & Holmes 2002; Maris & Oostenveld
2007), with tree nodes in place of voxels and subtrees in place of clusters. The
analogy is worth keeping in mind because that literature has already worked out
the failure modes.

A note on what does _not_ fit: hierarchical testing with inheritance
(Meinshausen 2008) only descends into a node whose parent was rejected. It is a
natural fit for call trees and it is the wrong procedure here, because the
motivating case is a parent that is _not_ significant containing a child that
is. Plain BH-FDR across all nodes is also a poor fit, because it treats nested
nodes as independent hypotheses when their nesting is the whole point.

### 3.4 Improved / unchanged / noisy needs a fourth label, and a number

"Unchanged" and "we could not tell" are different answers, and conflating them
is how a perf tool misleads people. The separator is the **minimum detectable
effect**, `MDE = tCrit · se`: the smallest shift this bucket could have shown
while still clearing the calibrated bar.

| verdict              | condition                                     | meaning                                                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| improved / regressed | `\|t\| > tCrit`                               | the bucket moved                                                         |
| immaterial           | bucket and MDE both below a materiality floor | too small to matter either way                                           |
| unchanged            | `MDE ≤ tolerance · mean`                      | we had the power to see a change worth caring about, and it is not there |
| unresolved (noisy)   | otherwise                                     | the only honest output is the MDE                                        |

Reporting the MDE turns "no significant change" from a non-answer into a
quantitative one: _"Update style did not move, and we could have seen 0.93 ms."_
Two shape statistics make the noisy verdicts legible — the fraction of
iterations with zero weight, and the share of the total carried by the heaviest
5% of iterations. Threshold-triggered janitor work scores high on both (87% and
45% in the prototype's Example 2).

## 4. The algorithm

```
Input: merged call tree; per node, self weight per iteration, per side.

1. Prune nodes below a weight floor, folding their weight into the parent's
   self so the partition stays exact.
2. Collapse direct recursion when forming node keys (§5, Example 4).
3. Calibrate gainCrit and tCrit by permutation (§3.3).
4. Greedy refinement, starting from one bucket for the whole tree:
     repeat:
       for every node v not already a split point:
         C = { u in subtree(v) : bucket(u) == bucket(v) }
         R = bucket(v) \ C
         gain = max(|t_C|, |t_R|) − |t_bucket(v)|
       apply the best split if gain > gainCrit
5. Label each final bucket (§3.4), and report Σ Δ against the total as a check.
```

Cost is `O(nodes² · iterations)` per greedy step if written naively, which the
prototype does because it is a prototype. In production: accumulate subtree sums
once per step in a single post-order pass (`O(nodes · iterations)`), keep the
per-node vectors sparse (most nodes have weight in few iterations), and reuse
one permutation set across all buckets. The weight floor does most of the work —
a node holding 20 samples out of 200 iterations cannot be individually
actionable no matter what the statistics say.

## 5. Demonstrations

Prototype output, lightly trimmed.

### Example 1 — a bucket too big hides the change inside it

`Update style` contains a part that improved 8.0 → 6.8 ms and a quiet-looking
part that did not change but is seven times noisier.

```
whole tree: base=19.56 new=18.57 delta=-0.98 (-5.0%) |t|=1.46  [gainCrit=1.28 tCrit=2.26]
  -> as one bucket: NOT detectable
  split "RestyleRules" out of "Update style": |t| 1.46 -> split-off 11.31, remainder 0.36 (gain 9.85)

bucket                     base     new   delta    |t|    MDE  zero%  top5%  verdict
Update style              11.53   11.76    0.23   0.36   1.46      6     11  unresolved (noisy)
  RestyleRules             8.04    6.82   -1.22  11.31   0.24      0      7  improved
sum of bucket deltas = -0.985, whole-tree delta = -0.985
```

A 5% improvement is invisible as one bucket (`|t| = 1.46` against a bar of
2.26). Split, and the responsible part reads `|t| = 11.31`. The remainder is
correctly labelled _unresolved_ rather than _unchanged_: its MDE is 1.46 ms,
13% of itself, so nothing can be claimed about it.

### Example 2 — intermittent work drowns a real change

`work` improved 4%; `janitorGC` fires in about one iteration in eight at ~40 ms
and is identical on both sides.

```
whole tree: base=34.51 new=34.74 delta=0.23 (0.7%) |t|=0.17  [gainCrit=1.53 tCrit=2.16]
  -> as one bucket: NOT detectable

bucket                     base     new   delta    |t|    MDE  zero%  top5%  verdict
runIteration               4.55    5.95    1.40   1.02   2.97     87     45  unresolved (noisy)
  work                    29.96   28.80   -1.16  13.37   0.19      0      5  improved
```

The janitor contributes no signal and nearly all the variance; as one bucket the
whole thing reads `|t| = 0.17` and even has the wrong sign, because 200
iterations is not enough to pin down the mean of a process that fires 25 times.
Split it off and the 4% improvement is unmistakable. Note the shape columns:
87% of iterations have zero janitor weight and 45% of its total is in the
heaviest 5% of iterations — that is what "should be its own bucket" looks like
numerically.

### Example 3 — the trap

Covered in §3.3: 62% false-positive rate naive, 6% calibrated.

### Example 4 — recursion

A recursive function whose self time decays geometrically over 12 depths, with
every depth improving by the same 4% and every depth equally noisy in relative
terms.

```
  total weight actually present: 9026; sum of per-occurrence subtree totals: 30807 (3.4x over-counted)
  one bucket per depth: |t| = 2.9 1.4 1.8 0.9 2.4 1.3 2.8 1.4 1.6 2.9 0.8 0.0
    max per-depth |t| = 2.92, depths clearing 1.96: 4/12
  collapsed into one bucket: base=23.22 new=21.91 delta=-1.31 |t|=5.51
  calibrated tCrit: 2.48 with 12 per-depth nodes, 2.08 with 1 collapsed node
```

Three separate problems, all fixed by collapsing:

1. Per-occurrence subtree totals over-count by 3.4×.
2. Splitting by depth divides the signal but not the _relative_ noise, so every
   fragment sits near the noise floor. The true per-depth `|t|` is about 1.6 at
   every depth; four cross 1.96 by luck, eight do not, and the output would
   claim the same function both improved and did not, eleven times over.
3. The extra candidates raise the calibrated bar (2.48 vs 2.08), so
   fragmentation is penalised twice.

Collapsed, it is one bucket at `|t| = 5.51` against a bar of 2.08.

Real data confirms this matters: below the `Update style` label there are 5121
distinct leaf funcs at depths up to **252**, much of it recursive style-rule
teardown (`RuleNode::drop_without_free_list`). Any scheme that keys buckets on
call paths must collapse recursion first.

### Example 6 — noise that is not a subtree

Machine noise, thermal drift, an unlucky GC schedule: these move many unrelated
nodes in the _same iteration_, so no split can isolate them, and every bucket
pays for them in its denominator. Eight sibling nodes, one improved by 3%, every
iteration scaled by a shared factor with sd 15% drawn identically for both
sides:

```
node                delta   |t| raw  beta adj   |t| adj
  hot (improved 3%) -0.22      1.49     -0.28      6.21
  sibling1..7       ~0.06   0.1-0.7    ~0.05   0.1-2.1
  calibrated cutoff: raw 2.26, adjusted 2.85
  the improved node: raw 1.49 -> MISSED;  adjusted 6.21 -> detected
  unchanged siblings falsely flagged: raw 0/7, adjusted 0/7
```

The fix is to regress each bucket on a covariate measuring the shared wobble and
test the group coefficient: `y = α + β·isNew + γ·f`.

**The obvious choice of `f` does not work, and fails instructively.** Taking the
leading principal component of the (node × iteration) residual matrix and
projecting it out is the natural move — it is what surrogate variable analysis
does for gene expression. But residuals taken around each _group's_ mean have
zero mean within each group by construction, so the component recovered cannot
explain any part of the base/new difference. Projecting it out shrinks every
bucket's variance while leaving the factor's contribution to the mean difference
untouched. The null inflates instead of the signal: measured on this data, the
calibrated cutoff went from 2.26 to **8.87** and nothing became detectable.

A **leave-one-out total** works: for bucket `B`, use `(everything − B)` as `f`.
It carries the shared factor including its between-group part, and it cannot
contain `B`'s own signal, so it is not circular. That is the run above.

Caveat worth flagging: `β̂` from a per-bucket design is no longer exactly
additive across buckets. Keep the unadjusted `Δ` for the budget column and use
the adjusted statistic only for the verdict.

### Example 5 — real data

Running the algorithm on the actual profile pair, on the subtree below a label,
depth 4, 1% weight floor:

| suite         | bucket        | base ms | \|t\| | tCrit | splits | verdict              |
| ------------- | ------------- | ------- | ----- | ----- | ------ | -------------------- |
| React-Complex | Update style  | 2.79    | 1.01  | 2.35  | none   | unresolved, MDE 0.29 |
| NewsSite-Next | Update style  | 31.75   | 0.28  | 2.23  | none   | unchanged, MDE 0.93  |
| React-Complex | Update layout | 1.55    | 0.21  | 2.52  | none   | unresolved, MDE 0.18 |
| Angular       | Update style  | 2.87    | 1.32  | 2.27  | none   | unresolved, MDE 0.27 |
| React-Redux   | GC / CC       | 0.04    | 0.91  | 2.29  | none   | immaterial           |

No split is warranted in any of them. That is the right answer, not a
disappointing one: these two builds were already indistinguishable at subtest
level, and after the shared-factor fix only 1 of 6803 buckets clears the effect
threshold. A method whose first act on this data was to produce a list of
"significant" sub-buckets would be wrong. The synthetic examples are where the
method is validated against known ground truth; the real data is where it is
checked for not inventing things.

## 6. Real-profile measurements worth knowing

**The 200 iterations really are ~200 replicates.** I expected clustering:
iterations come in 20 browser runs of 10 (recoverable from the ~25 s gaps
between suite markers at iteration indices 9, 19, …, 189), and iterations within
a run share a process, a JIT state and a heap, so treating them as independent
would overstate power by up to √10. Measured intraclass correlation by run, on
per-suite scores: between **−0.08 and +0.14**, i.e. indistinguishable from zero.
Per-iteration and per-run p-values agree closely (Svelte 1.7e-1 vs 1.3e-1;
Backbone 2.3e-1 vs 1.2e-1). **No clustering correction is needed.** This was
measured on suite totals for one profile pair, so it is worth re-checking for
individual buckets and for JIT-related buckets in particular, where per-run
warmup is plausible.

**There is plenty of structure to bucket into.** 331 non-JS label buckets
currently exist, dominated by `Update layout` (26593), `Update style` (25567),
`set Element.innerHTML` (11103) and `Paint` (10820). Below them the native tree
is fully present: 5121 distinct leaf funcs under `Update style`, 3748 under
`Update layout`, depths to 252.

**Some existing labels are already too coarse in the way the problem statement
predicts.** `GC / CC` has `SnowWhiteKiller::Visit` and purple-buffer traversal
as its top leaves — it is conflating cycle collection with garbage collection.
Those are different mechanisms with different trigger dynamics and there is no
reason for them to share a bucket.

## 7. Other approaches considered

- **Correlation-based grouping instead of tree-based.** Cluster nodes by the
  correlation of their per-iteration residuals; nodes that co-vary belong to the
  same mechanism even when they are scattered across the tree. This is the
  natural complement to §5's Example 6 and can express buckets the tree cannot.
  It breaks the partition-additivity property unless the clusters are made
  disjoint, so it fits better as a _diagnostic_ ("these 40 nodes move together,
  and here is the factor") than as the bucketing itself.
- **Segmenting the timeline instead of the tree.** Detect the iterations in
  which janitor work fired and treat that as a covariate, rather than splitting
  the tree. Equivalent in the simple case and better when the trigger is not
  attributable to a subtree at all. Example 6 is this idea in its general form.
- **Interleaving the two builds within one run.** Not an analysis change, but by
  far the largest available power gain and much cheaper than any of the above:
  it converts machine-level and thermal variation from between-group noise into
  within-block noise. If the harness can be made to alternate builds, do that
  before investing in Example 6's machinery.

## 8. Limitations

- Greedy refinement is myopic. It cannot find a split that only pays off in
  combination with a second one (two children that changed in opposite
  directions look flat together and neither is individually the best first
  split). A small beam search would help; whether that matters in practice is
  untested.
- Mutual recursion (`f → g → f`) is not collapsed by the direct-recursion rule.
  Proper handling needs cycle collapsing on the call graph.
- Cross-profile node matching for native frames is name-based, so inlining
  changes between builds will silently split or merge nodes. JS funcs already
  have the source-location key; native frames need an equivalent, and
  differences in symbolication between the two builds are a real hazard.
- Calibration is per bucket tree. Scanning all 331 label buckets and reporting
  the best findings re-inflates multiplicity across buckets; that outer loop
  needs its own correction.
- `tCrit` for step _k_ of the greedy is approximated by the step-0 null. This is
  the least principled part of the construction.

## 9. Suggested order of work

1. ~~**Replace Mann-Whitney with a permutation test on the mean difference, and
   add an MDE column.**~~ **Done**, for the existing fixed-bucket comparison —
   see below.
2. **Collapse direct recursion when forming bucket keys.** Cheap, and Example 4
   shows it is worth real power.
3. **Split `GC / CC`**, and audit the other coarse labels by hand. Zero new
   machinery.
4. **One level of automatic splitting under a label, permutation-calibrated.**
   The whole of §4, but limited to depth 1 and to labels above a weight floor,
   so the candidate space stays small and the calibration stays cheap.
5. **Interleaved A/B runs in the harness**, if that is reachable — it dominates
   everything above.
6. Shared-factor adjustment (Example 6) last: it is the most powerful and the
   most delicate, and its failure mode is silent.

### What step 1 turned into

Applied to the existing fixed-bucket comparison, not only to the automatic
scheme: the tie fragility was measured _there_, so that is where it had to be
fixed. Mann-Whitney U and Cliff's delta are gone from
[perf-compare-stats.ts](../src/profile-logic/benchmark/perf-compare-stats.ts),
replaced by Welch's t on the per-iteration mean difference, with:

- **p-values from permutation** where the verdict could turn on it — any bucket
  whose Welch p is below 0.25, plus sparse buckets (zero in more than half their
  iterations, where a t-distribution p-value is not trustworthy however large
  the sample looks) up to a p of 0.5. One set of relabellings is shared by every
  bucket, so their p-values are comparable. The CLI marks Welch-approximated
  rows with `~`.
- **Sequential stopping** (Besag & Clifford 1991): draw until 20 relabellings
  come out at least as extreme, then report hits/draws. Necessary, not merely
  nice — the naive version took **37.6 s** on one profile pair, and this brings
  it to **0.3 s**. Most buckets settle in well under a hundred draws; only real
  candidates run the full 1999.
- **Cohen's d** in place of Cliff's delta for the effect-size filter, whose
  0.2/0.5/0.8 cut points sit close to the 0.15/0.33/0.47 they replace.
- **An MDE column** in both the UI and the CLI.

What it did not fix is multiplicity: ~6800 buckets each get an uncorrected
p-value, so `p ≤ 0.05` on one row means little. The UI's default filter leans on
an impact floor to keep that in check rather than correcting for it. See
[benchmark-compare-fdr.md](benchmark-compare-fdr.md), which also lists the two
profile pairs used throughout this report.

Two things worth knowing about the switch. First, it makes the shared-factor bug
that motivated all of this far less dangerous: a mismatched rescale now biases
the point estimate smoothly, in proportion to the drift, instead of moving
Cliff's delta by the tied-pair fraction. The shared factor is still correct and
still needed, but its failure mode is no longer explosive. Second, writing the
tests turned up a bug the switch would otherwise have introduced: a bucket with
zero spread on both sides but different means — an _appeared_ or _disappeared_
bucket, base weight 0 in every iteration and nonzero in every one of the new
ones — has `se == 0`, and the obvious `se > 0 ? delta / se : 0` guard reports the
most clear-cut change in the profile as no change at all. It now yields ±∞.
