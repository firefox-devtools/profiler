/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { useSelector } from 'react-redux';

import { AppHeader } from './AppHeader';
import { BenchmarkCompareForm } from './BenchmarkCompareForm';
import {
  BenchmarkProfileNamesContext,
  resolveBenchmarkProfileNames,
  useBenchmarkProfileNames,
} from './BenchmarkProfileNames';
import type { BenchmarkProfileNames } from './BenchmarkProfileNames';
import {
  getProfileNamesToCompare,
  getProfilesToCompare,
} from 'firefox-profiler/selectors/url-state';
import { runBenchmarkComparison } from 'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison';
import type { ComparisonProgress } from 'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison';
import {
  classifyChange,
  describeVerdict,
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

type State =
  | { phase: 'empty' }
  /** The two profiles are being downloaded and read. Nothing to show but the
   * header, which is why the links in it are not behind the disclosure. */
  | { phase: 'loading' }
  | { phase: 'error'; error: string }
  /** At least the score rows exist. `progress.pendingLabels` says which rows are
   * still waiting for their per-function table; the reader sees the table fill in
   * from there. */
  | { phase: 'results'; progress: ComparisonProgress };

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
      'profiles that do not differ, this shows nothing.',
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
 * Which buckets to list: all of them, or only the ones where a named side is the
 * slow one.
 *
 * A mixed list is the right default when you are asking "what did my patch do",
 * because the answer includes both. It is the wrong shape for the other question
 * this view now serves — "where is Firefox losing to Chrome" — where the wins and
 * the losses are separate pieces of work and interleaving them by size means
 * scanning past half the table to read either one. The old comparison report
 * built a separate list per direction for exactly this reason.
 *
 * Selected by naming the *slower* side rather than as "slower"/"faster" relative
 * to the new one. Both say the same thing about two profiles, but only one of
 * them still says anything about three: "Firefox is faster" does not identify a
 * subset once there is a Safari column, whereas "Firefox is slower" does. So the
 * options are one per profile, plus "either way".
 */
type BucketDirection = 'both' | 'base-slower' | 'new-slower';

const DEFAULT_BUCKET_DIRECTION: BucketDirection = 'both';

/** The side a direction singles out as the slow one, or null for "either way".
 * Every sentence about a direction is built from this, so that they all use the
 * one verb the choice is actually about. */
function slowerSideName(
  direction: BucketDirection,
  names: BenchmarkProfileNames
): string | null {
  switch (direction) {
    case 'both':
      return null;
    case 'base-slower':
      return names.base;
    case 'new-slower':
      return names.new;
    default:
      throw new Error(`Unhandled direction ${direction as string}`);
  }
}

/** The options, in profile order, so the list reads the way the mean columns
 * do. */
function bucketDirections(names: BenchmarkProfileNames): Array<{
  direction: BucketDirection;
  label: string;
  title: string;
}> {
  const oneSide = (direction: BucketDirection, slow: string, fast: string) => ({
    direction,
    label: `${slow} is slower`,
    title:
      `Only where ${slow} spends more time than ${fast}: the list of things to ` +
      `fix in ${slow}, with nothing to scroll past between them.`,
  });
  return [
    {
      direction: 'both',
      label: 'either way',
      title: 'Both directions, ranked together by how far they moved.',
    },
    oneSide('base-slower', names.base, names.new),
    oneSide('new-slower', names.new, names.base),
  ];
}

/** What the reader picked in the two filter groups. Carried as one object
 * because every level of the table needs both, and because the badge count and
 * the expansion have to be computed from exactly the same pair. */
type BucketFilter = {
  mode: BucketFilterMode;
  direction: BucketDirection;
};

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
function mdeTitle(row: ComparisonStats, names: BenchmarkProfileNames): string {
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
  return `${p}. ${describeVerdict(verdict, mde, names)}`;
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
 * The whole point of the view in a couple of words per row, because the reader's
 * question is "did anything change, and did it get worse" and they may not want
 * to interpret a q-value to find out.
 *
 * "slower" alone was enough when the two sides were one build before and after a
 * patch, since there was only one thing it could be describing. It is not enough
 * for Chrome vs Firefox, where a column of bare "slower"s leaves the reader
 * silently guessing which side they refer to — so the moving side is named.
 */
function verdictLabel(verdict: Verdict, names: BenchmarkProfileNames): string {
  switch (verdict) {
    case 'slower':
      return `${names.new} slower`;
    case 'faster':
      return `${names.new} faster`;
    case 'unchanged':
      return 'no change';
    case 'unresolved':
      return "can't tell";
    default:
      throw new Error(`Unhandled verdict ${verdict as string}`);
  }
}

function VerdictCell({ row }: { row: ComparisonStats }) {
  const names = useBenchmarkProfileNames();
  const verdict = classifyChange(row);
  const description = describeVerdict(verdict, `±${row.mde.toFixed(2)}`, names);
  return (
    <td
      className={`benchmarkCell--verdict benchmarkCell--verdict-${verdict}`}
      title={description}
    >
      {verdictLabel(verdict, names)}
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
  const names = useBenchmarkProfileNames();
  return (
    <>
      <td className="benchmarkCell--number">{row.baseMean.toFixed(2)}</td>
      <td className="benchmarkCell--number">{row.newMean.toFixed(2)}</td>
      <td className="benchmarkCell--number">{absDiffStr}</td>
      <td
        className="benchmarkCell--number benchmarkCell--mde"
        title={mdeTitle(row, names)}
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
 * The rows of a bucket table: every bucket that passes `filter`, with the two
 * relative figures the table displays.
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
  { mode: filterMode, direction }: BucketFilter
): BucketRow[] {
  const rows: BucketRow[] = [];
  for (const c of comparisons) {
    const absDiff = c.newMean - c.baseMean;
    // Weight is time, so a positive difference means the new side spends more
    // of it. A bucket that moved by exactly nothing has no slower side at all,
    // hence the sign tests rather than a negation of one of them.
    if (
      (direction === 'new-slower' && !(absDiff > 0)) ||
      (direction === 'base-slower' && !(absDiff < 0))
    ) {
      continue;
    }
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
  filter,
}: {
  count: number;
  filter: BucketFilter;
}) {
  const names = useBenchmarkProfileNames();
  const noun = count === 1 ? 'function' : 'functions';
  const slow = slowerSideName(filter.direction, names);
  const where = slow === null ? ' here' : ` here where ${slow} is slower`;
  let title;
  switch (filter.mode) {
    case 'movers':
      title =
        `${count} ${noun}${where} both survived the multiple-comparisons ` +
        `correction (q ≤ 0.05) and moved the overall score by 0.01% or more.`;
      break;
    case 'significant':
      title = `${count} ${noun}${where} survived the multiple-comparisons correction (q ≤ 0.05).`;
      break;
    case 'none':
      title = `${count} ${noun}${where}, unfiltered.`;
      break;
    default:
      throw new Error(`Unhandled filter mode ${filter.mode as string}`);
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

/**
 * What is behind a score row's disclosure triangle, which is not always the same
 * question as "how many functions moved".
 *
 * A row whose table has not been computed yet and a row that has no table at all
 * both show no count, and the reader must not have to guess which they are looking
 * at: the first is going to fill in on its own, the second is a subtest the new
 * profile did not run. Hence three states rather than a nullable count.
 */
type RowExpansion =
  | { status: 'pending' }
  | { status: 'ready'; count: number }
  | { status: 'none' };

/** A spinner where the count will be, sized to sit in the badge's place so the
 * row does not shift when the number arrives. */
function PendingBadge() {
  return (
    <span
      className="benchmarkSpinner benchmarkSpinner--badge"
      title="Still working out which functions moved in this row."
      aria-label="Computing"
      role="progressbar"
    />
  );
}

/** Disclosure triangle, label, and the count of functions the expansion lists —
 * or a spinner while that is still being computed. */
function ScoreLabelCell({
  label,
  isOverall,
  expansion,
  isExpanded,
  filter,
}: {
  label: string;
  isOverall: boolean;
  expansion: RowExpansion;
  isExpanded: boolean;
  filter: BucketFilter;
}) {
  return (
    <td
      className={
        isOverall
          ? 'benchmarkCell--suiteLabel benchmarkCell--scoreLabel'
          : 'benchmarkCell--indented benchmarkCell--suiteLabel benchmarkCell--scoreLabel'
      }
      title={label}
    >
      <div className="benchmarkScoreLabel">
        {expansion.status === 'ready' ? (
          <span className="benchmarkDisclosure" aria-hidden="true">
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : null}
        <span className="benchmarkScoreLabel__text">{label}</span>
        {expansion.status === 'pending' ? <PendingBadge /> : null}
        {expansion.status === 'ready' ? (
          <BucketCountBadge count={expansion.count} filter={filter} />
        ) : null}
      </div>
    </td>
  );
}

function rowClass(isOverall: boolean, expandable: boolean): string {
  const classes = [];
  if (isOverall) {
    classes.push('benchmarkRow--overall');
  }
  if (expandable) {
    classes.push('benchmarkRow--suite-expandable');
  }
  return classes.join(' ');
}

function ScoreTable({
  overallScore,
  suiteScores,
  bucketTables,
  pendingLabels,
  filter,
  getBaseBundle,
  getNewBundle,
  baseViewerUrl,
  newViewerUrl,
}: {
  overallScore: ScoreComparison;
  suiteScores: ScoreComparison[];
  /** Per-function tables computed so far, keyed by score-row label. */
  bucketTables: Map<string, BucketComparison[]>;
  /** Rows whose table is still being computed. */
  pendingLabels: string[];
  filter: BucketFilter;
  getBaseBundle: () => BucketProfileBundle;
  getNewBundle: () => BucketProfileBundle;
  baseViewerUrl: string;
  newViewerUrl: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const numSuites = suiteScores.length;
  const names = useBenchmarkProfileNames();

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

  // The badge counts are the same filtering the expansions do, run for every
  // row whether or not it is expanded, so they are worth memoising: the overall
  // list alone is ~6800 buckets and this otherwise reruns on every expand. The
  // whole map is recomputed each time another table arrives, which is a few
  // hundred microseconds of arithmetic against the seconds it took to produce
  // the table -- not worth the machinery to update one entry.
  const bucketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of [overallScore, ...suiteScores]) {
      const comparisons = bucketTables.get(row.label);
      if (comparisons === undefined) {
        continue;
      }
      const isOverall = row === overallScore;
      counts.set(
        row.label,
        bucketRowsForFilter(
          comparisons,
          row.baseMean,
          isOverall,
          numSuites,
          filter
        ).length
      );
    }
    return counts;
  }, [overallScore, suiteScores, bucketTables, numSuites, filter]);

  const expansionOf = (label: string): RowExpansion => {
    const comparisons = bucketTables.get(label);
    if (comparisons === undefined) {
      return pendingLabels.includes(label)
        ? { status: 'pending' }
        : { status: 'none' };
    }
    if (comparisons.length === 0) {
      return { status: 'none' };
    }
    return { status: 'ready', count: bucketCounts.get(label) ?? 0 };
  };

  return (
    <table className="benchmarkTable">
      <thead>
        <tr>
          <th>Score</th>
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={`Mean over ${names.base}'s iterations, in milliseconds.`}
          >
            {names.base} mean
          </th>
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={`Mean over ${names.new}'s iterations, in milliseconds.`}
          >
            {names.new} mean
          </th>
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={`${names.new} minus ${names.base}, in milliseconds. Positive means ${names.new} spends more time here.`}
          >
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
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={
              `How much of this subtest's ${names.base} time the difference is ` +
              `worth: the change ${names.base} would see on this subtest if it ` +
              `behaved like ${names.new} here.`
            }
          >
            Δ% subtest
          </th>
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={
              `The same thing carried through to the overall score: what ` +
              `${names.base} would score if it behaved like ${names.new} here ` +
              `and nowhere else.`
            }
          >
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
              `What this row is telling you, always about ${names.new} relative ` +
              `to ${names.base}. "no change" and "can't tell" are different ` +
              'answers: the first means a change worth caring about would have ' +
              'shown up and did not, the second means this comparison was not ' +
              'sensitive enough to say either way — check the MDE.'
            }
          >
            Verdict
          </th>
        </tr>
      </thead>
      <tbody>
        {[overallScore, ...suiteScores].map((row) => {
          const isOverall = row === overallScore;
          const expansion = expansionOf(row.label);
          const expandable = expansion.status === 'ready';
          const isExpanded = expandable && expanded.has(row.label);
          const comparisons = bucketTables.get(row.label);
          return (
            <Fragment key={row.label}>
              <tr
                className={rowClass(isOverall, expandable)}
                data-toggle-label={row.label}
                onClick={expandable ? handleToggle : undefined}
              >
                <ScoreLabelCell
                  label={row.label}
                  isOverall={isOverall}
                  expansion={expansion}
                  isExpanded={isExpanded}
                  filter={filter}
                />
                <ScoreRow
                  row={row}
                  isOverall={isOverall}
                  numSuites={numSuites}
                />
              </tr>
              {isExpanded && comparisons ? (
                <tr className="benchmarkRow--expansion">
                  <td colSpan={SCORE_TABLE_COLUMN_COUNT}>
                    <BucketTable
                      comparisons={comparisons}
                      label={row.label}
                      enclosingBaseMean={row.baseMean}
                      enclosingNewMean={row.newMean}
                      isOverall={isOverall}
                      numSuites={numSuites}
                      filter={filter}
                      getBaseBundle={getBaseBundle}
                      getNewBundle={getNewBundle}
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

/**
 * The row's numbers, said out loud, for the reader who just expanded it.
 *
 * Δ abs and the two Δ% columns already contain this, but they contain it as
 * three signed numbers whose reference point ("percent of what?") is only in a
 * header tooltip. The old comparison report led with the sentence instead --
 * "Making Firefox as fast as Chrome on this function would reduce its time on
 * TodoMVC by 4%" -- and that is the form a bug report gets written in.
 *
 * Always phrased as the slower side catching up with the faster one, whichever
 * that is per row, since that is the only direction anyone can act on. Note the
 * denominators differ from the table's: the table divides by the base side's
 * total throughout, so that every row's contribution to the score is on one
 * scale, whereas a saving is a fraction of the total belonging to the side that
 * would be doing the saving.
 */
function BucketCounterfactual({
  bucketName,
  absDiff,
  enclosingBaseMean,
  enclosingNewMean,
  suiteName,
  numSuites,
}: {
  bucketName: string;
  /** New minus base, in ms. Positive means the new side is the slow one here. */
  absDiff: number;
  enclosingBaseMean: number;
  enclosingNewMean: number;
  /** Null in the overall expansion, where there is no enclosing subtest. */
  suiteName: string | null;
  numSuites: number;
}) {
  const names = useBenchmarkProfileNames();
  if (absDiff === 0) {
    return null;
  }
  const newIsSlower = absDiff > 0;
  const slow = newIsSlower ? names.new : names.base;
  const fast = newIsSlower ? names.base : names.new;
  const slowTotal = newIsSlower ? enclosingNewMean : enclosingBaseMean;
  if (!(slowTotal > 0)) {
    return null;
  }

  const savingRel = Math.abs(absDiff) / slowTotal;
  // In a subtest expansion, `savingRel` is a fraction of that subtest, and the
  // overall score is a geomean over all of them. In the overall expansion the
  // buckets are already geomean-normalised, so it is the overall figure itself.
  const overallSaving =
    suiteName === null ? savingRel : -impactOnGeomean(-savingRel, numSuites);
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

  // A profile of a single subtest -- which is a normal way to capture one -- has
  // a subtest figure and an overall figure that are the same number, and naming
  // both would just say it twice.
  const showSubtest = suiteName !== null && numSuites > 1;

  return (
    <p className="bucketCounterfactual">
      If <strong>{slow}</strong> were as fast as <strong>{fast}</strong> on{' '}
      <em>{bucketName}</em>, it would spend{' '}
      {showSubtest ? (
        <>
          <strong>{pct(savingRel)}</strong> less time on {suiteName}, and{' '}
        </>
      ) : null}
      <strong>{pct(overallSaving)}</strong> less time overall.
    </p>
  );
}

function BucketTable({
  comparisons,
  label,
  enclosingBaseMean,
  enclosingNewMean,
  isOverall,
  numSuites,
  filter,
  getBaseBundle,
  getNewBundle,
  baseViewerUrl,
  newViewerUrl,
}: {
  comparisons: BucketComparison[];
  label: string;
  /** Base mean of the enclosing score row (overall row or subtest row).
   * Each bucket's absDiff is expressed relative to this to compute the
   * bucket's impact on the enclosing score. */
  enclosingBaseMean: number;
  /** The other side of the same score row. Only the base one is needed to
   * express a bucket's impact on the score, but the counterfactual sentence is
   * written from whichever side is the slower one, and that side's own total is
   * what its saving is a fraction of. */
  enclosingNewMean: number;
  /** True when this table is expanded under the overall row (globalBuckets).
   * The Δ% subtest column then shows "—" and the Δ% overall column shows
   * absDiff / enclosingBaseMean directly (global buckets are already
   * geomean-normalised, so their contributions sum linearly to the overall
   * score). When false, subtest is absDiff / enclosingBaseMean and overall
   * comes from impactOnGeomean. */
  isOverall: boolean;
  numSuites: number;
  filter: BucketFilter;
  /** The flame-graph bundles, built on first call. Nothing above this component
   * needs them, and building one derives every table of a multi-hundred-megabyte
   * profile — so they are deliberately not on the path to the score table's first
   * paint. Expanding a score row is the earliest point anything here can want one,
   * and by then the reader has clicked something and is expecting a beat. */
  getBaseBundle: () => BucketProfileBundle;
  getNewBundle: () => BucketProfileBundle;
  /** Viewer URLs of the two source profiles, forwarded to BucketFlameGraphPair
   * so its "open in a new profiler tab" link can point back at the original
   * profile. */
  baseViewerUrl: string;
  newViewerUrl: string;
}) {
  const columnCount = SCORE_TABLE_COLUMN_COUNT;
  const names = useBenchmarkProfileNames();

  // For a subtest expansion, filter to samples inside that suite's iteration
  // markers so flame graphs reflect only what contributed to the subtest
  // score. For the overall expansion, we want the full profile since global
  // buckets aggregate across all suites.
  const baseInnerBundle = useMemo(
    () =>
      isOverall
        ? getBaseBundle()
        : withSuiteFilteredThread(getBaseBundle(), label),
    [getBaseBundle, label, isOverall]
  );
  const newInnerBundle = useMemo(
    () =>
      isOverall
        ? getNewBundle()
        : withSuiteFilteredThread(getNewBundle(), label),
    [getNewBundle, label, isOverall]
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
    filter
  )
    .sort((a, b) => Math.abs(b.absDiff) - Math.abs(a.absDiff))
    .slice(0, TOP_N);

  if (significant.length === 0) {
    // Naming the direction matters most in exactly this case: an empty list
    // under "only where X is slower" is a real answer, and reading it as "no
    // differences at all" would be the wrong one.
    const slow = slowerSideName(filter.direction, names);
    const where = slow === null ? '' : ` where ${slow} is slower`;
    return (
      <p className="benchmarkNoChanges">
        {filter.mode === 'movers'
          ? `Nothing in ${label}${where} both survived the multiple-comparisons correction and moved the overall score by 0.01% or more.`
          : `No bucket in ${label}${where} survived the multiple-comparisons correction (q ≤ 0.05).`}
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
                  title={mdeTitle(c, names)}
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
                    <BucketCounterfactual
                      bucketName={c.bucketName}
                      absDiff={absDiff}
                      enclosingBaseMean={enclosingBaseMean}
                      enclosingNewMean={enclosingNewMean}
                      suiteName={isOverall ? null : label}
                      numSuites={numSuites}
                    />
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

/**
 * A `BucketProfileBundle` for `profile`, built the first time it is asked for and
 * kept thereafter.
 *
 * It used to be a `useMemo`, which meant deriving the tables of both profiles
 * during the render that first showed the score table — i.e. on the critical path
 * to the thing the reader is waiting for, to prepare flame graphs they may never
 * open. Nothing needs a bundle until a row is expanded, so nothing builds one
 * until then.
 */
function lazyBundle(profile: Profile): () => BucketProfileBundle {
  let bundle: BucketProfileBundle | null = null;
  return () => {
    if (bundle === null) {
      bundle = makeBucketProfileBundle(profile, 'speedometer');
    }
    return bundle;
  };
}

function ComparisonResults({ progress }: { progress: ComparisonProgress }) {
  const { scores, bucketTables, pendingLabels } = progress;

  const getBaseBundle = useMemo(
    () => lazyBundle(scores.baseProfile),
    [scores.baseProfile]
  );
  const getNewBundle = useMemo(
    () => lazyBundle(scores.newProfile),
    [scores.newProfile]
  );

  const names = useBenchmarkProfileNames();
  const [filter, setFilter] = useState<BucketFilter>({
    mode: DEFAULT_BUCKET_FILTER_MODE,
    direction: DEFAULT_BUCKET_DIRECTION,
  });

  const handleFilterModeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const mode = e.currentTarget.value as BucketFilterMode;
      setFilter((prev) => ({ ...prev, mode }));
    },
    []
  );
  const handleDirectionChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const direction = e.currentTarget.value as BucketDirection;
      setFilter((prev) => ({ ...prev, direction }));
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
              checked={filter.mode === mode}
              onChange={handleFilterModeChange}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="benchmarkFilters">
        <span className="benchmarkFilter__label">…and where</span>
        {bucketDirections(names).map(({ direction, label, title }) => (
          <label className="benchmarkFilter" key={direction} title={title}>
            <input
              type="radio"
              name="benchmarkBucketDirection"
              value={direction}
              checked={filter.direction === direction}
              onChange={handleDirectionChange}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <ScoreTable
        overallScore={scores.overallScore}
        suiteScores={scores.suiteScores}
        bucketTables={bucketTables}
        pendingLabels={pendingLabels}
        filter={filter}
        getBaseBundle={getBaseBundle}
        getNewBundle={getNewBundle}
        baseViewerUrl={scores.baseViewerUrl}
        newViewerUrl={scores.newViewerUrl}
      />
    </div>
  );
}

/**
 * One of the two compared profiles, as a link that opens it in the profiler.
 *
 * The name is the link text and the URL is only the tooltip, because these are
 * Taskcluster artifact URLs that wrap over several lines, and the name is what
 * every other sentence in the report calls this profile anyway. The full URL is
 * still there in the form's input when it is opened.
 */
function ProfileLink({ name, url }: { name: string; url: string }) {
  return (
    <a
      className="benchmarkProfileLinks__link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
    >
      {name}
    </a>
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
  const names = useMemo(
    () => resolveBenchmarkProfileNames(profileNamesToCompare),
    [profileNamesToCompare]
  );
  const { base: baseName, new: newName } = names;

  useEffect(() => {
    if (baseUrl === '' || newUrl === '') {
      setState({ phase: 'empty' });
      return undefined;
    }
    // A second edit while the first pair is still being worked on would
    // otherwise race, and whichever finished last would win. Aborting also
    // stops the comparison itself between slices, rather than leaving it to
    // spend seconds finishing tables for a pair nobody is looking at any more.
    const controller = new AbortController();
    setState({ phase: 'loading' });
    (async () => {
      try {
        for await (const progress of runBenchmarkComparison(
          baseUrl,
          newUrl,
          controller.signal
        )) {
          if (controller.signal.aborted) {
            return;
          }
          setState({ phase: 'results', progress });
        }
      } catch (err) {
        // Includes the abort itself, which is not something to report.
        if (!controller.signal.aborted) {
          setState({
            phase: 'error',
            error: String((err as Error)?.message ?? err),
          });
        }
      }
    })();
    return () => controller.abort();
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
    <BenchmarkProfileNamesContext.Provider value={names}>
      <main className="benchmarkCompareViewer">
        <AppHeader />
        <h2 className="photon-title-20 benchmarkTitle">Benchmark Comparison</h2>

        {state.phase === 'empty' ? (
          <>
            <p className="photon-body-20">
              Enter two benchmark profiles to compare. The report is written
              from the first one’s point of view: every percentage says what
              happens to it when it is replaced by the second.
            </p>
            {form}
          </>
        ) : (
          <div className="benchmarkComparingHeader">
            {/* Which two profiles the report is about, always visible, with the
             * names themselves as the links to them. Opening one of the source
             * profiles is a routine step in reading a row -- the report says
             * where the time went, the profile says what the code was doing --
             * so it should not be a click into a collapsed form first. The
             * disclosure below hides only the editing controls, which is the
             * part nobody needs until they want a different pair. */}
            <p className="benchmarkProfileLinks">
              Profiles: <ProfileLink name={baseName} url={baseUrl} />
              {' vs '}
              <ProfileLink name={newName} url={newUrl} />
            </p>
            <details className="benchmarkComparing">
              <summary>
                <span className="benchmarkComparing__summaryText">
                  Edit or swap the compared profiles
                </span>
              </summary>
              {form}
            </details>
          </div>
        )}

        {state.phase === 'loading' && (
          <div className="benchmarkLoading">
            <div className="benchmarkSpinner" />
            {/* Only covers the part with nothing to show yet: downloading the two
             * profiles and reading their per-iteration weights out. From the
             * score table onwards the remaining work is per-row, and each row
             * says so itself. */}
            <p>Loading profiles…</p>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="benchmarkError">
            <p>
              <strong>Error:</strong> {state.error}
            </p>
          </div>
        )}

        {state.phase === 'results' && (
          <ComparisonResults progress={state.progress} />
        )}

        {/* Keeps enough page height below the content that collapsing a section
         * doesn't force the viewport to scroll up, which would visually move the
         * clicked row. */}
        <div className="benchmarkCompareViewer__spacer" aria-hidden="true" />
      </main>
    </BenchmarkProfileNamesContext.Provider>
  );
}
