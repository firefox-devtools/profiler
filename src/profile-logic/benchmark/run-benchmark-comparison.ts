/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Running a benchmark comparison as a sequence of results, rather than as one
 * answer that arrives when everything is finished.
 *
 * The reader is waiting on a page with two profile links and a score table on it,
 * and almost none of what they are waiting for is needed to draw most of that. So
 * this yields a snapshot every time one more piece exists: first the score rows —
 * the overall score and every subtest, which is the whole table apart from the
 * per-function expansions — and then one bucket table at a time. The score rows
 * cost ~45ms to compute; the bucket tables cost ~3s between them, and used to be
 * on the path to seeing anything at all.
 *
 * Each stage hands the main thread back before it starts, so the page paints each
 * row as it fills in and a click on one of the profile links is dispatched while
 * the rest is still computing. Where the tables themselves run is up to the
 * injected `TableRunner`: in the browser, a pool of workers, so they finish
 * sooner as well as politely; in the CLI and the tests, here, in slices. See
 * chunked-work.ts and benchmark-compare-worker-pool.ts.
 */

import { fetchProfile } from 'firefox-profiler/utils/profile-fetch';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { getProfileFetchUrl } from 'firefox-profiler/actions/receive-profile';
import type {
  Profile,
  BenchmarkBucketComparand as Comparand,
} from 'firefox-profiler/types';

import { extractBenchmarkStatsFromProfile } from './extract-benchmark-stats';
import type {
  ProfileBenchmarkStats,
  SparseBucketEntry,
} from './extract-benchmark-stats';
import {
  applyBenjaminiHochberg,
  bucketTableSideOf,
  compareBucketsInSlices,
  compareIterationTotals,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
  matchBucketKeys,
  suiteIterationTotals,
} from './compare-benchmark-stats';
import type {
  BucketComparison,
  BucketTableMetadata,
  MatchedBucketKeys,
  ScoreComparison,
} from './compare-benchmark-stats';
import { minimumDetectableEffect } from './perf-compare-stats';
import { combineAgainstFastest, combineBucketTables } from './best-of-others';
import type {
  ComparedBucket,
  ComparedScore,
  PairwiseBucketTable,
} from './best-of-others';
import { computeProfileMeans } from './profile-means';
import type { ProfileMeans } from './profile-means';
import { runInSlices, yieldToBrowser } from './chunked-work';

/** What a comparison is *of*, as opposed to what it found: carried through into
 * every snapshot, since the flame graphs and the deep links out of them need it.
 * Every loaded profile, in list order, because with the fastest of the others as
 * the comparand any of them can be a row's base side. */
export type ComparisonSources = {
  /** The loaded source profiles, retained so we can render flame graphs of
   * individual buckets on demand (focusSelf on a bucket's representative func). */
  profiles: Profile[];
  /** The input URLs after `expandUrl` resolves a share.firefox.dev (or
   * perfht.ml / bit.ly) shortlink to its full profiler.firefox.com URL -- or the
   * original URL if it was already in that form. Deep links from each bucket's
   * flame graph are rewritten off *this* URL, so a shortened input still yields
   * a working link. */
  viewerUrls: string[];
};

/**
 * The score rows: enough to draw the whole table except for what is behind its
 * disclosure triangles. Each row names the profile it is measured against, which
 * is the same profile on every row unless the comparand is the fastest of the
 * others.
 */
export type ComparisonScores = {
  overallScore: ComparedScore;
  suiteScores: ComparedScore[];
};

/**
 * What the report can show at one instant. Yielded by `runBenchmarkComparison`
 * once per piece of it that becomes available, and never mutated afterwards, so a
 * consumer can hold one of these in component state and re-render off it.
 */
