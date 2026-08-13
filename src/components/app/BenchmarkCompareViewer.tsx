/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { useSelector } from 'react-redux';

import { AppHeader } from './AppHeader';
import {
  BenchmarkCompareForm,
  resolveBenchmarkProfileNames,
} from './BenchmarkCompareForm';
import {
  getProfileNamesToCompare,
  getProfilesToCompare,
} from 'firefox-profiler/selectors/url-state';
import { fetchProfile } from 'firefox-profiler/utils/profile-fetch';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { getProfileFetchUrl } from 'firefox-profiler/actions/receive-profile';
import { extractBenchmarkStatsFromProfile } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import {
  applyBenjaminiHochberg,
  classifyChange,
  compareBuckets,
  compareIterationTotals,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
  describeVerdict,
  suiteIterationTotals,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type {
  BucketComparison,
  ComparisonStats,
  ScoreComparison,
  Verdict,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import { pValueToConfidence } from 'firefox-profiler/profile-logic/benchmark/perf-compare-stats';
import type { ConfidenceRating } from 'firefox-profiler/profile-logic/benchmark/perf-compare-stats';
import type { Profile } from 'firefox-profiler/types';
import { BucketFlameGraphPair } from './BucketFlameGraphPair';
import {
  makeBucketProfileBundle,
  makeSuiteFilteredThread,
} from 'firefox-profiler/profile-logic/benchmark/bucket-flame-graph-data';
import type { BucketProfileBundle } from 'firefox-profiler/profile-logic/benchmark/bucket-flame-graph-data';
import './BenchmarkCompareViewer.css';

type ComparisonData = {
  baseUrl: string;
  newUrl: string;
  /** The loaded source profiles, retained so we can render flame graphs of
   * individual buckets on demand (focusSelf on a bucket's representative func). */
  baseProfile: Profile;
  newProfile: Profile;
  overallScore: ScoreComparison;
  suiteScores: ScoreComparison[];
  suiteComparisons: Array<{
    suiteName: string;
    comparisons: BucketComparison[];
  }>;
  /** Per-bucket comparisons across all suites, using the geomean-normalised
   * global bucket weights. A bucket that runs in a single suite gets the same
   * effect size and p-value here as in that suite's own comparison; one that
   * runs in several can be significant here without being significant in any
   * single suite, since the global view pools their iterations. */
  globalComparisons: BucketComparison[];
};

type State =
  | { phase: 'empty' }
  | { phase: 'loading' }
  | { phase: 'error'; error: string }
  | { phase: 'done'; data: ComparisonData };

const TOP_N = 100;

/**
 * How much of the overall score a bucket has to move to be worth a row.
 *
 * This is a *materiality* floor, not error control -- `SIGNIFICANCE_Q` does the
 * error control now, and the two jobs are separate. A bucket can be a rock-solid
 * discovery and still not be worth anyone's afternoon: on the two reference
 * profile pairs the rows that clear q ≤ 0.05 but not this floor are a function
 * that went from 0.04ms to 0.15ms and one that appeared at 0.06ms. Both are
 * almost certainly real. Neither is actionable.
 *
 * 0.01%. That is an order of magnitude below the 0.04% this used to be, and the
 * slack came from replacing the uncorrected p-value: the floor was previously
 * doubling as the only defence against ~340 expected false positives, which took
 * a threshold high enough to also hide real small changes.
 *
 * Not a tuned edge. Across the two reference pairs, the q ≤ 0.05 rows that fall
 * below this floor are at 0.0039% and 0.0066%, and the ones above it start at
 * 0.0298% -- anything from 0.008% to 0.02% gives the same answer.
 */
const MIN_SCORE_IMPACT = 0.0001;

/**
 * False discovery rate a bucket row has to clear.
 *
 * `q`, not `p`. There are ~6800 buckets in the global view and ~120 to ~800 in
 * each subtest view, so an uncorrected p ≤ 0.05 admits hundreds of rows from two
 * builds that do not differ at all -- 133 of them, measured. `q ≤ 0.05` says
 * instead that about one row in twenty of *what is shown* is expected to be
 * spurious, which is a claim worth making. See
 * docs-developer/benchmark-compare-fdr.md.
 */
const SIGNIFICANCE_Q = 0.05;

type BucketFilterMode = 'movers' | 'significant' | 'none';

const BUCKET_FILTER_MODES: Array<{
  mode: BucketFilterMode;
  label: string;
  title: string;
}> = [
  {
    mode: 'movers',
    label: 'Moved the score',
    title:
      'Buckets that survive the multiple-comparisons correction (q ≤ 0.05) and ' +
      'shifted the overall score by at least 0.01%. On a comparison of two ' +
      'builds that do not differ, this shows nothing.',
  },
  {
    mode: 'significant',
    label: 'All discoveries',
    title:
      'Every bucket with q ≤ 0.05, however small its impact. About one row in ' +
      'twenty of these is expected to be spurious.',
  },
  {
    mode: 'none',
    label: 'Unfiltered',
    title: 'Every bucket, ranked by absolute impact.',
  },
];

const DEFAULT_BUCKET_FILTER_MODE: BucketFilterMode = 'movers';

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
const profileCache = new Map<string, Promise<Profile>>();

function loadOneProfileCached(viewerUrl: string): Promise<Profile> {
  const cached = profileCache.get(viewerUrl);
  if (cached !== undefined) {
    return cached;
  }
  // Don't cache a rejection: a failed fetch is usually transient, and the
  // obvious way to retry is to press the button again.
  const promise = loadOneProfile(viewerUrl).catch((err) => {
    profileCache.delete(viewerUrl);
    throw err;
  });
  profileCache.set(viewerUrl, promise);
  return promise;
}

async function loadOneProfile(viewerUrl: string) {
  let url = viewerUrl;
  if (
    url.startsWith('https://perfht.ml/') ||
    url.startsWith('https://share.firefox.dev/') ||
    url.startsWith('https://bit.ly/')
  ) {
    url = await expandUrl(url);
  }
  const dataUrl = getProfileFetchUrl(url);
  const response = await fetchProfile({
    url: dataUrl,
    onTemporaryError: () => {},
  });
  if (response.responseType !== 'BYTES') {
    throw new Error('Expected a profile, not a zip file.');
  }
  return unserializeProfileOfArbitraryFormat(response.bytes, dataUrl);
}

async function computeComparison(
  baseUrl: string,
  newUrl: string
): Promise<ComparisonData> {
  const [baseProfile, newProfile] = await Promise.all([
    loadOneProfileCached(baseUrl),
    loadOneProfileCached(newUrl),
  ]);

  const baseStats = extractBenchmarkStatsFromProfile(baseProfile);
  const newStats = extractBenchmarkStatsFromProfile(newProfile);

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
    const newSuite = newStats.suites.find(
      (s) => s.suiteName === baseSuite.suiteName
    );
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

  const suiteComparisons = baseStats.suites.flatMap((baseSuite) => {
    const newSuite = newStats.suites.find(
      (s) => s.suiteName === baseSuite.suiteName
    );
    if (!newSuite) {
      return [];
    }
    const comparisons = compareBuckets(
      baseSuite.buckets,
      newSuite.buckets,
      baseStats.bucketNames,
      newStats.bucketNames,
      baseStats.bucketFuncs,
      newStats.bucketFuncs,
      baseSuite.iterationCount,
      false,
      baseStats.bucketKeys ?? baseStats.bucketNames,
      newStats.bucketKeys ?? newStats.bucketNames
    );
    return [{ suiteName: baseSuite.suiteName, comparisons }];
  });
  suiteComparisons.sort((a, b) => a.suiteName.localeCompare(b.suiteName));

  const globalComparisons = compareBuckets(
    baseGlobalBuckets,
    newGlobalBuckets,
    baseStats.bucketNames,
    newStats.bucketNames,
    baseStats.bucketFuncs,
    newStats.bucketFuncs,
    iterationCount,
    false,
    baseStats.bucketKeys ?? baseStats.bucketNames,
    newStats.bucketKeys ?? newStats.bucketNames
  );

  return {
    baseUrl,
    newUrl,
    baseProfile,
    newProfile,
    overallScore,
    suiteScores,
    suiteComparisons,
    globalComparisons,
  };
}

/**
 * Given a relative change of a single subtest's mean, compute the resulting
 * relative change in the overall geomean across `numSuites` subtests, assuming
 * the other subtests are unchanged. Exact (not a linearization):
 *   newGeomean / baseGeomean = (newSuiteMean / baseSuiteMean)^(1/N)
 */
function impactOnGeomean(suiteRel: number, numSuites: number): number {
  if (!isFinite(suiteRel)) {
    return suiteRel;
  }
  return Math.pow(1 + suiteRel, 1 / numSuites) - 1;
}

/**
 * Confidence to judge and colour a row by.
 *
 * For a bucket, that is the corrected q-value: its raw p-value is one of
 * thousands from the same table, and reading it on its own is what made the
 * unfiltered view a wall of coloured noise. Score rows have no family to be
 * corrected against, so they keep their own p-value.
 *
 * The same cut points serve both, which is a deliberate reuse rather than an
 * oversight. `pValueToConfidence` is really asking "how much of this could be
 * chance", and both quantities answer that on a 0-1 scale where small is good --
 * a q of 0.15 means about one row in seven of what is shown is noise, which is
 * the same "worth a look, not established" that a p of 0.15 conveys. They are
 * not interchangeable *quantities*, but they support the same three verdicts.
 */
function correctedConfidence(row: ComparisonStats): ConfidenceRating {
  return pValueToConfidence(row.qValue ?? row.pValue);
}

/**
 * Tooltip for the MDE cell, spelling out what the number means for this row.
 * The distinction it exists to draw: "did not move" and "could not tell" both
 * show no significant change, and only the MDE separates them.
 */
function mdeTitle(row: ComparisonStats): string {
  const method = row.pValueMethod === 'permutation' ? 'permutation' : 'Welch t';
  const p =
    row.qValue === null
      ? `p=${row.pValue.toPrecision(2)} (${method})`
      : `q=${row.qValue.toPrecision(2)}, from p=${row.pValue.toPrecision(2)} ` +
        `(${method}) corrected for every bucket in this table`;
  const mde = `\u00b1${row.mde.toFixed(2)}`;
  const verdict = classifyChange(row);
  if (verdict === 'slower' || verdict === 'faster') {
    return `${p}. Smallest change that would have been reported: ${mde}.`;
  }
  return `${p}. ${describeVerdict(verdict, mde)}`;
}

function formatChange(rel: number): string {
  if (!isFinite(rel)) {
    return rel > 0 ? 'appeared' : 'disappeared';
  }
  const pct = (rel * 100).toFixed(2);
  return rel >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Impact on the overall score at which a Δ% cell gets full emphasis: 0.1%, ten
 * times the floor for being shown at all. On the reference pair whose only code
 * change was in canvas, that picks out exactly the two buckets the work moved
 * between (+0.140% and −0.128%) and leaves the third (−0.049%) a tier down.
 */
const BOLD_SCORE_IMPACT = 0.001;

/**
 * Colour and weight for a Δ% cell.
 *
 * Two independent channels, for the two questions a reader has. **Colour** is
 * confidence: is this real. **Weight** is impact on the overall score: does it
 * matter. Keeping them separate is what lets a row read as
 * obviously-real-but-tiny, or as big-but-unproven, without the styling implying
 * something it should not.
 *
 * Weight used to come from the standardised effect size, which was wrong twice
 * over. Cohen's d divides by the row's own spread, so it emphasised whichever
 * rows happened to be quiet rather than whichever ones moved the benchmark --
 * the same objection that got d removed from the row *filter*, applied to the
 * styling. And nothing tied it to significance, so a bucket could come out bold
 * on the strength of a large d while its q-value sat at 1.0.
 */
function changeClass(
  relChange: number,
  confidence: ConfidenceRating,
  impactOnOverall: number
): string {
  if (!isFinite(relChange) || relChange === 0) {
    return '';
  }
  const direction = relChange > 0 ? 'regressed' : 'improved';
  const classes = [];
  // Only color the text (and add background shading) when we have at least
  // medium confidence. Below that, leave the text in the default color.
  if (confidence === 'HIGH') {
    classes.push(`benchmarkCell--${direction}`, 'benchmarkCell--conf-high');
  } else if (confidence === 'MEDIUM') {
    classes.push(`benchmarkCell--${direction}`, 'benchmarkCell--conf-medium');
  }
  const impact = Math.abs(impactOnOverall);
  if (impact >= BOLD_SCORE_IMPACT) {
    classes.push('benchmarkCell--effect-large');
  } else if (impact >= MIN_SCORE_IMPACT) {
    classes.push('benchmarkCell--effect-moderate');
  }
  // Below the floor for being worth a row at all: normal weight.
  return classes.join(' ');
}

/**
 * The whole point of the view in one word per row, because the reader's question
 * is "did my patch change anything, and did it make anything worse" and they may
 * not want to interpret a q-value to find out.
 */
const VERDICT_LABELS: Record<Verdict, string> = {
  slower: 'slower',
  faster: 'faster',
  unchanged: 'no change',
  unresolved: "can't tell",
};

function VerdictCell({ row }: { row: ComparisonStats }) {
  const verdict = classifyChange(row);
  return (
    <td
      className={`benchmarkCell--verdict benchmarkCell--verdict-${verdict}`}
      title={describeVerdict(verdict, `±${row.mde.toFixed(2)}`)}
    >
      {VERDICT_LABELS[verdict]}
    </td>
  );
}

const SCORE_TABLE_COLUMN_COUNT = 9;

/**
 * The q-value cell. Two significant figures is all the permutation resolves, and
 * the floor of 1 / (drawCount + 1) is shown as "≤" rather than as a number the
 * calibration cannot actually support.
 */
function formatQValue(q: number): string {
  if (q < 0.001) {
    return '≤0.001';
  }
  return q >= 0.1 ? q.toFixed(2) : q.toPrecision(2);
}

function QValueCell({ row }: { row: ComparisonStats }) {
  if (row.qValue === null) {
    return <td className="benchmarkCell--number benchmarkCell--q">—</td>;
  }
  const text = formatQValue(row.qValue);
  const familyWise =
    row.familyWiseP === null
      ? ''
      : ` Chance that any bucket in the table would look this extreme with ` +
        `nothing changed anywhere: ${row.familyWiseP.toPrecision(2)}.`;
  return (
    <td
      className="benchmarkCell--number benchmarkCell--q"
      title={`Expected share of noise among the rows at least this extreme: ${text}.${familyWise}`}
    >
      {text}
    </td>
  );
}

function ScoreRow({
  row,
  isOverall,
  numSuites,
}: {
  row: ScoreComparison;
  isOverall: boolean;
  numSuites: number;
}) {
  const absDiff = row.newMean - row.baseMean;
  const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
  // For the overall row, the score IS the geomean — there's no enclosing
  // subtest, so leave the subtest column blank, and the overall column shows
  // the actual measured geomean relChange. For a subtest row, the subtest's
  // relChange is its own, and we compute its impact on the overall geomean
  // assuming only this subtest changed.
  const subtestRel = isOverall ? null : row.relChange;
  const overallRel = isOverall
    ? row.relChange
    : impactOnGeomean(row.relChange, numSuites);
  return (
    <>
      <td className="benchmarkCell--number">{row.baseMean.toFixed(2)}</td>
      <td className="benchmarkCell--number">{row.newMean.toFixed(2)}</td>
      <td className="benchmarkCell--number">{absDiffStr}</td>
      <td
        className="benchmarkCell--number benchmarkCell--mde"
        title={mdeTitle(row)}
      >
        {'\u00b1' + row.mde.toFixed(2)}
      </td>
      <td
        className={
          subtestRel === null
            ? 'benchmarkCell--number'
            : `benchmarkCell--number ${changeClass(subtestRel, correctedConfidence(row), overallRel)}`
        }
      >
        {subtestRel === null ? '—' : formatChange(subtestRel)}
      </td>
      <td
        className={`benchmarkCell--number ${changeClass(overallRel, correctedConfidence(row), overallRel)}`}
      >
        {formatChange(overallRel)}
      </td>
      <QValueCell row={row} />
      <VerdictCell row={row} />
    </>
  );
}

type BucketRow = {
  c: BucketComparison;
  absDiff: number;
  /** Null in the overall expansion, where there is no enclosing subtest. */
  subtestRel: number | null;
  overallRel: number;
};

/**
 * The rows of a bucket table: every bucket that passes `filterMode`, with the
 * two relative figures the table displays.
 *
 * This lives outside `BucketTable` because the count is needed before the table
 * exists -- the badge on a collapsed subtest row is exactly this list's length,
 * and it has to agree with what expanding the row shows. Unsorted and uncapped;
 * `BucketTable` does both, since neither changes the count of what matched.
 */
function bucketRowsForFilter(
  comparisons: BucketComparison[],
  enclosingBaseMean: number,
  isOverall: boolean,
  numSuites: number,
  filterMode: BucketFilterMode
): BucketRow[] {
  const rows: BucketRow[] = [];
  for (const c of comparisons) {
    const absDiff = c.newMean - c.baseMean;
    const impactRel =
      enclosingBaseMean === 0 ? Infinity : absDiff / enclosingBaseMean;
    const overallRel = isOverall
      ? impactRel
      : impactOnGeomean(impactRel, numSuites);
    if (filterMode !== 'none') {
      // qValue is null only if the family could not be calibrated at all, in
      // which case the uncorrected p-value is the best there is.
      if ((c.qValue ?? c.pValue) > SIGNIFICANCE_Q) {
        continue;
      }
      if (filterMode === 'movers' && Math.abs(overallRel) < MIN_SCORE_IMPACT) {
        continue;
      }
    }
    rows.push({
      c,
      absDiff,
      subtestRel: isOverall ? null : impactRel,
      overallRel,
    });
  }
  return rows;
}

/**
 * How many functions an expansion would show, next to the row that expands it.
 *
 * Most subtests have nothing to show under the default filter, and finding that
 * out used to cost a click each. A "0" here is a result in its own right, so it
 * stays visible rather than being hidden -- just unshaded, so the eye skips it.
 */
function BucketCountBadge({
  count,
  filterMode,
}: {
  count: number;
  filterMode: BucketFilterMode;
}) {
  const noun = count === 1 ? 'function' : 'functions';
  let title;
  switch (filterMode) {
    case 'movers':
      title =
        `${count} ${noun} here both survived the multiple-comparisons ` +
        `correction (q ≤ 0.05) and moved the overall score by 0.01% or more.`;
      break;
    case 'significant':
      title = `${count} ${noun} here survived the multiple-comparisons correction (q ≤ 0.05).`;
      break;
    case 'none':
      title = `${count} ${noun} here, unfiltered.`;
      break;
    default:
      throw new Error(`Unhandled filter mode ${filterMode as string}`);
  }
  if (count > TOP_N) {
    title += ` Only the top ${TOP_N} by absolute change are listed.`;
  }
  return (
    <span
      className={`benchmarkBadge${count === 0 ? ' benchmarkBadge--zero' : ''}`}
      title={title}
    >
      {count}
    </span>
  );
}

function ScoreTable({
  overallScore,
  suiteScores,
  suiteComparisonsByName,
  globalComparisons,
  filterMode,
  baseBundle,
  newBundle,
  baseViewerUrl,
  newViewerUrl,
}: {
  overallScore: ScoreComparison;
  suiteScores: ScoreComparison[];
  suiteComparisonsByName: Map<string, BucketComparison[]>;
  globalComparisons: BucketComparison[];
  filterMode: BucketFilterMode;
  baseBundle: BucketProfileBundle;
  newBundle: BucketProfileBundle;
  baseViewerUrl: string;
  newViewerUrl: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const numSuites = suiteScores.length;

  const handleToggle = useCallback((e: MouseEvent<HTMLTableRowElement>) => {
    const label = e.currentTarget.dataset.toggleLabel;
    if (label === undefined) {
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const overallExpanded = expanded.has(overallScore.label);
  const overallExpandable = globalComparisons.length > 0;

  // The badge counts are the same filtering the expansions do, run for every
  // row whether or not it is expanded, so they are worth memoising: the overall
  // list alone is ~6800 buckets and this otherwise reruns on every expand.
  const overallBucketCount = useMemo(
    () =>
      bucketRowsForFilter(
        globalComparisons,
        overallScore.baseMean,
        true,
        numSuites,
        filterMode
      ).length,
    [globalComparisons, overallScore.baseMean, numSuites, filterMode]
  );
  const suiteBucketCounts = useMemo(
    () =>
      new Map(
        suiteScores.map((row) => {
          const comparisons = suiteComparisonsByName.get(row.label);
          return [
            row.label,
            comparisons === undefined
              ? null
              : bucketRowsForFilter(
                  comparisons,
                  row.baseMean,
                  false,
                  numSuites,
                  filterMode
                ).length,
          ];
        })
      ),
    [suiteScores, suiteComparisonsByName, numSuites, filterMode]
  );

  return (
    <table className="benchmarkTable">
      <thead>
        <tr>
          <th>Score</th>
          <th className="benchmarkCell--number benchmarkCell--colFixed">
            Base mean
          </th>
          <th className="benchmarkCell--number benchmarkCell--colFixed">
            New mean
          </th>
          <th className="benchmarkCell--number benchmarkCell--colFixed">
            Δ abs
          </th>
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={
              'Minimum detectable effect: the smallest Δ abs this row could have ' +
              'shown and still been reported. A blank Δ% next to a small MDE means ' +
              'it really did not move; next to a large MDE it means the measurement ' +
              'could not resolve it. For a bucket this is the bar its whole table ' +
              'imposes, so the same bucket has a larger MDE in the 6800-row overall ' +
              'view than in a subtest of a few hundred.'
            }
          >
            MDE
          </th>
          <th className="benchmarkCell--number benchmarkCell--colFixed">
            Δ% subtest
          </th>
          <th className="benchmarkCell--number benchmarkCell--colFixed">
            Δ% overall
          </th>
          <th
            className="benchmarkCell--number benchmarkCell--colNarrow"
            title={
              'False discovery rate: the share of the rows at least this extreme ' +
              'that are expected to be noise. Already corrected for every bucket ' +
              'in the table, so it is comparable between a 20-row subtest and the ' +
              '6800-row overall view. Blank on score rows, which are not one of a ' +
              'family.'
            }
          >
            q
          </th>
          <th
            className="benchmarkCell--colVerdict"
            title={
              'What this row is telling you. "no change" and "can\'t tell" are ' +
              'different answers: the first means a change worth caring about ' +
              'would have shown up and did not, the second means this comparison ' +
              'was not sensitive enough to say either way — check the MDE.'
            }
          >
            Verdict
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          className={`benchmarkRow--overall${overallExpandable ? ' benchmarkRow--suite-expandable' : ''}`}
          data-toggle-label={overallScore.label}
          onClick={overallExpandable ? handleToggle : undefined}
        >
          <td
            className="benchmarkCell--suiteLabel benchmarkCell--scoreLabel"
            title={overallScore.label}
          >
            <div className="benchmarkScoreLabel">
              {overallExpandable ? (
                <span className="benchmarkDisclosure" aria-hidden="true">
                  {overallExpanded ? '▼' : '▶'}
                </span>
              ) : null}
              <span className="benchmarkScoreLabel__text">
                {overallScore.label}
              </span>
              {overallExpandable ? (
                <BucketCountBadge
                  count={overallBucketCount}
                  filterMode={filterMode}
                />
              ) : null}
            </div>
          </td>
          <ScoreRow row={overallScore} isOverall={true} numSuites={numSuites} />
        </tr>
        {overallExpanded && overallExpandable ? (
          <tr className="benchmarkRow--expansion">
            <td colSpan={SCORE_TABLE_COLUMN_COUNT}>
              <BucketTable
                comparisons={globalComparisons}
                label={overallScore.label}
                enclosingBaseMean={overallScore.baseMean}
                isOverall={true}
                numSuites={numSuites}
                filterMode={filterMode}
                baseBundle={baseBundle}
                newBundle={newBundle}
                baseViewerUrl={baseViewerUrl}
                newViewerUrl={newViewerUrl}
              />
            </td>
          </tr>
        ) : null}
        {suiteScores.map((row) => {
          const isExpanded = expanded.has(row.label);
          const comparisons = suiteComparisonsByName.get(row.label);
          const expandable = comparisons !== undefined;
          const bucketCount = suiteBucketCounts.get(row.label) ?? null;
          return (
            <Fragment key={row.label}>
              <tr
                className={
                  expandable ? 'benchmarkRow--suite-expandable' : undefined
                }
                data-toggle-label={row.label}
                onClick={expandable ? handleToggle : undefined}
              >
                <td
                  className="benchmarkCell--indented benchmarkCell--suiteLabel benchmarkCell--scoreLabel"
                  title={row.label}
                >
                  <div className="benchmarkScoreLabel">
                    {expandable ? (
                      <span className="benchmarkDisclosure" aria-hidden="true">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    ) : null}
                    <span className="benchmarkScoreLabel__text">
                      {row.label}
                    </span>
                    {bucketCount === null ? null : (
                      <BucketCountBadge
                        count={bucketCount}
                        filterMode={filterMode}
                      />
                    )}
                  </div>
                </td>
                <ScoreRow row={row} isOverall={false} numSuites={numSuites} />
              </tr>
              {isExpanded && comparisons ? (
                <tr className="benchmarkRow--expansion">
                  <td colSpan={SCORE_TABLE_COLUMN_COUNT}>
                    <BucketTable
                      comparisons={comparisons}
                      label={row.label}
                      enclosingBaseMean={row.baseMean}
                      isOverall={false}
                      numSuites={numSuites}
                      filterMode={filterMode}
                      baseBundle={baseBundle}
                      newBundle={newBundle}
                      baseViewerUrl={baseViewerUrl}
                      newViewerUrl={newViewerUrl}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function BucketTable({
  comparisons,
  label,
  enclosingBaseMean,
  isOverall,
  numSuites,
  filterMode,
  baseBundle,
  newBundle,
  baseViewerUrl,
  newViewerUrl,
}: {
  comparisons: BucketComparison[];
  label: string;
  /** Base mean of the enclosing score row (overall row or subtest row).
   * Each bucket's absDiff is expressed relative to this to compute the
   * bucket's impact on the enclosing score. */
  enclosingBaseMean: number;
  /** True when this table is expanded under the overall row (globalBuckets).
   * The Δ% subtest column then shows "—" and the Δ% overall column shows
   * absDiff / enclosingBaseMean directly (global buckets are already
   * geomean-normalised, so their contributions sum linearly to the overall
   * score). When false, subtest is absDiff / enclosingBaseMean and overall
   * comes from impactOnGeomean. */
  isOverall: boolean;
  numSuites: number;
  filterMode: BucketFilterMode;
  baseBundle: BucketProfileBundle;
  newBundle: BucketProfileBundle;
  /** Viewer URLs of the two source profiles, forwarded to BucketFlameGraphPair
   * so its "open in a new profiler tab" link can point back at the original
   * profile. */
  baseViewerUrl: string;
  newViewerUrl: string;
}) {
  const columnCount = SCORE_TABLE_COLUMN_COUNT;

  // For a subtest expansion, filter to samples inside that suite's iteration
  // markers so flame graphs reflect only what contributed to the subtest
  // score. For the overall expansion, we want the full profile since global
  // buckets aggregate across all suites.
  const baseInnerBundle = useMemo(
    () => (isOverall ? baseBundle : withSuiteFilteredThread(baseBundle, label)),
    [baseBundle, label, isOverall]
  );
  const newInnerBundle = useMemo(
    () => (isOverall ? newBundle : withSuiteFilteredThread(newBundle, label)),
    [newBundle, label, isOverall]
  );

  // Keyed by BucketComparison.key (a source-location string for JS funcs,
  // otherwise the bucket name). The row index would drift when the effect-size
  // slider changes the filtered/sorted list, so an expanded row would appear
  // to "jump" to whichever different bucket now sits at that index.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const handleToggle = useCallback((e: MouseEvent<HTMLTableRowElement>) => {
    const key = e.currentTarget.dataset.toggleKey;
    if (key === undefined) {
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // The same list the collapsed row's badge counted, now ranked and capped.
  const significant = bucketRowsForFilter(
    comparisons,
    enclosingBaseMean,
    isOverall,
    numSuites,
    filterMode
  )
    .sort((a, b) => Math.abs(b.absDiff) - Math.abs(a.absDiff))
    .slice(0, TOP_N);

  if (significant.length === 0) {
    return (
      <p className="benchmarkNoChanges">
        {filterMode === 'movers'
          ? `Nothing in ${label} both survived the multiple-comparisons correction and moved the overall score by 0.01% or more.`
          : `No bucket in ${label} survived the multiple-comparisons correction (q ≤ 0.05).`}
      </p>
    );
  }

  return (
    <table className="benchmarkTable benchmarkTable--buckets">
      {/* Column widths come from the colgroup so we don't need a thead. The
       * headers in the outer score table double as labels for these aligned
       * columns. */}
      <colgroup>
        <col />
        <col className="benchmarkCell--colFixed" />
        <col className="benchmarkCell--colFixed" />
        <col className="benchmarkCell--colFixed" />
        <col className="benchmarkCell--colFixed" />
        <col className="benchmarkCell--colFixed" />
        <col className="benchmarkCell--colFixed" />
        <col className="benchmarkCell--colNarrow" />
        <col className="benchmarkCell--colVerdict" />
      </colgroup>
      <tbody>
        {significant.map(({ c, absDiff, subtestRel, overallRel }) => {
          const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
          // A bucket can be expanded if at least one side has a func index.
          // (If both are null it's a degenerate "appeared/disappeared with no
          // attributable func" case.)
          const expandable = c.baseFunc !== null || c.newFunc !== null;
          const isExpanded = expanded.has(c.key);
          return (
            <Fragment key={c.key}>
              <tr
                className={
                  expandable ? 'benchmarkRow--bucket-expandable' : undefined
                }
                data-toggle-key={c.key}
                onClick={expandable ? handleToggle : undefined}
              >
                <td className="benchmarkCell--bucketName" title={c.bucketName}>
                  {expandable ? (
                    <span className="benchmarkDisclosure" aria-hidden="true">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  ) : null}
                  {c.bucketName}
                </td>
                <td className="benchmarkCell--number">
                  {c.baseMean.toFixed(2)}
                </td>
                <td className="benchmarkCell--number">
                  {c.newMean.toFixed(2)}
                </td>
                <td className="benchmarkCell--number">{absDiffStr}</td>
                <td
                  className="benchmarkCell--number benchmarkCell--mde"
                  title={mdeTitle(c)}
                >
                  {'\u00b1' + c.mde.toFixed(2)}
                </td>
                <td
                  className={
                    subtestRel === null
                      ? 'benchmarkCell--number'
                      : `benchmarkCell--number ${changeClass(subtestRel, correctedConfidence(c), overallRel)}`
                  }
                >
                  {subtestRel === null ? '—' : formatChange(subtestRel)}
                </td>
                <td
                  className={`benchmarkCell--number ${changeClass(overallRel, correctedConfidence(c), overallRel)}`}
                >
                  {formatChange(overallRel)}
                </td>
                <QValueCell row={c} />
                <VerdictCell row={c} />
              </tr>
              {expandable && isExpanded ? (
                <tr className="benchmarkRow--bucket-expansion">
                  <td colSpan={columnCount}>
                    <BucketFlameGraphPair
                      baseBundle={baseInnerBundle}
                      newBundle={newInnerBundle}
                      baseFunc={c.baseFunc}
                      newFunc={c.newFunc}
                      baseViewerUrl={baseViewerUrl}
                      newViewerUrl={newViewerUrl}
                      suiteName={isOverall ? null : label}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Return a copy of `bundle` whose `thread` has sample weights zeroed outside
 * this suite's iteration markers (matching the filtering applied to the suite
 * count). All other bundle fields are shared with the input. */
function withSuiteFilteredThread(
  bundle: BucketProfileBundle,
  suiteName: string
): BucketProfileBundle {
  return { ...bundle, thread: makeSuiteFilteredThread(bundle, suiteName) };
}

function ComparisonResults({ data }: { data: ComparisonData }) {
  const suiteComparisonsByName = useMemo(
    () =>
      new Map(
        data.suiteComparisons.map(({ suiteName, comparisons }) => [
          suiteName,
          comparisons,
        ])
      ),
    [data.suiteComparisons]
  );

  const baseBundle = useMemo(
    () => makeBucketProfileBundle(data.baseProfile, 'speedometer'),
    [data.baseProfile]
  );
  const newBundle = useMemo(
    () => makeBucketProfileBundle(data.newProfile, 'speedometer'),
    [data.newProfile]
  );

  const [filterMode, setFilterMode] = useState<BucketFilterMode>(
    DEFAULT_BUCKET_FILTER_MODE
  );

  const handleFilterModeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setFilterMode(e.currentTarget.value as BucketFilterMode);
    },
    []
  );

  return (
    <div className="benchmarkResults">
      <h3 className="benchmarkSectionTitle">Score and subtest totals</h3>
      <div className="benchmarkFilters">
        <span className="benchmarkFilter__label">Show buckets that</span>
        {BUCKET_FILTER_MODES.map(({ mode, label, title }) => (
          <label className="benchmarkFilter" key={mode} title={title}>
            <input
              type="radio"
              name="benchmarkBucketFilter"
              value={mode}
              checked={filterMode === mode}
              onChange={handleFilterModeChange}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <ScoreTable
        overallScore={data.overallScore}
        suiteScores={data.suiteScores}
        suiteComparisonsByName={suiteComparisonsByName}
        globalComparisons={data.globalComparisons}
        filterMode={filterMode}
        baseBundle={baseBundle}
        newBundle={newBundle}
        baseViewerUrl={data.baseUrl}
        newViewerUrl={data.newUrl}
      />
    </div>
  );
}

export function BenchmarkCompareViewer() {
  const profilesToCompare = useSelector(getProfilesToCompare);
  const profileNamesToCompare = useSelector(getProfileNamesToCompare);
  const [state, setState] = useState<State>({ phase: 'empty' });

  // Destructured into two strings rather than kept as an array, so that the
  // effect doesn't re-run (and re-compute a ~7000-bucket comparison) every time
  // an unrelated dispatch hands us a fresh array with the same contents.
  const baseUrl = profilesToCompare?.[0] ?? '';
  const newUrl = profilesToCompare?.[1] ?? '';
  const [baseName, newName] = resolveBenchmarkProfileNames(
    profileNamesToCompare
  );

  useEffect(() => {
    // A second edit while the first pair is still downloading would otherwise
    // race, and whichever finished last would win.
    let cancelled = false;
    if (baseUrl === '' || newUrl === '') {
      setState({ phase: 'empty' });
    } else {
      setState({ phase: 'loading' });
      computeComparison(baseUrl, newUrl)
        .then((data) => !cancelled && setState({ phase: 'done', data }))
        .catch(
          (err) =>
            !cancelled &&
            setState({ phase: 'error', error: String(err?.message ?? err) })
        );
    }
    return () => {
      cancelled = true;
    };
  }, [baseUrl, newUrl]);

  const form = (
    <BenchmarkCompareForm
      // Remount when the compared pair changes (including via history
      // navigation) so the inputs show what is actually on screen.
      key={`${baseUrl}\n${newUrl}\n${baseName}\n${newName}`}
      initialUrls={[baseUrl, newUrl]}
      initialNames={[baseName, newName]}
      submitLabel={state.phase === 'empty' ? 'Compare' : 'Update comparison'}
    />
  );

  return (
    <main className="benchmarkCompareViewer">
      <AppHeader />
      <h2 className="photon-title-20 benchmarkTitle">Benchmark Comparison</h2>

      {state.phase === 'empty' ? (
        <>
          <p className="photon-body-20">
            Enter two benchmark profiles to compare. The report is written from
            the first one’s point of view: every percentage says what happens to
            it when it is replaced by the second.
          </p>
          {form}
        </>
      ) : (
        <details className="benchmarkComparing">
          <summary>
            <span className="benchmarkComparing__summaryText">
              Comparing{' '}
              <span className="benchmarkComparing__name">{baseName}</span>
              {' with '}
              <span className="benchmarkComparing__name">{newName}</span> — edit
              or swap
            </span>
          </summary>
          {form}
          <div className="benchmarkProfileUrls">
            <span>
              <strong>{baseName}:</strong>{' '}
              <a href={baseUrl} target="_blank" rel="noopener noreferrer">
                {baseUrl}
              </a>
            </span>
            <span>
              <strong>{newName}:</strong>{' '}
              <a href={newUrl} target="_blank" rel="noopener noreferrer">
                {newUrl}
              </a>
            </span>
          </div>
        </details>
      )}

      {state.phase === 'loading' && (
        <div className="benchmarkLoading">
          <div className="benchmarkSpinner" />
          <p>Loading profiles and computing statistics…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="benchmarkError">
          <p>
            <strong>Error:</strong> {state.error}
          </p>
        </div>
      )}

      {state.phase === 'done' && <ComparisonResults data={state.data} />}

      {/* Keeps enough page height below the content that collapsing a section
       * doesn't force the viewport to scroll up, which would visually move the
       * clicked row. */}
      <div className="benchmarkCompareViewer__spacer" aria-hidden="true" />
    </main>
  );
}
