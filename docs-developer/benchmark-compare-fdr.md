# Multiple comparisons in the benchmark compare view

The benchmark compare view tests ~6800 buckets in the global view and ~120 to
~800 in each of the 20 subtest views. Every one of them gets a p-value, so
"p ≤ 0.05" on a single row means very little on its own: on a profile pair with
no difference detectable at subtest level, 133 global buckets clear it.

This is now corrected. Each table reports a **q-value** — the share of the rows
at least that extreme which are expected to be noise — and the UI filters on it
instead of on the raw p-value. On the same no-difference pair, zero buckets
survive.

The route there is not the obvious one, and the reason is worth reading before
changing any of it.

## Why Benjamini-Hochberg does not work here

BH at q ≤ 0.05 rejects the k-th smallest p-value when `p_k ≤ 0.05 · k / n`. With
n = 6798 the smallest p-value has to be under `0.05 / 6798 = 7.4e-6` to reject
anything at all.

The permutation p-values are floored at `1 / (PERMUTATION_COUNT + 1) = 5.0e-4`,
about 68× too coarse. BH therefore rejects **nothing** — including
`CanvasRenderingContext2D.stroke`, which moved +73% with a Cohen's d of 1.00 and
is not in any doubt. This was verified by prototyping BH over both reference
pairs: zero survivors in each. The floor, not the evidence, is the binding
constraint.

Raising `PERMUTATION_COUNT` to fix that is the wrong move. Resolving a p-value of
7.4e-6 needs on the order of 136000 relabellings for the single best bucket, and
the sparse buckets cannot get there at any count: a bucket that is nonzero in 8
of 200 iterations has a genuinely coarse permutation null, and no number of draws
makes its p-value smaller than the discreteness allows.

## What is implemented instead

`computeFamilyCorrection` in
[perf-compare-stats.ts](../src/profile-logic/benchmark/perf-compare-stats.ts).

The observation that unlocks it: FDR control does not need per-bucket p-values.
It needs `E[V(c)]`, the number of _buckets_ expected to clear a threshold `c` by
chance — a quantity about the family, not about any one bucket. So estimate that
directly, by relabelling the iterations of every bucket at once and counting how
many buckets clear `c` in each draw:

```
V̂(c) = mean over draws of  #{buckets with |t| ≥ c}
R(c) = #{buckets with observed |t| ≥ c}
FDR(c) = V̂(c) / R(c)
q(bucket) = min over c ≤ |t_bucket| of FDR(c)
```

This is SAM (Tusher, Tibshirani & Chu 2001) with Storey & Tibshirani's q-value.
Three things fall out of it:

- **The floor problem disappears.** `V̂` pools `memberCount × drawCount` null
  statistics — 13.6 million for the global view — so its resolution is one null
  exceedance in the whole pooled set, not one in `drawCount`.
- **Dependence is handled by construction.** The buckets partition the same
  samples, so they are negatively correlated, and BH's positive-regression-
  dependence condition does not obviously hold. Relabelling all buckets jointly
  reproduces whatever dependence exists in every draw, so the question does not
  arise. This is the same idea as the max-statistic calibration in
  [§3.3 of the bucketing report](benchmark-auto-bucketing.md).
- **The buckets need not be alike.** `V̂` estimates `Σ_b P(|t_b| ≥ c)` term by
  term. Sparse buckets with heavy null tails contribute their own heavier terms,
  so their discreteness is priced into the FDR rather than having to be
  special-cased.

Alongside the q-value, the same pass produces a **Westfall-Young single-step
FWER-adjusted p-value** from the distribution of `max |t|` across the family —
exact under arbitrary dependence, and essentially free once the null values are
being computed. It is the stricter reading, for answering "is there anything here
at all" rather than "which rows".

### Choices made, and what would change them

- **π₀ is assumed to be 1.** The usual Storey refinement would sharpen the
  estimate, but with a handful of real movers among thousands of buckets π₀ is
  within a rounding error of 1, and assuming it errs conservative. Not worth the
  extra assumption unless a use case appears where the real movers are a large
  fraction of the family.
- **The statistic is a shared |t| threshold**, not each bucket's own p-value.
  That holds a sparse bucket and a dense one to the same bar even though the
  sparse one has the heavier null tail, which costs the dense buckets a little
  power. It does not cost validity, for the reason above. Fixing it would mean
  going back through per-bucket p-values, which is where the floor lives.