export type ComparisonProgress = {
  sources: ComparisonSources;
  scores: ComparisonScores;
  /**
   * The means of every loaded profile that is not on one side of every row, by
   * its index in the list the reader gave. That is every profile except the
   * subject and a single comparand. Empty whenever two profiles are loaded,
   * which is the usual case.
   *
   * These are the mean columns that cannot be read off the rows. They are not
   * comparisons in themselves: see profile-means.ts.
   */
  otherMeans: Map<number, ProfileMeans>;
  /**
   * The per-function comparisons behind each score row, keyed by that row's
   * label — `overallScore.label` for the geomean-normalised global view, and the
   * subtest name for a subtest. Only the ones computed so far.
   */
  bucketTables: Map<string, ComparedBucket[]>;
  /**
   * Labels whose bucket table is still being computed, in the order the tables
   * will arrive. Empty once the comparison is complete.
   *
   * A label that is in neither this list nor `bucketTables` has no table and never
   * will — a subtest the new profile did not run, which cannot be expanded rather
   * than being not-expandable-yet. The reader is told two different things in
   * those two cases, so the state has to distinguish them.
   */
  pendingLabels: string[];
};

/**
 * One bucket table to compute: two sparse bucket lists and the row they belong
 * to. Everything a table needs *except* the two profiles' bucket metadata, which
 * is the same for every job of one pair and so lives in `TableRunnerSetup`.
 */
export type BucketTableJob = {
  /** The score row this table expands, and the key it is stored under. */
  label: string;
  /** Which of `TableRunnerSetup.pairs` the two bucket lists belong to. */
  pairIndex: number;
  /** The bar the rows' MDEs are re-based on: 0.05, divided by the number of
   * profiles the subject is being compared with. See best-of-others.ts. */
  familyWiseAlpha: number;
  baseBuckets: SparseBucketEntry[];
  newBuckets: SparseBucketEntry[];
  iterationCount: number;
  /**
   * Whether a runner with several threads should put all of them on this one
   * table rather than starting the next one.
   *
   * True for the global table only. It is ~1s against ~130ms for a subtest, so
   * after the subtests have been spread one per thread it is the whole critical
   * path — and it is also the row a reader expands first. The subtests are already
   * parallel with each other, and splitting one of those would cost more in
   * repeated set-up than it saved; see `computeBucketTableShardInSlices`.
   */
  splitAcrossThreads: boolean;
};

/** One pair of profiles whose bucket tables a runner is asked for. */
export type TableRunnerPair = {
  /**
   * Which of the two profiles' buckets are the same bucket. Matched once for the
   * whole comparison — it is the same answer for every table — and this is the only
   * part of the metadata a worker is sent.
   */
  keys: MatchedBucketKeys;
  /**
   * The two profiles' bucket metadata, for naming the rows on the way back. Stays
   * on this thread: see `BucketTableMetadata`.
   */
  meta: BucketTableMetadata;
};

/** What a runner is told once, when a comparison starts. */
export type TableRunnerSetup = {
  /** One entry per profile the subject is compared with: a single pair, unless
   * the comparand is the fastest of the others. Jobs refer to these by index. */
  pairs: TableRunnerPair[];
  /** How many tables this comparison will ask for, so a pool can size itself. */
  jobCount: number;
  /** Aborted when the comparison is abandoned. A runner is expected to stop and
   * reject whatever is outstanding, which for a worker pool means terminating
   * them: a comparison the reader has replaced should not go on spending seconds
   * finishing tables nobody will look at. */
  signal: AbortSignal;
};

/**
 * How the bucket tables get computed. Jobs may be submitted all at once and may
 * finish in any order.
 */
export type TableRunner = {
  run: (job: BucketTableJob) => Promise<BucketComparison[]>;
  /** Called once, when the comparison ends — including when it is abandoned
   * part-way. */
  dispose: () => void;
};

/**
 * A factory rather than a plain function, because a runner has a lifetime: the
 * worker pool spawns threads when a comparison starts, hands them the two
 * profiles' bucket metadata once, and terminates them when it ends.
 */
export type TableRunnerFactory = (setup: TableRunnerSetup) => TableRunner;

/**
 * The default: compute the tables here, one at a time, in slices. What this did
 * before there was anywhere else to do it, and still what the CLI and the tests
 * get.
 *
 * One at a time *matters*. These are promises, so submitting every job at once
 * would otherwise interleave them all through the same slice loop and finish them
 * all at the end — which is exactly the progressiveness the slicing exists for,
 * thrown away.
 */
