# Multiple comparisons in the benchmark compare view

Handoff notes for making the per-bucket p-values in the benchmark compare view
mean something across thousands of buckets. Written for someone picking this up
cold, so it includes the backstory and the profile pairs to test against.

The short version: there are ~6800 buckets in the global view and each one gets
an independent p-value with no multiplicity correction, so "p ≤ 0.05" on a single
row is close to meaningless. Benjamini-Hochberg is the obvious fix, it is already
prototyped, and it **does not work yet** for a reason that is worth understanding
before you start: the permutation p-values are floored at 5.0e-4, and BH needs
p ≤ 7.4e-6 to reject even the single best bucket.

## Where things stand

`compare-benchmark-stats.ts` compares two Speedometer 3 profiles bucket by
bucket. A "bucket" is the innermost `isJS`-or-`relevantForJS` function on a
sample's stack, so buckets partition the samples and their mean differences add
up to the total score change. There are ~6800 of them in the geomean-normalised
global view and ~7400 more across the 20 per-subtest views.

Each bucket carries per-iteration weights: 200 numbers per side (20 browser runs
× 10 iterations). The statistics live in
[perf-compare-stats.ts](../src/profile-logic/benchmark/perf-compare-stats.ts):

- **Welch's t on the mean difference**, not a rank test. Rank tests were tried
  and removed; see [§3.1 of the bucketing report](benchmark-auto-bucketing.md).
  The mean difference is also the additive quantity, so it is the number the
  budget columns show.
- **Permutation p-values** where the verdict could turn on it: any bucket with
  Welch p ≤ 0.25, plus sparse buckets (zero in more than half their iterations,
  where the t approximation is not trustworthy) up to p ≤ 0.5. Otherwise the
  Welch p is used, and the CLI marks those rows with `~`.
- **Sequential stopping** (Besag & Clifford 1991): draw relabellings until 20
  come out at least as extreme, then report hits/draws. Without this a comparison
  took 37.6 s; with it, 0.3 s. `PERMUTATION_COUNT` is 1999.
- **MDE** (`tCrit · se`) on every row, so a null result says whether the bucket
  did not move or could not be resolved.

The UI does not currently rely on an uncorrected p-value alone. Its default
filter requires `p ≤ 0.05` **and** an impact of at least 0.04% of the overall
score, and the impact floor is what keeps the row count sane — see
`MIN_SCORE_IMPACT` in
[BenchmarkCompareViewer.tsx](../src/components/app/BenchmarkCompareViewer.tsx).
That is a workaround, not a correction. Its threshold was tuned against two
profile pairs, which is a thin basis, and the "All significant" mode has no
defence at all.

## The problem, quantified

With 6798 buckets tested at p ≤ 0.05 you expect ~340 false positives. Measured on
a pair of profiles with **no difference detectable at subtest level** (every
subtest p-value between 0.12 and 0.97), the number of global buckets reporting
`p ≤ 0.05` was **130**. Fewer than chance expectation, which is the point: those
130 rows are essentially all noise, and nothing in the current output
distinguishes them from the real ones.

## Why Benjamini-Hochberg does not work yet

BH at q ≤ 0.05 rejects the k-th smallest p-value when `p_k ≤ 0.05 · k / n`. With
n = 6798 that means the smallest p-value has to be under `0.05 / 6798 = 7.4e-6`
to reject anything at all at rank 1.

The permutation p-value floor is `1 / (PERMUTATION_COUNT + 1) = 1 / 2000 =
5.0e-4`, about 68× too coarse. So BH rejects **nothing** — including
`CanvasRenderingContext2D.stroke`, which moved +73% with a Cohen's d of 1.00 and
is not in any doubt. Verified by prototyping BH over the p-values from both
profile pairs: zero survivors in each.

Two ways out, and they compose:

1. **Escalate the permutation count for survivors only.** Run the current cheap
   pass, take the few dozen buckets at or near the floor, and re-run those with
   enough relabellings to resolve the tail — roughly `n / (q · rank)`, so ~136000
   for rank 1 at q = 0.05. Only a handful of buckets need it, and sequential
   stopping means the ones that do not need it stay cheap. Watch the cost model:
   a 136000-draw run on one bucket is ~70× a full 1999-draw run, so budget by
   counting draws rather than buckets.
2. **Use a tail approximation for the extreme p-values.** Fit a generalised
   Pareto to the upper tail of the permutation distribution (Knijnenburg et al.,
   Bioinformatics 2009, "Fewer permutations, more accurate P-values") and read
   the far tail off the fit instead of counting hits. Standard in genomics for
   exactly this problem. Cheaper than (1) but introduces a modelling assumption
   where there currently is none, which matters because avoiding distributional
   assumptions is why permutation was chosen in the first place.

Whichever you pick, the sparse buckets are the awkward case: a bucket that is
nonzero in 8 of 200 iterations has a genuinely coarse permutation null — there
are only so many distinguishable relabellings — and no number of draws makes its
p-value smaller than the discreteness allows. Those buckets may simply not be
resolvable at FDR-corrected significance, which is a true and useful thing for
the UI to be able to say. `SPARSE_ZERO_FRACTION` already identifies them.

## Things to decide, not just implement

- **Is BH even the right family?** The 6800 buckets are not independent — they
  partition the same samples, so they are negatively correlated by construction,
  and nested-in-a-subtree relationships exist between the funcs. BH is valid
  under positive regression dependence; under general dependence you want
  Benjamini-Yekutieli, which is more conservative by a factor of `ln(n) ≈ 8.8`.
  Or sidestep the question with a **max-statistic permutation threshold**, which
  handles arbitrary dependence exactly because the permutation is done jointly
  across buckets. That approach is already worked out for the tree-search case in
  [§3.3 of the bucketing report](benchmark-auto-bucketing.md) and reuses the same
  relabelling machinery; it may be the better fit here too.
- **What is the family?** The global view and 20 subtest views test overlapping
  hypotheses about the same samples. Correcting within each view separately is
  the easy choice and is not obviously the right one.
- **What replaces the impact floor?** If FDR control works, `MIN_SCORE_IMPACT`
  may be able to drop a long way, which would surface real-but-small changes the
  current default hides. Do not remove it without checking: it is also doing
  materiality filtering, which is a different job from error control, and a
  statistically real 0.001% change is still not worth a row.

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

Ready-to-paste UI links, with the dev server running (`yarn start`):

Pair A:

```
http://localhost:4242/compare-benchmark/?profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FU17Ba7fhRqmehH_VQeEp3w%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz&profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FOtZhWS5QQrqfMH9RvR6IKQ%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz
```

Pair B:

```
http://localhost:4242/compare-benchmark/?profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FaMtf0V-ISGGKPhd05BphmA%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz&profiles[]=https%3A%2F%2Fprofiler.firefox.com%2Ffrom-url%2Fhttps%253A%252F%252Ffirefox-ci-tc.services.mozilla.com%252Fapi%252Fqueue%252Fv1%252Ftask%252FVnqrcVeORJKwjVkIN0UTZg%252Fruns%252F0%252Fartifacts%252Fpublic%252Ftest_info%252Fprofile_speedometer3_compact.jslb.gz
```

For the CLI, which is much faster to iterate on:

```sh
yarn build-node-tools
node node-tools-dist/extract-benchmark-stats.js --input base.jslb.gz --output base-stats.json
node node-tools-dist/extract-benchmark-stats.js --input new.jslb.gz  --output new-stats.json
node node-tools-dist/compare-benchmark-stats.js --base base-stats.json --new new-stats.json --top 20
node node-tools-dist/compare-benchmark-stats.js --base base-stats.json --new new-stats.json --suite Charts-chartjs
```

`extract-benchmark-stats` needs `--max-old-space-size=8192`.

### What each pair should tell you

