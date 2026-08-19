# Moving the benchmark comparison off the main thread

A brief for implementing worker parallelism in the benchmark compare view. The
groundwork — making the computation interruptible and the UI progressive — is
done and landed; this is about making it _finish sooner_ rather than merely stay
responsive while it doesn't.

Read [benchmark-compare-fdr.md](./benchmark-compare-fdr.md) first if you have not.
It explains what the expensive computation is and why it cannot be cheapened,
which is the reason parallelism is what's left.

## Where things stand

`/compare-benchmark` runs this pipeline, all of it on the main thread:

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

The last two rows are what to parallelise. They are ~90% of the wall clock and
100% of the arithmetic.

### What already exists

- **[chunked-work.ts](../src/profile-logic/benchmark/chunked-work.ts)** —
  `SlicedWork<T>` is a generator that yields where its state is consistent.
  `runToCompletion` drains it (CLI, tests, and — note — inside a worker, where
  nothing needs to be polite). `runInSlices` drives it on the main thread, handing
  the thread back every 12ms and throwing at the next yield point if its
  `AbortSignal` fires.
- **`compareBucketsInSlices` / `computeFamilyCorrectionInSlices`** — the real
  implementations. `compareBuckets` and `computeFamilyCorrection` are wrappers
  that drain them, with unchanged names, signatures and results, because
  [node-tools/compare-benchmark-stats.ts](../src/node-tools/compare-benchmark-stats.ts)
  and the unit tests call them.
- **`compareStatsProgressively`** — builds a `jobs` list (the global table, then
  one per subtest that both profiles ran), awaits each in turn, and yields a
  `ComparisonProgress` snapshot after each. This is the seam to cut.
- **The UI is already progressive.** `BenchmarkCompareViewer` renders the score
  rows as soon as they exist, with a spinner in each row's badge slot until that
  row's table arrives. It reads `bucketTables: Map<label, BucketComparison[]>`
  and `pendingLabels: string[]`, so it does not care in what order tables land.

## Phase 1: one worker per table

Expected: ~2.6s of arithmetic → ~1.0s, the length of the longest single table.
Roughly a day.

The reason this is cheap: **a worker needs no `Profile`.** A table job is two
sparse bucket lists — `{ bucketIndex, iterationTotals: Float64Array }` — plus the
`bucketNames` / `bucketKeys` / `bucketFuncs` arrays and an iteration count. Single
megabytes, against the several hundred a parsed profile weighs.

### The seam

Give `compareStatsProgressively` an injected table runner, defaulting to what it
does today:

```ts
export type TableRunner = (job: BucketTableJob) => Promise<BucketComparison[]>;
```

The component passes a worker-pool implementation; the unit tests get the default
and keep running in-process, with no worker stub needed. Keep the `jobs` list and
the snapshot machinery exactly as they are.

### Wire format

- **Per worker, once:** the two profiles' `bucketNames`, `bucketKeys` and
  `bucketFuncs`. A few thousand strings each, cloned once per worker rather than
  once per job.
- **Per job:** the two bucket lists and `iterationCount`.
- **Back:** `BucketComparison[]`. ~3200 plain objects for the global table,
  a few ms to clone. Flattening to typed arrays is possible and not needed.

One trap. `iterationTotals` values are `subarray` views into one big
`Float64Array` per suite (see the allocation in `computeGlobalBuckets` and the
`subarray` in `extractBenchmarkStatsFromProfile`). Structured clone copies a
view's _whole_ underlying buffer — but it preserves object identity within a
single `postMessage`, so all views sharing one buffer cost one copy. Send a job's
lists in one message and this is a 6MB memcpy; send them per bucket and it is
6MB × 3000. Do not "optimise" by transferring the buffer: the main thread still
needs those weights for later jobs and for the flame graphs.

### Inside the worker

`compareBuckets` — the plain synchronous wrapper. Slicing is for keeping a UI
alive, and a worker has no UI.

`permutationsFor` caches relabellings in a module-level map, so each worker
builds its own set (~1.6MB, a few ms). That is fine, and it does not affect
results: `makePermutationBaseIndices` is seeded (`0x5eed` by default), so every
thread generates the identical draws. **Nothing about the relabellings needs to
be sent.**

### Pool and cancellation

Spawn `min(navigator.hardwareConcurrency, jobs.length)` workers when a comparison
starts; terminate them when it finishes, and on abort. `worker.terminate()` is
the whole cancellation story — no slicing, no cooperative checks — which is
strictly better than what the main-thread path can do.