export function createInProcessTableRunner(
  setup: TableRunnerSetup
): TableRunner {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    run: (job) => {
      const { keys, meta } = setup.pairs[job.pairIndex];
      const result = queue.then(() =>
        runInSlices(
          compareBucketsInSlices(
            {
              keys,
              baseBuckets: job.baseBuckets,
              newBuckets: job.newBuckets,
              iterationCount: job.iterationCount,
            },
            meta,
            job.familyWiseAlpha
          ),
          setup.signal
        )
      );
      // The next job goes after this one whether or not this one worked out.
      queue = result.catch(() => {});
      return result;
    },
    dispose: () => {},
  };
}

/**
 * Profiles already downloaded this session, keyed by viewer URL.
 *
 * Swapping the two sides, or replacing one of them, re-runs the whole
 * comparison — and these are multi-megabyte artifacts fetched from Taskcluster,
 * so re-downloading the side that did not change would make the swap button
 * unusable. Keyed by the URL the user typed, since that is what identifies a
 * profile here; entries are never evicted, which is fine for a page whose whole
 * job is comparing two of them.
 */
export type LoadedProfile = {
  profile: Profile;
  /** The URL after any shortlink expansion. This is the URL that actually
   * points at a viewable profile in profiler.firefox.com; it's what deep
   * links from each bucket's flame graph get rewritten from. */
  viewerUrl: string;
};

const profileCache = new Map<string, Promise<LoadedProfile>>();

export function loadOneProfileCached(inputUrl: string): Promise<LoadedProfile> {
  const cached = profileCache.get(inputUrl);
  if (cached !== undefined) {
    return cached;
  }
  // Don't cache a rejection: a failed fetch is usually transient, and the
  // obvious way to retry is to press the button again.
  const promise = loadOneProfile(inputUrl).catch((err) => {
    profileCache.delete(inputUrl);
    throw err;
  });
  profileCache.set(inputUrl, promise);
  return promise;
}

async function loadOneProfile(inputUrl: string): Promise<LoadedProfile> {
  let viewerUrl = inputUrl;
  if (
    viewerUrl.startsWith('https://perfht.ml/') ||
    viewerUrl.startsWith('https://share.firefox.dev/') ||
    viewerUrl.startsWith('https://bit.ly/')
  ) {
    viewerUrl = await expandUrl(viewerUrl);
  }
  const dataUrl = getProfileFetchUrl(viewerUrl);
  const response = await fetchProfile({
    url: dataUrl,
    onTemporaryError: () => {},
  });
  if (response.responseType !== 'BYTES') {
    throw new Error('Expected a profile, not a zip file.');
  }
  const profile = await unserializeProfileOfArbitraryFormat(
    response.bytes,
    dataUrl
  );
  return { profile, viewerUrl };
}

/** Hand the main thread back, then stop if the caller has moved on. */
async function pause(signal: AbortSignal): Promise<void> {
  await yieldToBrowser();
  signal.throwIfAborted();
}

/**
 * Extracted stats, keyed by the viewer URL of the profile they came from.
 *
 * The same reason as `profileCache`, one step further along: changing what is
 * compared re-runs the comparison, but nothing about a profile's own
 * per-iteration weights depends on what it is being compared with, and
 * re-deriving them is ~150ms per profile of markers and stacks. With three
 * loaded, that is most of what switching comparisons would otherwise cost.
 */
const statsCache = new Map<string, ProfileBenchmarkStats>();

function extractStatsCached(
  viewerUrl: string,
  profile: Profile
): ProfileBenchmarkStats {
  const cached = statsCache.get(viewerUrl);
  if (cached !== undefined) {
    return cached;
  }
  const stats = extractBenchmarkStatsFromProfile(profile);
  statsCache.set(viewerUrl, stats);
  return stats;
}

/**
 * Record that `newUrl` points at a profile that is already loaded, so that
 * switching the page over to it re-downloads nothing.
 *
 * This is for uploading: the uploaded copy is the profile already in memory,
 * and its stats are the ones already extracted.
 */
export function rememberRelocatedProfile(
  newUrl: string,
  loaded: LoadedProfile
): void {
  profileCache.set(
    newUrl,
    Promise.resolve({ profile: loaded.profile, viewerUrl: newUrl })
  );
  const stats = statsCache.get(loaded.viewerUrl);
  if (stats !== undefined) {
    statsCache.set(newUrl, stats);
  }
}