- **The family is one table.** The global view is corrected against the global
  view and each subtest against itself. Those 21 tables overlap — they are
  hypotheses about the same samples, so a bucket appearing in several has had
  several chances. Correcting across all of them at once is the conservative
  reading, but it would mean that opening a subtest table changed the numbers in
  it, which is a worse property than the error it fixes.
- **The 20 subtest scores get plain Benjamini-Hochberg**, in
  `applyBenjaminiHochberg`. A family of 20 is small enough for it: rank 1 needs
  only `0.05 / 20 = 2.5e-3`, comfortably above the permutation floor, where the
  6798-bucket table needed `7.4e-6` and could not get there. No joint relabelling,
  no q-value machinery — the standard procedure is correct here.
- **The overall score is not corrected**, and `qValue` stays null on it. It is the
  one hypothesis the developer came to ask about, stated before any data was seen:
  "did my patch move the score". Correcting it for the company of 20 subtests
  would answer a question nobody asked, and would make the headline number harder
  to clear the more subtests the benchmark happens to have.

### The MDE had to move with it

`MDE = tCrit · se` is defined as the smallest change a row could have shown and
still been reported. Changing what "reported" means changes the MDE, and it is
easy to miss: the column keeps rendering a plausible number while quietly
promising a sensitivity the table no longer has, and the tooltip's "so this
really did not move" becomes an overclaim on every quiet row.

So a bucket's `tCrit` is now the family's critical |t| rather than the
uncorrected `studentTCritical(df, 0.05)`. On the reference pairs that is about
2.1× larger — `CanvasRenderingContext2D.arc` reads ±0.44 instead of ±0.21, and
its Δ of −0.49 now sits just above its bar rather than looking twice clear of it,
which matches its q of 2.0e-3.

The bar used is the **family-wise** critical |t|, not one read off the FDR curve,
for two reasons. It is always defined: on a comparison with nothing in it,
nothing on the observed grid reaches q ≤ 0.05, so an FDR-derived bar would come
out infinite for every row of exactly the tables an MDE is most needed for. And
it is the right question anyway — an MDE asks what a row would have needed _on
its own_, and for a lone row the two bars nearly coincide, since `V̂(c) =
E[#exceedances]` and `P(#exceedances ≥ 1)` agree to first order once exceedances
are rare. Where a table has other discoveries to share the error budget with, the
FDR bar is genuinely lower and this errs conservative.

The subtest scores needed the same treatment, and this is easy to miss twice: the
first version of this work corrected the bucket MDEs and left the subtest ones
alone, and `Perf-Dashboard` then reported "no change" while showing Δ = −1.83
against an MDE of ±1.52 — a row that had moved by more than the smallest change it
claimed it could see. Their bar is `alpha / n`, which is BH's own rank-1
threshold. Only the overall score keeps the uncorrected MDE, because only it is
judged on an uncorrected p-value.

So `ComparisonStats.mde` means "the bar that applies to this row", which differs
by row type and, for buckets, by view.

One thing **not** to assert about it, tempting though it is: that every reported
row has moved by at least its own MDE. It does not follow. The MDE is what a row
would have needed _on its own_, while both FDR and BH reject the k-th best row on
a looser threshold than the first — so a row found alongside other genuine movers
can be reported on a shared error budget and still come in just under its own bar.
A test asserted this invariant and passed by luck on the data it used; it now
asserts what actually holds, which is that every bucket in one table divides out
to the same critical |t|.

### Saying it in words, for the person who actually asks

The reader is usually a developer with a try push with and without their patch,
asking "did I change anything, and did I make anything worse". They may have no
statistics background at all, so every row now carries a **verdict** —
`classifyChange` — and there are four of them, not three:

| verdict      | means                                                         |
| ------------ | ------------------------------------------------------------- |
| `slower`     | moved, in the bad direction (weight is time, so up is slower) |
| `faster`     | moved, in the good direction                                  |
| `unchanged`  | a change worth caring about would have shown up, and did not  |
| `unresolved` | this comparison could not have seen one either way            |

The fourth is the whole point. "Nothing changed" and "we could not tell" are
different answers and running them together is how a performance tool tells
somebody their patch is fine when it has no idea. The separator is the MDE against
`RESOLUTION_TOLERANCE` (2% of the row's own size, chosen against the measured
1.8%–4.3% spread of subtest MDEs).