**Pair A is the negative control.** Every subtest p-value is between 0.12 and
0.97 and the overall score moved −0.24% against an MDE of ±14.90, so there is
nothing here to find. Any method that reports findings on pair A is reporting
noise. Current behaviour: 130 buckets at p ≤ 0.05, 0 surviving the shipped
default filter.

Pair A also has history worth knowing. It is the pair that exposed a bug where
the geomean-normalised global view reported 75 "significant" buckets, none of
which were real: the two profiles' per-suite normalisation factors differed by
~0.1%, and while the comparison used Mann-Whitney U that tiny rescale broke the
exact-equality ties a rank statistic depends on, shifting Cliff's delta by the
tied-pair fraction. Both halves are fixed — shared normalisation factors, and no
rank statistic — but it is a good reminder that this data's failure modes are
silent and plausible-looking. If a change makes pair A produce a tidy list of
findings, that is the bug, not the feature.

**Pair B has a real, checkable change** in canvas drawing:

| bucket                            | base  | new   | Δ     | Δ% overall | d     | p      |
| --------------------------------- | ----- | ----- | ----- | ---------- | ----- | ------ |
| `CanvasRenderingContext2D.stroke` | 1.92  | 3.32  | +1.40 | +0.140%    | 1.00  | ≤5e-4  |
| `CanvasRenderingContext2D.fill`   | 3.83  | 2.54  | −1.28 | −0.128%    | −0.92 | ≤5e-4  |
| `HTMLElement.click`               | 21.49 | 20.33 | −1.16 | −0.116%    | −0.24 | 1.6e-2 |
| `CanvasRenderingContext2D.arc`    | 1.54  | 1.05  | −0.49 | −0.049%    | −0.46 | ≤5e-4  |
| `set Node.textContent`            | 2.69  | 2.25  | −0.44 | −0.044%    | −0.27 | 4.0e-3 |

The canvas rows are one coherent story — work moved out of `fill` and `arc` into
`stroke` — and they concentrate in Charts-chartjs, where the same three dominate
the subtest expansion. At subtest level only Perf-Dashboard (−2.27%) and
NewsSite-Nuxt (+0.99%) clear p ≤ 0.05, so most of this is invisible without
per-bucket analysis. That is the case for doing this work at all.

`HTMLElement.click` is the row to watch. It is the largest absolute contributor
in the pair and it has the weakest standardised effect of the five, because it is
a 21 ms bucket with proportionally large run-to-run spread. Any criterion built
on standardised effect size drops it. A good FDR implementation should keep it;
if it does not, check whether the reason is real (its p-value genuinely is only
1.6e-2, and after correcting for 6800 comparisons that may honestly not survive)
or an artefact of the p-value floor.

## Reading order

1. [benchmark-auto-bucketing.md](benchmark-auto-bucketing.md) §3.1 and §3.3 —
   why the mean difference rather than a rank test, and the permutation
   calibration machinery, including a worked case where searching over candidates
   produced a "significant" finding in 62% of trials on data with no difference
   in it.
2. [perf-compare-stats.ts](../src/profile-logic/benchmark/perf-compare-stats.ts)
   — `permutationTwoSidedP`, `makePermutationBaseIndices`, and the constants
   around them.
3. `computeComparisonStats` in
   [compare-benchmark-stats.ts](../src/profile-logic/benchmark/compare-benchmark-stats.ts)
   — the Welch/permutation gate, and where a q-value would be added.
4. [perf-compare-stats.test.ts](../src/test/unit/perf-compare-stats.test.ts) —
   includes a calibration test asserting the permutation p-value is not
   anti-conservative on sparse counts, which is the property to preserve.

One trap worth flagging, because it cost a debugging cycle: a bucket with zero
spread on both sides but different means — base weight 0 in every iteration, new
weight nonzero in every one, i.e. one that appeared or disappeared — has `se ==
0`. The natural `se > 0 ? delta / se : 0` guard then reports the most clear-cut
change in the profile as no change at all. `tStatistic` returns ±∞ for that case;
keep it that way, and be careful that any q-value machinery handles p = 0.