/**
 * Compare the subject at `urls[subject]` with the other profiles there, yielding
 * a fuller snapshot each time another part of the report exists.
 *
 * `comparand` is either one other profile, as an index into `urls`, or 'best':
 * every other profile, with each row measured against the fastest of them. See
 * best-of-others.ts. Any profile that is not on one side of the comparison is
 * still loaded and measured, as an extra mean column.
 *
 * Rejects with `signal`'s reason if it aborts — including part-way through a
 * bucket table, since finishing tables for a comparison the reader has already
 * replaced would keep the machine busy for seconds on nothing. Snapshots already
 * yielded stay valid; the consumer decides whether to keep showing them.
 */
export async function* runBenchmarkComparison(
  urls: string[],
  subject: number,
  comparand: Comparand,
  signal: AbortSignal,
  makeTableRunner: TableRunnerFactory = createInProcessTableRunner
): AsyncGenerator<ComparisonProgress, void, void> {
  const loaded = await Promise.all(urls.map(loadOneProfileCached));
  signal.throwIfAborted();

  // ~150ms per profile, in one pass each. Long enough to be felt as a hitch and
  // not long enough to be worth threading yield points through the marker and
  // stack derivation it goes through; a pause between them at least keeps any
  // one of them from being two profiles long.
  const stats: ProfileBenchmarkStats[] = [];
  for (const { profile, viewerUrl } of loaded) {
    await pause(signal);
    stats.push(extractStatsCached(viewerUrl, profile));
  }
  await pause(signal);

  yield* compareStatsProgressively(
    stats,
    subject,
    comparand,
    {
      profiles: loaded.map(({ profile }) => profile),
      viewerUrls: loaded.map(({ viewerUrl }) => viewerUrl),
    },
    signal,
    makeTableRunner
  );
}

/** The false discovery rate a row has to clear, before it is divided between
 * several comparisons. */
const ALPHA = 0.05;

const OVERALL_LABEL = 'Overall (geomean-normalised)';

/**
 * The staged half of `runBenchmarkComparison`: everything from the extracted
 * stats onwards, which is all of the arithmetic and none of the I/O.
 *
 * Separate from the loading so that it can be driven from stats built by hand —
 * the tests have those, and have no benchmark profile to extract them from.
 */
