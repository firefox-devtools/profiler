/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { useSelector } from 'react-redux';

import { AppHeader } from './AppHeader';
import { getProfilesToCompare } from 'firefox-profiler/selectors/url-state';
import { fetchProfile } from 'firefox-profiler/utils/profile-fetch';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { getProfileFetchUrl } from 'firefox-profiler/actions/receive-profile';
import { extractBenchmarkStatsFromProfile } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import {
  compareBuckets,
  compareIterationTotals,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
  suiteIterationTotals,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type {
  BucketComparison,
  ComparisonStats,
  ScoreComparison,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type {
  ConfidenceRating,
  EffectSize,
} from 'firefox-profiler/profile-logic/benchmark/perf-compare-stats';
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
  | { phase: 'loading' }
  | { phase: 'error'; error: string }
  | { phase: 'done'; data: ComparisonData };

const TOP_N = 100;

/**
 * What a bucket row has to clear to be worth showing.
 *
 * Filtering on a standardised effect size (Cohen's d, and Cliff's delta before
 * it) was the wrong instrument. d divides by the bucket's own spread, so it
 * discriminates against exactly the rows that matter most: a 1.16ms drop in a
 * 21ms bucket is only 0.25 sd, and it was the single largest contributor to one
 * comparison's score change. Meanwhile no d cutoff below 0.3 discriminated at
 * all -- it admitted ~250 rows whether or not the two builds differed.
 *
 * What works is the pair of questions a perf engineer is actually asking: did
 * this move, and does it matter. Significance answers the first. Impact on the
 * overall score answers the second, and it is the right denominator because it
 * means the same thing in the overall table as in a subtest table -- the "Δ%
 * overall" column is already on that common scale.
 *
 * Measured on two profile pairs, one with nothing detectable at subtest level
 * and one with a large real change, counting global buckets that clear both
 * p <= 0.05 and a minimum impact on the score:
 *
 *   min |Δ% overall|   no-difference pair   real-change pair
 *             0.010%                    29                 30
 *             0.020%                     5                 12
 *             0.030%                     5                  5
 *             0.040%                     0                  5
 *             0.050%                     0                  3
 *
 * 0.04% is where the no-difference pair empties out while the real one still
 * shows every change in it: the three canvas buckets whose work shifted between
 * them, the largest absolute mover, and one more at -16%. At 0.05% the last two
 * drop off; at 0.03% five phantom rows appear.
 */
const MIN_SCORE_IMPACT = 0.0004;

/** p-value cutoff for "this moved". Uncorrected, and with ~6800 buckets in the
 * global view that matters: see docs-developer/benchmark-compare-fdr.md. The
 * impact floor is what keeps the row count sane in the default mode. */
const SIGNIFICANCE_P = 0.05;

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
      'Buckets that changed significantly (p ≤ 0.05) and shifted the overall ' +
      'score by at least 0.04%. On a comparison of two builds that do not ' +
      'differ, this shows nothing.',
  },
  {
    mode: 'significant',
    label: 'All significant',
    title:
      'Every bucket with p ≤ 0.05, however small. Uncorrected for multiple ' +
      'comparisons: with thousands of buckets, roughly 5% of them clear this ' +
      'by chance alone, so expect around a hundred rows of noise.',
  },
  {
    mode: 'none',
    label: 'Unfiltered',
    title: 'Every bucket, ranked by absolute impact.',
  },
];

const DEFAULT_BUCKET_FILTER_MODE: BucketFilterMode = 'movers';

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
    loadOneProfile(baseUrl),
    loadOneProfile(newUrl),
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
 * Tooltip for the MDE cell, spelling out what the number means for this row.
 * The distinction it exists to draw: "did not move" and "could not tell" both
 * show no significant change, and only the MDE separates them.
 */
function mdeTitle(row: ComparisonStats): string {
  const method = row.pValueMethod === 'permutation' ? 'permutation' : 'Welch t';
  const p = `p=${row.pValue.toPrecision(2)} (${method})`;
  const mde = `\u00b1${row.mde.toFixed(2)}`;
  if (row.confidence === 'HIGH') {
    return `${p}. Smallest change that would have been called significant: ${mde}.`;
  }
  // "Small next to what?" — relative to the row's own size, since an MDE of
  // 0.9ms is tight for a 30ms bucket and hopeless for a 1.5ms one.
  const resolved = row.mde <= 0.05 * Math.abs(row.baseMean);
  return resolved
    ? `${p}. A change of ${mde} would have been detected, so this really did not move.`
    : `${p}. Only a change of ${mde} or larger could have been detected, so this is unresolved rather than unchanged.`;
}

