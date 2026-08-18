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
 * Each stage hands the main thread back before it starts and, for the tables,
 * every 12ms while it runs, so the page paints each row as it fills in and a click
 * on one of the profile links is dispatched while the rest is still computing. See
 * chunked-work.ts.
 */

import { fetchProfile } from 'firefox-profiler/utils/profile-fetch';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { getProfileFetchUrl } from 'firefox-profiler/actions/receive-profile';
import type { Profile } from 'firefox-profiler/types';

import { extractBenchmarkStatsFromProfile } from './extract-benchmark-stats';
import type { ProfileBenchmarkStats } from './extract-benchmark-stats';
import {
  applyBenjaminiHochberg,
  compareBucketsInSlices,
  compareIterationTotals,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
  suiteIterationTotals,
} from './compare-benchmark-stats';
import type {
  BucketComparison,
  ScoreComparison,
} from './compare-benchmark-stats';
import { runInSlices, yieldToBrowser } from './chunked-work';

/** What a comparison is *of*, as opposed to what it found: carried through into
 * every snapshot, since the flame graphs and the deep links out of them need it. */
export type ComparisonSources = {
  /** The `baseUrl`/`newUrl` after `expandUrl` resolves a share.firefox.dev
   * (or perfht.ml / bit.ly) shortlink to its full profiler.firefox.com URL --
   * or the original URL if it was already in that form. Deep links from each
   * bucket's flame graph are rewritten off *this* URL, so a shortened input
   * still yields a working link. */
  baseViewerUrl: string;
  newViewerUrl: string;
  /** The loaded source profiles, retained so we can render flame graphs of
   * individual buckets on demand (focusSelf on a bucket's representative func). */
  baseProfile: Profile;
  newProfile: Profile;
};

/**
 * The score rows, and everything else that exists as soon as the two profiles
 * have been read: enough to draw the whole table except for what is behind its
 * disclosure triangles.
 */
export type ComparisonScores = ComparisonSources & {
  overallScore: ScoreComparison;
  suiteScores: ScoreComparison[];
};

/**
 * What the report can show at one instant. Yielded by `runBenchmarkComparison`
 * once per piece of it that becomes available, and never mutated afterwards, so a
 * consumer can hold one of these in component state and re-render off it.
 */