On the reference pairs this is bracing: at 20 runs × 10 iterations most subtests
read "can't tell", and only the overall score and the two tightest subtests can
say "no change". That is the honest reading, and it is more useful than the old
output — which labelled every subtest "Negligible" on a Cohen's d, including
`Perf-Dashboard` at a real −2.27%. A developer who reads "can't tell" knows to go
to the bucket tables, which pool across suites and do find things, or to push more
runs. A developer who read "Negligible" learned nothing and was misled.

The same reasoning removed effect size from the styling. Cohen's d divides by the
row's own spread, so emphasis-by-d highlighted whichever rows happened to be quiet
rather than whichever ones moved the benchmark, and nothing tied it to
significance — a bucket could render bold on a large d with its q-value at 1.0.
Weight now tracks impact on the overall score and colour tracks confidence, which
are the two questions being asked and are properly independent of each other.

### Cost

Affordable only because the pooled values are stored sparsely: most buckets are
zero in most iterations, so each of the 13.6 million null evaluations walks a
handful of nonzeros rather than 400 entries. Measured end to end on the CLI
(pair B, including ~0.25s of JSON parsing):

| run                      | before | after |
| ------------------------ | ------ | ----- |
| global view only         | 0.32s  | 2.25s |
| global + all 20 subtests | 0.60s  | 5.20s |

So about 4.6s of added compute for the full 21-table analysis. The UI does this
behind its existing spinner, after downloading and parsing two ~39 MB profiles,
which dominates.

Each bucket's own p-value comes out of the same pass, for one extra comparison per
null value. That is not just a saving. A separate pass could not afford to relabel
_every_ bucket, so it spent relabellings only on the ones that might change
verdict — three tuning constants' worth of prefilter — and left everything else on
a Welch p-value that is not trustworthy for a bucket whose weight is zero in most
iterations. Now every bucket has an exact permutation p-value and the prefilter is
gone. On the reference pairs the uncorrected count shifts a little as a result
(141 → 146 on pair B, 133 → 123 on pair A), which is the approximation being
replaced rather than anything changing.

The family pass reuses the same 1999 relabellings. It does not need nearly that
many — `V̂` pools over thousands of buckets, so a few hundred draws would estimate
it about as well and would cut the cost roughly fourfold. Sharing one set is
simpler and the cost is not currently a problem; that is the knob to reach for if
it becomes one.

For comparison, the alternative the floor problem seemed to demand — escalating
`PERMUTATION_COUNT` to ~136000 for the top buckets — is ~70× a full pass _per
bucket_.

## What the numbers look like

Measured on the two reference pairs below, `--top` output from the CLI.

**Pair A, the negative control.** 21 tables, ~15000 hypotheses:

| view            | buckets | p ≤ 0.05 | q ≤ 0.05 | FWER ≤ 0.05 |
| --------------- | ------- | -------- | -------- | ----------- |
| global          | 6803    | 133      | 0        | 0           |
| all 20 subtests | 8279    | 155      | 1        | 1           |

The one survivor is a function that went from 0.04ms to 0.15ms in NewsSite-Next
— 0.0039% of the overall score, below the materiality floor, and quite possibly
a real difference between the two CI runs rather than an error.

**Pair B, a real change in canvas drawing.** Global view, 6798 buckets, 141 at
p ≤ 0.05:

| bucket                            | Δ     | Δ% overall | q      | pFWER  |
| --------------------------------- | ----- | ---------- | ------ | ------ |
| `CanvasRenderingContext2D.stroke` | +1.40 | +0.140%    | 2.5e-4 | 5.0e-4 |
| `CanvasRenderingContext2D.fill`   | −1.28 | −0.128%    | 2.5e-4 | 5.0e-4 |
| `CanvasRenderingContext2D.arc`    | −0.49 | −0.049%    | 2.0e-3 | 6.0e-3 |

The same three dominate the Charts-chartjs expansion, and Perf-Dashboard
independently turns up `fill` and `beginPath`. One coherent story, found in three
places.

**`HTMLElement.click` does not survive**, and that is the honest answer rather
than a failure. It is the largest absolute contributor in pair B (−1.16, −0.116%
of the score) but its p-value is only 1.6e-2, because it is a 21ms bucket with
proportionally large run-to-run spread. `V̂` at that threshold is ~110 against
R = 141, so q ≈ 0.8: at a bar that admits it, four rows in five would be noise.
Shrinking the family is the only thing that would recover it — see "a
permutation-invariant screen" below.