function formatChange(rel: number): string {
  if (!isFinite(rel)) {
    return rel > 0 ? 'appeared' : 'disappeared';
  }
  const pct = (rel * 100).toFixed(2);
  return rel >= 0 ? `+${pct}%` : `${pct}%`;
}

function changeClass(
  relChange: number,
  confidence: ConfidenceRating,
  effectSize: EffectSize
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
  if (effectSize === 'Large') {
    classes.push('benchmarkCell--effect-large');
  } else if (effectSize === 'Moderate') {
    classes.push('benchmarkCell--effect-moderate');
  }
  // Small / Negligible: normal weight.
  return classes.join(' ');
}

const SCORE_TABLE_COLUMN_COUNT = 7;

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
            : `benchmarkCell--number ${changeClass(subtestRel, row.confidence, row.effectSize)}`
        }
      >
        {subtestRel === null ? '—' : formatChange(subtestRel)}
      </td>
      <td
        className={`benchmarkCell--number ${changeClass(overallRel, row.confidence, row.effectSize)}`}
      >
        {formatChange(overallRel)}
      </td>
    </>
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
              'shown and still been called significant. A blank Δ% next to a small ' +
              'MDE means it really did not move; next to a large MDE it means the ' +
              'measurement could not resolve it.'
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
            {overallExpandable ? (
              <span className="benchmarkDisclosure" aria-hidden="true">
                {overallExpanded ? '▼' : '▶'}
              </span>
            ) : null}
            {overallScore.label}
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
                  {expandable ? (
                    <span className="benchmarkDisclosure" aria-hidden="true">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  ) : null}
                  {row.label}
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
  const columnCount = 7;

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

  // Each row's impact on the overall score has to be known before filtering,
  // not just for display, so compute both relative figures up front.
  const rows = comparisons.map((c) => {
    const absDiff = c.newMean - c.baseMean;
    const impactRel =
      enclosingBaseMean === 0 ? Infinity : absDiff / enclosingBaseMean;
    return {
      c,
      absDiff,
      subtestRel: isOverall ? null : impactRel,
      overallRel: isOverall ? impactRel : impactOnGeomean(impactRel, numSuites),
    };
  });

  const significant = rows
    .filter(({ c, overallRel }) => {
      if (filterMode === 'none') {
        return true;
      }
      if (c.pValue > SIGNIFICANCE_P) {
        return false;
      }
      return (
        filterMode === 'significant' || Math.abs(overallRel) >= MIN_SCORE_IMPACT
      );
    })
    .sort((a, b) => Math.abs(b.absDiff) - Math.abs(a.absDiff))
    .slice(0, TOP_N);

  if (significant.length === 0) {
    return (
      <p className="benchmarkNoChanges">
        {filterMode === 'movers'
          ? `Nothing in ${label} both changed significantly and moved the overall score by 0.04% or more.`
          : `No bucket in ${label} changed significantly (p ≤ 0.05).`}
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
                      : `benchmarkCell--number ${changeClass(subtestRel, c.confidence, c.effectSize)}`
                  }
                >
                  {subtestRel === null ? '—' : formatChange(subtestRel)}
                </td>
                <td
                  className={`benchmarkCell--number ${changeClass(overallRel, c.confidence, c.effectSize)}`}
                >
                  {formatChange(overallRel)}
                </td>
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
  const suiteComparisonsByName = new Map(
    data.suiteComparisons.map(({ suiteName, comparisons }) => [
      suiteName,
      comparisons,
    ])
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
      <div className="benchmarkProfileUrls">
        <span>
          <strong>Base:</strong>{' '}
          <a href={data.baseUrl} target="_blank" rel="noopener noreferrer">
            {data.baseUrl}
          </a>
        </span>
        <span>
          <strong>New:</strong>{' '}
          <a href={data.newUrl} target="_blank" rel="noopener noreferrer">
            {data.newUrl}
          </a>
        </span>
      </div>

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
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    if (!profilesToCompare || profilesToCompare.length < 2) {
      setState({ phase: 'error', error: 'Two profile URLs are required.' });
      return;
    }
    setState({ phase: 'loading' });
    const [baseUrl, newUrl] = profilesToCompare;
    computeComparison(baseUrl, newUrl)
      .then((data) => setState({ phase: 'done', data }))
      .catch((err) =>
        setState({ phase: 'error', error: String(err?.message ?? err) })
      );
  }, [profilesToCompare]);

  return (
    <main className="benchmarkCompareViewer">
      <AppHeader />
      <h2 className="photon-title-20 benchmarkTitle">Benchmark Comparison</h2>

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