export async function* compareStatsProgressively(
  /** Every loaded profile's stats, in list order. */
  stats: ProfileBenchmarkStats[],
  subject: number,
  comparand: Comparand,
  sources: ComparisonSources,
  signal: AbortSignal,
  makeTableRunner: TableRunnerFactory = createInProcessTableRunner
): AsyncGenerator<ComparisonProgress, void, void> {
  // The profiles the subject is compared with, one pairwise comparison each.
  const comparands =
    comparand === 'best'
      ? stats.map((_, index) => index).filter((index) => index !== subject)
      : [comparand];
  const comparisonCount = comparands.length;
  if (comparisonCount === 0) {
    throw new Error(
      'A comparison needs a profile to compare the subject with.'
    );
  }
  // Every pairwise comparison is held to alpha / m, so that a row reported via
  // any one of them is still held to alpha. See best-of-others.ts.
  const familyWiseAlpha = ALPHA / comparisonCount;
  const subjectStats = stats[subject];
  const iterationCount =
    stats[comparands[0]].suites[0]?.iterationCount ??
    subjectStats.suites[0]?.iterationCount ??
    1;

  // Every profile's global (across-suite) bucket weights are normalised with
  // one shared set of per-suite factors, so that the rank statistics compare
  // like with like -- and so that a profile that is only a column is on the same
  // scale as the ones in the comparison. In list order, so that they do not
  // depend on which comparison is selected. See computeSharedSuiteFactors.
  const sharedSuiteFactors = computeSharedSuiteFactors(...stats);
  const globalBucketsOf = (index: number) =>
    computeGlobalBuckets(stats[index], sharedSuiteFactors, iterationCount);
  const subjectGlobalBuckets = globalBucketsOf(subject);
  const comparandGlobalBuckets = comparands.map(globalBucketsOf);

  // The score rows: ~45ms per comparison all told, and the table cannot be drawn
  // without them, so they are computed as one stage rather than streamed row by
  // row.
  const subjectGlobalIter = suiteIterationTotals(
    subjectGlobalBuckets,
    iterationCount
  );
  const pairwiseOverall: ScoreComparison[] = [];
  const pairwiseSuites: ScoreComparison[][] = [];
  comparands.forEach((comparandIndex, k) => {
    const overall = compareIterationTotals(
      OVERALL_LABEL,
      suiteIterationTotals(comparandGlobalBuckets[k], iterationCount),
      subjectGlobalIter
    );
    overall.mde = minimumDetectableEffect(overall, familyWiseAlpha);
    pairwiseOverall.push(overall);

    const suiteScores: ScoreComparison[] = [];
    for (const baseSuite of stats[comparandIndex].suites) {
      const newSuite = findSuite(subjectStats, baseSuite.suiteName);
      const baseIter = suiteIterationTotals(
        baseSuite.buckets,
        baseSuite.iterationCount
      );
      const newIter = newSuite
        ? suiteIterationTotals(newSuite.buckets, newSuite.iterationCount)
        : new Array<number>(baseSuite.iterationCount).fill(0);
      suiteScores.push(
        compareIterationTotals(baseSuite.suiteName, baseIter, newIter)
      );
    }
    applyBenjaminiHochberg(suiteScores, familyWiseAlpha);
    pairwiseSuites.push(suiteScores);
  });

  let overallScore: ComparedScore;
  let suiteScores: ComparedScore[];
  if (comparisonCount === 1) {
    overallScore = { ...pairwiseOverall[0], comparand: comparands[0] };
    suiteScores = pairwiseSuites[0].map((row) => ({
      ...row,
      comparand: comparands[0],
    }));
  } else {
    overallScore = combineAgainstFastest(
      pairwiseOverall.map((row, k) => ({ comparand: comparands[k], row })),
      comparisonCount,
      ALPHA
    );
    // The subject's subtests, compared with every other profile that ran them
    // too. A subtest that no other profile ran has nothing to be measured
    // against, and a profile that did not run one is not the fastest at it.
    suiteScores = [];
    for (const suite of subjectStats.suites) {
      const candidates = [];
      for (let k = 0; k < comparisonCount; k++) {
        const row = pairwiseSuites[k].find(
          (pairwise) => pairwise.label === suite.suiteName
        );
        if (row !== undefined) {
          candidates.push({ comparand: comparands[k], row });
        }
      }
      if (candidates.length > 0) {
        suiteScores.push(
          combineAgainstFastest(candidates, comparisonCount, ALPHA)
        );
      }
    }
  }
  suiteScores.sort((a, b) => a.label.localeCompare(b.label));

  const scores: ComparisonScores = { overallScore, suiteScores };

  // Cheap next to the score rows above -- no test is run against these, they are
  // sums over arrays that already exist -- so they are ready in time for the
  // first snapshot, and the extra columns fill in with the rest of the table
  // rather than after it.
  const otherMeans = new Map<number, ProfileMeans>();
  for (let index = 0; index < stats.length; index++) {
    const isOnEveryRow =
      index === subject || (comparisonCount === 1 && index === comparands[0]);
    if (!isOnEveryRow) {
      otherMeans.set(
        index,
        computeProfileMeans(
          stats[index],
          OVERALL_LABEL,
          sharedSuiteFactors,
          iterationCount
        )
      );
    }
  }

  // Tables are dispatched in the order the rows are listed, so the overall ones —
  // both the first and the slowest, ~1s against ~130ms for a subtest, since they
  // pool every bucket in the profile — start first. That is the right way round:
  // it is also the row a reader expands first.
  //
  // Which tables there will be is settled here rather than being discovered as we
  // go, because the rows without one have to be able to say so immediately. A
  // subtest that the subject did not run gets no table at all, and showing it a
  // spinner that never resolves would be a lie.
  const jobs: BucketTableJob[] = comparands.map((_, k) => ({
    label: overallScore.label,
    pairIndex: k,
    familyWiseAlpha,
    baseBuckets: comparandGlobalBuckets[k],
    newBuckets: subjectGlobalBuckets,
    iterationCount,
    splitAcrossThreads: true,
  }));
  for (const row of suiteScores) {
    const newSuite = findSuite(subjectStats, row.label);
    if (newSuite === undefined) {
      continue;
    }
    comparands.forEach((comparandIndex, k) => {
      const baseSuite = findSuite(stats[comparandIndex], row.label);
      if (baseSuite === undefined) {
        return;
      }
      jobs.push({
        label: row.label,
        pairIndex: k,
        familyWiseAlpha,
        baseBuckets: baseSuite.buckets,
        newBuckets: newSuite.buckets,
        iterationCount: baseSuite.iterationCount,
        splitAcrossThreads: false,
      });
    });
  }

  // The pairwise tables of each label that have come back so far, and how many
  // it is waiting for. A label's table is shown once all of them are in, since
  // which profile is the fastest of the others is not known before then.
  const expectedPerLabel = new Map<string, number>();
  for (const job of jobs) {
    expectedPerLabel.set(job.label, (expectedPerLabel.get(job.label) ?? 0) + 1);
  }
  const arrivedPerLabel = new Map<string, PairwiseBucketTable[]>();

  const tables = new Map<string, ComparedBucket[]>();
  let pendingLabels = [...expectedPerLabel.keys()];
  // A fresh map and list per snapshot: the one just yielded is what the page is
  // rendering from, and it has to keep saying what it said.
  const snapshot = (): ComparisonProgress => ({
    sources,
    scores,
    otherMeans,
    bucketTables: new Map(tables),
    pendingLabels,
  });

  yield snapshot();
  await pause(signal);

  // Matching two profiles' buckets is the same answer for every table of that
  // pair, so it happens here rather than in each of them — which is also what
  // keeps the key strings off the wire. See `matchBucketKeys`.
  const subjectSide = bucketTableSideOf(subjectStats);
  const pairs = comparands.map((comparandIndex) => {
    const meta: BucketTableMetadata = {
      base: bucketTableSideOf(stats[comparandIndex]),
      new: subjectSide,
    };
    return { keys: matchBucketKeys(meta), meta };
  });
  const runner = makeTableRunner({
    pairs,
    jobCount: jobs.length,
    signal,
  });
  try {
    // Every job submitted at once, and then taken in whatever order they come
    // back. Dispatch order is still the order the rows are listed, so a runner
    // that finishes them one at a time (which the in-process one does) resolves
    // the spinners top to bottom; a pool of threads will not, and the table only
    // ever grows, so the reader sees no difference beyond which spinner stops
    // first.
    const pending = new Map<number, Promise<TableResult>>();
    jobs.forEach((job, jobIndex) => {
      const result = runner.run(job).then((comparisons) => ({
        jobIndex,
        table: { comparand: comparands[job.pairIndex], rows: comparisons },
      }));
      // `Promise.race` handles whichever rejection it reports; the rest would be
      // unhandled rejections when a comparison is aborted with several jobs in
      // flight.
      result.catch(() => {});
      pending.set(jobIndex, result);
    });

    while (pending.size > 0) {
      const { jobIndex, table } = await Promise.race(pending.values());
      pending.delete(jobIndex);
      const { label } = jobs[jobIndex];
      const arrived = arrivedPerLabel.get(label) ?? [];
      arrived.push(table);
      arrivedPerLabel.set(label, arrived);
      if (arrived.length < (expectedPerLabel.get(label) ?? 0)) {
        continue;
      }
      tables.set(label, combinePairwiseTables(arrived, comparisonCount));
      arrivedPerLabel.delete(label);
      pendingLabels = pendingLabels.filter(
        (pendingLabel) => pendingLabel !== label
      );
      yield snapshot();
      await pause(signal);
    }
  } finally {
    // Also on the way out of an abort, and when a consumer stops reading the
    // generator without draining it.
    runner.dispose();
  }
}

/** One label's pairwise tables as the report shows them: as they are when there
 * is one, and combined against the fastest of the others when there are more. */
function combinePairwiseTables(
  tables: PairwiseBucketTable[],
  comparisonCount: number
): ComparedBucket[] {
  if (comparisonCount === 1) {
    const [{ comparand, rows }] = tables;
    return rows.map((row) => ({ ...row, comparand }));
  }
  return combineBucketTables(tables, comparisonCount, ALPHA);
}

type TableResult = { jobIndex: number; table: PairwiseBucketTable };

function findSuite(stats: ProfileBenchmarkStats, suiteName: string) {
  return stats.suites.find((suite) => suite.suiteName === suiteName);
}