export type ComparisonProgress = {
  scores: ComparisonScores;
  /**
   * The per-function comparisons behind each score row, keyed by that row's
   * label — `overallScore.label` for the geomean-normalised global view, and the
   * subtest name for a subtest. Only the ones computed so far.
   */
  bucketTables: Map<string, BucketComparison[]>;
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
 * Profiles already downloaded this session, keyed by viewer URL.
 *
 * Swapping the two sides, or replacing one of them, re-runs the whole
 * comparison — and these are multi-megabyte artifacts fetched from Taskcluster,
 * so re-downloading the side that did not change would make the swap button
 * unusable. Keyed by the URL the user typed, since that is what identifies a
 * profile here; entries are never evicted, which is fine for a page whose whole
 * job is comparing two of them.
 */
type LoadedProfile = {
  profile: Profile;
  /** The URL after any shortlink expansion. This is the URL that actually
   * points at a viewable profile in profiler.firefox.com; it's what deep
   * links from each bucket's flame graph get rewritten from. */
  viewerUrl: string;
};

const profileCache = new Map<string, Promise<LoadedProfile>>();

function loadOneProfileCached(inputUrl: string): Promise<LoadedProfile> {
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
 * Compare the two profiles at `baseUrl` and `newUrl`, yielding a fuller snapshot
 * each time another part of the report exists.
 *
 * Rejects with `signal`'s reason if it aborts — including part-way through a
 * bucket table, since finishing tables for a comparison the reader has already
 * replaced would keep the machine busy for seconds on nothing. Snapshots already
 * yielded stay valid; the consumer decides whether to keep showing them.
 */
export async function* runBenchmarkComparison(
  baseUrl: string,
  newUrl: string,
  signal: AbortSignal
): AsyncGenerator<ComparisonProgress, void, void> {
  const [
    { profile: baseProfile, viewerUrl: baseViewerUrl },
    { profile: newProfile, viewerUrl: newViewerUrl },
  ] = await Promise.all([
    loadOneProfileCached(baseUrl),
    loadOneProfileCached(newUrl),
  ]);
  signal.throwIfAborted();

  // ~150ms per profile, in one pass each. Long enough to be felt as a hitch and
  // not long enough to be worth threading yield points through the marker and
  // stack derivation it goes through; the two are at least separated, so neither
  // is waiting on the other's task.
  await pause(signal);
  const baseStats = extractBenchmarkStatsFromProfile(baseProfile);
  await pause(signal);
  const newStats = extractBenchmarkStatsFromProfile(newProfile);
  await pause(signal);

  yield* compareStatsProgressively(
    baseStats,
    newStats,
    { baseProfile, newProfile, baseViewerUrl, newViewerUrl },
    signal
  );
}

/**
 * The staged half of `runBenchmarkComparison`: everything from two extracted
 * stats files onwards, which is all of the arithmetic and none of the I/O.
 *
 * Separate from the loading so that it can be driven from a pair of stats built
 * by hand — the tests have those, and have no benchmark profile to extract them
 * from.
 */
export async function* compareStatsProgressively(
  baseStats: ProfileBenchmarkStats,
  newStats: ProfileBenchmarkStats,
  sources: ComparisonSources,
  signal: AbortSignal
): AsyncGenerator<ComparisonProgress, void, void> {
  const iterationCount = baseStats.suites[0]?.iterationCount ?? 1;

  // Both profiles' global (across-suite) bucket weights are normalised with
  // one shared set of per-suite factors, so that the rank statistics compare
  // like with like. See computeSharedSuiteFactors.
  const sharedSuiteFactors = computeSharedSuiteFactors(baseStats, newStats);
  const baseGlobalBuckets = computeGlobalBuckets(
    baseStats,
    sharedSuiteFactors,
    iterationCount
  );
  const newGlobalBuckets = computeGlobalBuckets(
    newStats,
    sharedSuiteFactors,
    iterationCount
  );

  // The score rows: ~45ms all told, and the table cannot be drawn without them,
  // so they are computed as one stage rather than streamed row by row.
  const baseGlobalIter = suiteIterationTotals(
    baseGlobalBuckets,
    iterationCount
  );
  const newGlobalIter = suiteIterationTotals(newGlobalBuckets, iterationCount);
  const overallScore = compareIterationTotals(
    'Overall (geomean-normalised)',
    baseGlobalIter,
    newGlobalIter
  );

  const suiteScores: ScoreComparison[] = [];
  for (const baseSuite of baseStats.suites) {
    const newSuite = findSuite(newStats, baseSuite.suiteName);
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
  applyBenjaminiHochberg(suiteScores);
  suiteScores.sort((a, b) => a.label.localeCompare(b.label));

  const scores: ComparisonScores = { ...sources, overallScore, suiteScores };

  // Tables are computed in the order the rows are listed, so the spinners resolve
  // top to bottom. The overall one is both the first and the slowest — ~1s against
  // ~130ms for a subtest, since it pools every bucket in the profile — which is
  // the right way round: it is also the row a reader expands first.
  //
  // Which tables there will be is settled here rather than being discovered as we
  // go, because the rows without one have to be able to say so immediately. A
  // subtest that only the base profile ran gets no table at all, and showing it a
  // spinner that never resolves would be a lie.
  const jobs = [
    {
      label: overallScore.label,
      baseBuckets: baseGlobalBuckets,
      newBuckets: newGlobalBuckets,
      iterations: iterationCount,
    },
  ];
  for (const row of suiteScores) {
    const baseSuite = findSuite(baseStats, row.label);
    const newSuite = findSuite(newStats, row.label);
    if (baseSuite === undefined || newSuite === undefined) {
      continue;
    }
    jobs.push({
      label: row.label,
      baseBuckets: baseSuite.buckets,
      newBuckets: newSuite.buckets,
      iterations: baseSuite.iterationCount,
    });
  }

  const tables = new Map<string, BucketComparison[]>();
  let pendingLabels = jobs.map((job) => job.label);
  // A fresh map and list per snapshot: the one just yielded is what the page is
  // rendering from, and it has to keep saying what it said.
  const snapshot = (): ComparisonProgress => ({
    scores,
    bucketTables: new Map(tables),
    pendingLabels,
  });

  yield snapshot();
  await pause(signal);

  for (const job of jobs) {
    const comparisons = await runInSlices(
      compareBucketsInSlices(
        job.baseBuckets,
        job.newBuckets,
        baseStats.bucketNames,
        newStats.bucketNames,
        baseStats.bucketFuncs,
        newStats.bucketFuncs,
        job.iterations,
        false,
        baseStats.bucketKeys ?? baseStats.bucketNames,
        newStats.bucketKeys ?? newStats.bucketNames
      ),
      signal
    );
    tables.set(job.label, comparisons);
    pendingLabels = pendingLabels.filter((label) => label !== job.label);
    yield snapshot();
    await pause(signal);
  }
}

function findSuite(stats: ProfileBenchmarkStats, suiteName: string) {
  return stats.suites.find((suite) => suite.suiteName === suiteName);
}
