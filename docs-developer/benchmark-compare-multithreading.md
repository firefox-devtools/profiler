# The benchmark comparison off the main thread

How `/compare-benchmark` gets its bucket tables computed in workers, and why the
answers do not depend on how many of them there were.

Read [benchmark-compare-fdr.md](./benchmark-compare-fdr.md) first if you have not.
It explains what the expensive computation is and why it cannot be cheapened,
which is the reason parallelism is what was left.

## Where the time goes

`/compare-benchmark` runs this pipeline:

| stage                                                      | where                                                                                                               | cost                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| fetch + unserialize two profiles                           | `loadOneProfileCached` in [run-benchmark-comparison.ts](../src/profile-logic/benchmark/run-benchmark-comparison.ts) | network + ~300/500ms     |
| extract per-bucket, per-iteration weights                  | [extract-benchmark-stats.ts](../src/profile-logic/benchmark/extract-benchmark-stats.ts)                             | ~150ms per profile       |
| normalise, and compute the overall + subtest score rows    | `compareStatsProgressively`                                                                                         | ~45ms total              |
| the global bucket table (every bucket, geomean-normalised) | `compareBuckets` → `computeFamilyCorrection`                                                                        | **~1.0s**                |
| one bucket table per subtest                               | same                                                                                                                | **~1.6s** for 13 of them |

Measured 2026-08-18 on a Chrome-vs-Firefox pair: 13 subtests, 3657 buckets, 200
iterations per side, `PERMUTATION_COUNT = 1999`. A full Speedometer 3 pair has 21
subtests and ~6800 buckets, so expect roughly 2–3× those two bottom rows.