Dispatch jobs in the existing order so the global table starts first, but yield a
snapshot as each one _finishes_. That makes arrival order nondeterministic, which
the UI supports. One test asserts the old behaviour and should be relaxed to "one
more table per snapshot": `adds one bucket table per snapshot, in the order the
rows are listed` in
[run-benchmark-comparison.test.ts](../src/test/unit/run-benchmark-comparison.test.ts).

## Phase 2: split the global table by draw range

Expected: ~1.0s → ~0.3s. Roughly half a day, and mechanical.

After phase 1 the critical path is one table. `computeFamilyCorrectionInSlices` is
`drawCount × memberCount` evaluations of `absTForMember`, and the draws are
independent, so split the draw loop across N workers and combine. The function
already separates cleanly into three parts:

1. **Prepare**, from the family alone: `offsets`, `pooledIndex`, `pooledValue`,
   `totalSum`, `totalSumSquares`, then `absT` and its sorted copy `ascending`.
   Deterministic from the input, so each worker can just recompute it rather than
   have it shipped.
2. **Accumulate over a draw range** — the `for (let p = ...)` loop. Everything it
   writes is separable:
   - `nullsClearing` (`memberCount + 1`) — add elementwise
   - `ownHits` (`memberCount`) — add elementwise
   - `maxima` (`drawCount`) — each range fills its own disjoint slice
3. **Combine**: `nullExceeding`, `fdrAtThreshold`, the monotone running minimum,
   `maxima.sort()`, then the per-member `pValues` / `qValues` /
   `familyWisePValues` and `criticalAbsT`. Runs once, on the merged accumulators.

**This is exactly reproducible, and it has to be.** The q-values are load-bearing;
a reader must not get different answers on a laptop and a workstation. Two facts
make it exact rather than approximately equal: `nullsClearing` and `ownHits` hold
integer counts (at most ~7M, far inside float64's exact range), so summing them in
any order is exact; and `absT` comes from the same code over the same data in
every thread, so the thresholds it is compared against are bit-identical. Assert
this with a test that partial-plus-combine equals the whole-family result exactly
— `toEqual`, not `toBeCloseTo` — reusing the family fixtures in
[perf-compare-stats.test.ts](../src/test/unit/perf-compare-stats.test.ts).

Note that each worker in this scheme needs the whole family, so the job payload
goes to N workers instead of 1: ~6MB × N, ~50ms of cloning. `SharedArrayBuffer`
would avoid it and is not available — it needs COOP/COEP headers the deployment
does not set. Check `crossOriginIsolated` before assuming otherwise.

## Build and test wiring

Two established worker patterns:

- **Plain JS worker**, [gz.worker.js](../src/utils/gz.worker.js): esbuild's
  `.worker.js` → `file` loader means `import path from './gz.worker.js'` gives a
  URL, and `new Worker(path)` just works. No build changes. But no TypeScript.
- **TypeScript worker**, [source-map.worker.ts](../src/profile-logic/source-map.worker.ts):
  its own esbuild config (`sourceMapWorkerConfig` in
  [esbuild-configs.mjs](../scripts/lib/esbuild-configs.mjs)), built first in
  [build.mjs](../scripts/build.mjs) so its hashed output path can be injected into
  the main bundle as a `define`, declared in
  [global.d.ts](../src/types/globals/global.d.ts), and stubbed for jest via
  `globals.SOURCE_MAP_WORKER_PATH` in [jest.config.js](../jest.config.js) pointing
  at [source-map.worker.stub.js](../src/test/fixtures/source-map.worker.stub.js).

Use the second. Copy the pattern rather than inventing a third; it is about 25
lines of build config. With the injected `TableRunner`, no test needs to spawn a
worker at all — but if one should, [node-worker.ts](../src/test/fixtures/node-worker.ts)
runs a worker bundle under `worker_threads`.

## What not to move

- **Extraction** (~150ms per profile) needs the whole `Profile`, and the main
  thread needs that `Profile` anyway for the flame graphs. Shipping it to a worker
  costs more than the pass saves. If those two hitches ever matter, the fix is
  yield points inside the marker and stack derivation, not a thread.
- **The synchronous API.** `compareBuckets` and `computeFamilyCorrection` must
  keep working unchanged in node: the CLI is the reference implementation for
  every number in the FDR doc.

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
That is how the table above was produced.

In the browser, the honest measure is not the total but time-to-first-row and
whether a click on a profile link lands while tables are still computing. Check
it with the Firefox Profiler on the compare page itself.

## Done looks like

- [ ] Tables computed in workers; the score table still paints before any of them.
- [ ] Identical output to the single-threaded path, exactly, and independent of
      how many workers ran. A test asserts it.
- [ ] Aborting a comparison terminates its workers.
- [ ] `yarn ts`, `yarn lint`, `yarn test`, `yarn build`, `yarn build-node-tools`
      all clean; the CLI's numbers unchanged.