## What the impact floor is for now

`MIN_SCORE_IMPACT` in
[BenchmarkCompareViewer.tsx](../src/components/app/BenchmarkCompareViewer.tsx)
used to be the _only_ defence against ~340 expected false positives, which took a
threshold (0.04% of the overall score) high enough to also hide real small
changes. With FDR doing the error control it is back to its proper job —
materiality — and has dropped an order of magnitude, to **0.01%**.

It is still needed. Both pairs produce rows that are statistically solid and
completely immaterial: a function appearing at 0.06ms, another going 0.04 → 0.15.
An inlining change that splits or renames functions could produce dozens of them
at once, all real. Error control and materiality are different questions and the
UI asks both.

The two thresholds sit in a wide gap rather than on a tuned edge. Across both
reference pairs, the q ≤ 0.05 rows that fall _below_ the floor are at 0.0039%
(pair A's lone survivor) and 0.0066% (`window.qsa` in pair B's ES5 view); the
ones _above_ it start at 0.0298%. Anywhere from 0.008% to 0.02% would give the
same answer on this evidence.

## What is left

- **Correct the 20 subtest score rows.** BH works there (n = 20, no floor
  problem). Small, self-contained, and it would stop `NewsSite-Nuxt` at p = 0.03
  reading the same as a subtest that really moved.
- **A permutation-invariant screen on the family.** Restricting the family to
  buckets whose _pooled_ weight is large enough to matter is legitimate — pooled
  weight is unchanged by relabelling, so the null is not disturbed (Bourgon et
  al. 2010) — and it would shrink n by roughly an order of magnitude, buying
  power for borderline rows. It would not rescue `HTMLElement.click` (at n ≈ 500
  its q is still ≈ 0.4), so it is a refinement rather than a fix, and it adds a
  tuning knob. Measure before adding it.
- **Storey's π₀.** Only worth it if a use case appears with many real movers.

## Test profiles

Two pairs of Speedometer 3 profiles from Firefox CI, each 20 browser runs × 10
iterations, ~39 MB gzipped. Fetch with:

```sh
TASK=U17Ba7fhRqmehH_VQeEp3w
curl -L -o base.jslb.gz \
  "https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/$TASK/runs/0/artifacts/public/test_info/profile_speedometer3_compact.jslb.gz"
```

| pair | role             | base task                | new task                 |
| ---- | ---------------- | ------------------------ | ------------------------ |
| A    | negative control | `U17Ba7fhRqmehH_VQeEp3w` | `OtZhWS5QQrqfMH9RvR6IKQ` |
| B    | real change      | `aMtf0V-ISGGKPhd05BphmA` | `VnqrcVeORJKwjVkIN0UTZg` |

For the CLI, which is much faster to iterate on than the UI:

```sh
yarn build-node-tools
node node-tools-dist/compare-benchmark-stats.js \
  --base base.jslb.gz --new new.jslb.gz --top 20
```

That is the whole thing — `--base` and `--new` take profiles as captured, and
`compare-benchmark-stats` extracts them itself. About 3.7s and 1.9 GB peak for the
Speedometer 3 pairs below, which fits inside Node's default heap; the
`--max-old-space-size=8192` this used to need was never necessary.

`extract-benchmark-stats` still exists and its output is still accepted on
`--base`/`--new`, which is worth it when iterating on the comparison rather than on
the profiles: extraction is the expensive half, so pre-extracting brings a re-run
down from 3.7s to 2.3s. Which kind of file was passed is detected rather than
declared — a profile is either gzipped or JSON without a `bucketNames` array.

```sh
node node-tools-dist/extract-benchmark-stats.js --input base.jslb.gz --output base-stats.json
node node-tools-dist/compare-benchmark-stats.js --base base-stats.json --new new.jslb.gz
node node-tools-dist/compare-benchmark-stats.js \
  --base base-stats.json --new new-stats.json --suite Charts-chartjs
# --suite "" for every subtest; --qvalue 0.2 to loosen the bar
```

Ready-to-paste UI links, with the dev server running (`yarn start`):

Pair A:

```
http://localhost:4242/compare-benchmark/?profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FU17Ba7fhRqmehH_VQeEp3w%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz&profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FOtZhWS5QQrqfMH9RvR6IKQ%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz
```