The last two rows are ~90% of the wall clock and 100% of the arithmetic, and they
are what runs in workers. Everything above them still runs on the main thread; see
[What is not moved](#what-is-not-moved).

The groundwork this was built on — a computation that can be interrupted at its
`yield` points, and a UI that renders each row as its table arrives — is in
[chunked-work.ts](../src/profile-logic/benchmark/chunked-work.ts). Slicing keeps
the page responsive; it does not make anything finish sooner, which is what the
threads are for.

## The shape of it

**The seam is an injected table runner.** `compareStatsProgressively` builds a list
of `BucketTableJob`s — the global table, then one per subtest that both profiles
ran — and hands them to a `TableRunner`:

```ts
export type TableRunner = {
  run: (job: BucketTableJob) => Promise<BucketComparison[]>;
  dispose: () => void;
};
export type TableRunnerFactory = (setup: TableRunnerSetup) => TableRunner;
```

A factory rather than a plain function because a runner has a lifetime: the pool
spawns its threads when a comparison starts, hands each of them the two profiles'
bucket metadata once, and terminates them when it ends — including when the reader
abandons the comparison part-way, which is what `dispose` in a `finally` and the
`AbortSignal` in `TableRunnerSetup` are between them for.

The compare page passes `createBenchmarkTableWorkerPool`. The default is
`createInProcessTableRunner`, which is what the CLI and the unit tests get, so no
test needs to spawn a worker to exercise the comparison.

Every job is submitted at once and the snapshots go out in whatever order the
tables come _back_, which under a pool of threads is not the order they were
dispatched in. The UI has always read `bucketTables` and `pendingLabels` as sets,
so it does not care.

**A worker needs no `Profile`,** which is what makes any of this cheap. A job is
two sparse bucket lists plus an iteration count, and the metadata is three arrays
of strings and func indices. Single megabytes, against the several hundred a parsed
profile weighs.

**Both levels of parallelism are used.** The tables are independent of each other,
so a subtest table gets a thread to itself. Within one table the permutation draws
are independent too, so the global table — which, once the subtests have a thread
each, is the whole critical path, and which is also the row a reader expands first
— is split across every thread by draw range. A job carries
`splitAcrossThreads` to say which it is.

### Splitting one table

`accumulateFamilyPartialInSlices` runs a range of draws over the whole family;
`combineFamilyPartials` turns any set of ranges tiling `[0, drawCount)` into the
correction. The three accumulators are separable, which is the whole trick:

- `nullsClearing` (`memberCount + 1`) — added elementwise
- `ownHits` (`memberCount`) — added elementwise
- `maxima` (`drawCount`) — each range fills its own disjoint slice

Everything else the correction needs (`offsets`, `pooledIndex`, `pooledValue`,
`totalSum`, `totalSumSquares`, `absT` and its sorted copy) is deterministic from
the family, so each range recomputes it rather than having it shipped — which is
why a shard can be described by two integers.

The same is true one level up, in `computeBucketTableShardInSlices`: matching the
two sides' buckets and taking a Welch t of each is repeated per shard rather than
divided. **That is what bounds the useful shard count.** The set-up is ~150ms of
the global table's ~1.1s, so at eight shards a shard is ~150ms of set-up and ~105ms
of draws and the next doubling would buy about 50ms — hence `MAX_WORKERS = 8` in
[benchmark-compare-worker-pool.ts](../src/profile-logic/benchmark/benchmark-compare-worker-pool.ts).
Shards other than 0 skip building the comparison rows, which is most of that
set-up; it saves no wall clock, since shard 0 is on the critical path either way,
but on a machine with fewer cores than shards it is the difference between the
other shards costing a little and costing as much again.

**This is exactly reproducible, and it has to be.** The q-values are load-bearing;
a reader must not get different answers on a laptop and a workstation. Two facts
make it exact rather than approximately equal: `nullsClearing` and `ownHits` hold
integer counts (at most ~7M, far inside float64's exact range), so summing them in
any order is exact; and `absT` comes from the same code over the same data in every
thread, so the thresholds it is compared against are bit-identical. Both invariants
are checked rather than assumed — `combineFamilyPartials` throws unless the ranges
tile the draws exactly once and the ranges agree about every member's observed |t|
— and asserted, with `toEqual` rather than `toBeCloseTo`, in
[perf-compare-stats.test.ts](../src/test/unit/perf-compare-stats.test.ts),
[compare-benchmark-stats.test.ts](../src/test/unit/compare-benchmark-stats.test.ts)
and across the real protocol in
[benchmark-compare-worker-pool.test.ts](../src/test/unit/benchmark-compare-worker-pool.test.ts).

There is one implementation, not two: `compareBuckets` and
`compareBucketsInSlices` are a single shard covering every draw.

### Wire format

- **Per worker, once:** the two profiles' `bucketNames`, `bucketKeys` and
  `bucketFuncs`.
- **Per shard:** the two bucket lists, packed, plus the iteration count and which
  shard of how many this is.
- **Back:** the family accumulators, and — from shard 0 only, since every shard
  would produce the identical list — the `BucketComparison[]` rows.

The packing is not an optimisation for its own sake. `iterationTotals` values are
`subarray` views into one big `Float64Array` per suite (see the allocation in
`computeGlobalBuckets` and the `subarray` in `extractBenchmarkStatsFromProfile`),
and structured clone copies a view's _whole_ underlying buffer. That buffer covers
every bucket at every iteration — 17MB per side for a Speedometer 3 pair, where a
job needs a third of it — and a split table sends the same job to every thread, so
it would be 17MB × threads. `packBuckets` copies out what the table actually uses,
once, and makes the wire size proportional to the table rather than to the profile.
Clone preserves identity within a single `postMessage`, so sending a job's lists in
one message would at least have been one copy of that buffer rather than 3000; it
was still worth not sending.

Do not "optimise" by transferring the buffers: the main thread still needs those
weights for the other tables and for the flame graphs. `SharedArrayBuffer` would
avoid the per-thread copy altogether and is not available — it needs COOP/COEP
headers the deployment does not set. Check `crossOriginIsolated` before assuming
otherwise.

### Inside the worker

`compareBuckets` via `runToCompletion` — the plain synchronous drain. Slicing is
for keeping a UI alive, and a worker has no UI. For the same reason
`worker.terminate()` is the whole cancellation story: no cooperative checks, no
waiting for a slice to end, which is strictly better than what the main-thread path
can do.

`permutationsFor` caches relabellings in a module-level map, so each worker builds
its own set (~1.6MB, a few ms). That is fine, and it does not affect results:
`makePermutationBaseIndices` is seeded (`0x5eed` by default), so every thread
generates the identical draws. **Nothing about the relabellings is sent.**

## Build and test wiring

The worker follows the TypeScript-worker pattern that
[source-map.worker.ts](../src/profile-logic/source-map.worker.ts) established, and
`workerConfig` in [esbuild-configs.mjs](../scripts/lib/esbuild-configs.mjs) is now
that pattern factored out: a standalone IIFE bundle, hashed in production, built
before the main bundle in [build.mjs](../scripts/build.mjs) so its output path can
be injected as the `BENCHMARK_COMPARE_WORKER_PATH` define, declared in
[global.d.ts](../src/types/globals/global.d.ts), watched by
[run-dev-server.mjs](../scripts/run-dev-server.mjs), and pointed at a stub for jest
from [jest.config.js](../jest.config.js).

Nothing in the test suite spawns a real worker, and the stub exists only so that a
dispatch which slips through fails loudly rather than hanging. The pool's protocol
is tested against a fake `Worker` that runs the real worker module's message
handler in-process, which covers the wire format both ways without needing a
bundle. If something ever does need a real one,
[node-worker.ts](../src/test/fixtures/node-worker.ts) runs a worker bundle under
`worker_threads`.

## What is not moved

- **Extraction** (~150ms per profile) needs the whole `Profile`, and the main
  thread needs that `Profile` anyway for the flame graphs. Shipping it to a worker
  costs more than the pass saves. If those two hitches ever matter, the fix is
  yield points inside the marker and stack derivation, not a thread.
- **The synchronous API.** `compareBuckets` and `computeFamilyCorrection` keep
  working unchanged in node: the CLI is the reference implementation for every
  number in the FDR doc.

## Re-measuring

Regenerate stats files from two profiles (much faster to iterate on than
profiles, and the CLI accepts either):

```sh
yarn build-node-tools
node node-tools-dist/extract-benchmark-stats.js --input base.json --output base-stats.json
node node-tools-dist/extract-benchmark-stats.js --input new.json  --output new-stats.json
node node-tools-dist/compare-benchmark-stats.js --base base-stats.json --new new-stats.json --top 5
```

For per-stage timings, bundle a throwaway script against the source with
`npx esbuild --bundle --platform=node --format=cjs`, `JSON.parse` the two stats
files, convert each `iterationTotals` back to a `Float64Array` (the CLI writes
them as plain arrays), and time `computeSharedSuiteFactors`,
`computeGlobalBuckets`, `compareIterationTotals` and `compareBuckets` separately.
That is how the table above was produced. The same rig is how to check that a
change to the arithmetic has not moved any number: print every field of every row
of every table at full precision, and diff two builds byte for byte.

In the browser, the honest measure is not the total but time-to-first-row and
whether a click on a profile link lands while tables are still computing. Check
it with the Firefox Profiler on the compare page itself.