Pair B:

```
http://localhost:4242/compare-benchmark/?profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FaMtf0V-ISGGKPhd05BphmA%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz&profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FVnqrcVeORJKwjVkIN0UTZg%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz
```

### What each pair should tell you

**Pair A is the negative control.** Every subtest p-value is between 0.12 and
0.97 and the overall score moved −0.24% against an MDE of ±14.90, so there is
nothing here to find. Any method that reports a list of findings on pair A is
reporting noise.

Pair A also has history worth knowing. It is the pair that exposed a bug where
the geomean-normalised global view reported 75 "significant" buckets, none of
which were real: the two profiles' per-suite normalisation factors differed by
~0.1%, and while the comparison used Mann-Whitney U that tiny rescale broke the
exact-equality ties a rank statistic depends on, shifting Cliff's delta by the
tied-pair fraction. Both halves are fixed — shared normalisation factors, and no
rank statistic — but it is a good reminder that this data's failure modes are
silent and plausible-looking. If a change makes pair A produce a tidy list of
findings, that is the bug, not the feature.

**Pair B has a real, checkable change** in canvas drawing: work moved out of
`fill` and `arc` into `stroke`, concentrated in Charts-chartjs. At subtest level
only Perf-Dashboard (−2.27%) and NewsSite-Nuxt (+0.99%) clear p ≤ 0.05, so most
of this is invisible without per-bucket analysis. That is the case for doing this
work at all.

## Traps

Two that each cost a debugging cycle:

- **`se == 0` with different means.** A bucket that appeared or disappeared —
  base weight 0 in every iteration, new weight nonzero in every one — has zero
  spread on both sides. The natural `se > 0 ? delta / se : 0` guard reports the
  most clear-cut change in the profile as no change at all. `tStatistic` returns
  ±∞ for that case; keep it that way. In the family correction it works out
  correctly on its own: |t| is infinite for the observed labelling and finite for
  essentially every relabelling of a mixed pool, so the bucket lands at the floor
  of `1 / (drawCount + 1)`.
- **Cross-bucket floating point.** `permutationTwoSidedP` compares a bucket
  against its own relabellings, so a relative tolerance on one comparison is
  enough. The family correction compares one bucket's |t| against _other_
  buckets' null values, and |t| comes out of a subtraction of similar
  magnitudes — so multiplying every bucket by one shared constant (exactly what
  the geomean-normalised view does) moves each |t| by an ULP and reshuffles
  near-ties. Without a tolerance on the exceedance count, q shifted by a count or
  two. `COMPARISON_TOLERANCE` handles it; the residual sensitivity is confined to
  q ≈ 0.8, where hundreds of nulls are packed shoulder to shoulder and nothing is
  being claimed.

- **Quantiles of a tied distribution.** `criticalAbsT` is "the smallest |t| whose
  family-wise rate is within alpha", and the tempting implementation — index
  `ceil((1-alpha)·(draws+1))` into the sorted maxima — is wrong whenever that
  index lands part-way into a run of equal values. Equal maxima all carry the
  rate of the _first_ of them, so the named value's real rate is worse than
  alpha. Small-integer weights make such runs ordinary rather than exotic. Both
  this and a plain off-by-one in the same expression were found by mutation
  testing, not by reading; the reference test now pins the bar by its definition
  rather than by an index.

## Reading order

1. [benchmark-auto-bucketing.md](benchmark-auto-bucketing.md) §3.1 and §3.3 —
   why the mean difference rather than a rank test, and the permutation
   calibration machinery, including a worked case where searching over candidates
   produced a "significant" finding in 62% of trials on data with no difference
   in it.
2. `computeFamilyCorrection` in
   [perf-compare-stats.ts](../src/profile-logic/benchmark/perf-compare-stats.ts),
   and `permutationTwoSidedP` / `makePermutationBaseIndices` above it.
3. `applyFamilyCorrection` in
   [compare-benchmark-stats.ts](../src/profile-logic/benchmark/compare-benchmark-stats.ts)
   — where the family boundary is drawn.
4. [perf-compare-stats.test.ts](../src/test/unit/perf-compare-stats.test.ts) —
   the calibration tests, which are the properties to preserve: no discoveries on
   null families, real changes still found, q monotone in |t|, and invariance
   under a shared rescale.
