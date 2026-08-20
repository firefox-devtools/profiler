/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Fragment,
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { useSelector } from 'react-redux';

import { AppHeader } from './AppHeader';
import { BenchmarkCompareForm } from './BenchmarkCompareForm';
import {
  BenchmarkProfileNamesContext,
  benchmarkProfileNamePair,
  resolveBenchmarkProfileNameList,
  useBenchmarkProfileNames,
} from './BenchmarkProfileNames';
import type { BenchmarkProfileNames } from './BenchmarkProfileNames';
import {
  getProfileNamesToCompare,
  getProfilesToCompare,
} from 'firefox-profiler/selectors/url-state';
import { runBenchmarkComparison } from 'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison';
import type { ComparisonProgress } from 'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison';
import type { ProfileMeans } from 'firefox-profiler/profile-logic/benchmark/profile-means';
import { createBenchmarkTableWorkerPool } from 'firefox-profiler/profile-logic/benchmark/benchmark-compare-worker-pool';
import {
  bucketMatchKey,
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
 * Which buckets to list: all of them, or only the ones on one side of the
 * comparison.
 *
 * A mixed list is the right default when you are asking "what did my patch do",
 * because the answer includes both. It is the wrong shape for the other question
 * this view now serves — "where is Firefox losing to Chrome" — where the wins and
 * the losses are separate pieces of work and interleaving them by size means
 * scanning past half the table to read either one. The old comparison report
 * built a separate list per direction for exactly this reason.
 *
 * The choice is a sentence with two slots — which profile, then which direction
 * — rather than one list naming the slower side. With two profiles the two forms
 * select the same three subsets, so the difference is entirely one of reading: a
 * list of "Firefox is slower" / "Chrome is slower" contains the answer to "where
 * is Firefox faster" but never says the word, and a reader looking at an
 * unfamiliar report does not reliably make the substitution. Observed, on a
 * Firefox-vs-Chrome comparison: they asked how to show where Firefox was faster
 * and did not recognise "Chrome is slower" as it. Naming a side once and then
 * saying faster or slower about it costs one more control and answers the
 * question as asked.
 *
 * The profile slot is the *subject* of that sentence and is deliberately not
 * called the reference: `base` is the reference, meaning the side every Δ in the
 * table is measured against, and picking a subject here does not touch a single
 * number. The two would collide the moment a third profile makes the reference a
 * control of its own.
 */
type BucketShow = 'all' | 'faster' | 'slower';

/**
 * What the subject is being compared with: another profile by its position in
 * the loaded list, or whichever of the others is quickest on the row in hand.
 *
 * The aggregate is the point of loading a third profile. "Firefox is slower than
 * Chrome" is a question about Chrome; "Firefox is slower than the best of the
 * others" is the question a browser engineer actually has, because its answer
 * comes with an existence proof -- somebody does this faster, so it can be done
 * faster. It is also why the comparand is a slot rather than the options being
 * written out one per phrasing: "the best of the others" is not an ordered pair,
 * so there is no ready-made sentence for it.
 *
 * With two profiles loaded, 'best' *is* the other profile, so the slot has one
 * distinct value and is not shown.
 */
type BucketComparand = number | 'best';

const DEFAULT_BUCKET_SHOW: BucketShow = 'all';

/** What the reader picked in the filter controls. Carried as one object because
 * every level of the table needs all of it, and because the badge count and the
 * expansion have to be computed from exactly the same choices. */
type BucketFilter = {
  mode: BucketFilterMode;
  /** Position in the loaded profile list, not a side of the comparison: rows can
   * be filtered on a profile that is only a column. */
  subject: number;
  comparand: BucketComparand;
  show: BucketShow;
};

/**
 * A profile's mean for one row, whether or not it is one of the compared two.
 *
 * The pair's means come off the row, where the comparison put them; the others'
 * come from profile-means.ts, keyed by the same bucket-matching rule the
 * comparison used. A profile with no bucket for a key spent no time in it, which
 * is zero rather than missing -- the reading the comparison already gives a
 * bucket only one side has.
 */
type MeanReader = (row: BucketComparison, profileIndex: number) => number;

/** The comparand as a single profile, when it is one. 'best' is a single profile
 * only when there is just one other for it to pick from. */
function soleComparandIndex(
  filter: BucketFilter,
  profileCount: number
): number | null {
  if (filter.comparand !== 'best') {
    return filter.comparand;
  }
  return profileCount === 2 ? 1 - filter.subject : null;
}

/**
 * Does this row belong in the list the reader asked for?
 *
 * Strict inequalities both ways, so a bucket two profiles spend exactly the same
 * time in is in neither the wins nor the losses. Against 'best' that reads as:
 * slower than the best of the others means somebody here is faster, and faster
 * than the best of the others means nobody is.
 */
function passesDirection(
  row: BucketComparison,
  filter: BucketFilter,
  readMean: MeanReader,
  profileCount: number
): boolean {
  if (filter.show === 'all') {
    return true;
  }
  const subject = readMean(row, filter.subject);
  let comparand;
  if (filter.comparand === 'best') {
    comparand = Infinity;
    for (let i = 0; i < profileCount; i++) {
      if (i !== filter.subject) {
        comparand = Math.min(comparand, readMean(row, i));
      }
    }
  } else {
    comparand = readMean(row, filter.comparand);
  }
  return filter.show === 'slower' ? subject > comparand : subject < comparand;
}

/** The direction that picks out the same buckets once the two operands of the
 * sentence have traded places. "Everything" is the same set either way round. */
function oppositeShow(show: BucketShow): BucketShow {
  switch (show) {
    case 'all':
      return 'all';
    case 'faster':
      return 'slower';
    case 'slower':
      return 'faster';
    default:
      throw new Error(`Unhandled direction ${show as string}`);
  }
}

/** What the comparand is called in a sentence, or null when there is only one
 * other profile and naming it would be saying "than the other one". */
function comparandName(
  filter: BucketFilter,
  allNames: string[]
): string | null {
  if (allNames.length <= 2) {
    return null;
  }
  return filter.comparand === 'best'
    ? 'the best of the others'
    : allNames[filter.comparand];
}

/**
 * How a direction reads out loud: "Chrome is faster", or "Firefox is slower than
 * the best of the others".
 *
 * The control renders this sentence across three or four elements -- each operand
 * is a dropdown and the direction is a radio, so "faster" on its own is all the
 * radio can say -- and every sentence the report writes about the choice has to
 * match the one the reader assembled. Both come from here, so they cannot drift.
 */
function showSentence(
  filter: BucketFilter,
  show: 'faster' | 'slower',
  allNames: string[]
): string {
  const than = comparandName(filter, allNames);
  const clause = than === null ? '' : ` than ${than}`;
  return `${allNames[filter.subject]} is ${show}${clause}`;
}

/** How the direction choice reads inside a sentence -- "where Chrome is faster"
 * -- or null when it admits everything. */
function directionClause(
  filter: BucketFilter,
  allNames: string[]
): string | null {
  return filter.show === 'all'
    ? null
    : showSentence(filter, filter.show, allNames);
}

/** Wins before losses: the reader who came here for the losses will scan past
 * one option to reach them, and the reader who came for the wins is the one who
 * could not find them at all before. */
const SHOW_DIRECTIONS: Array<'faster' | 'slower'> = ['faster', 'slower'];

function directionTitle(
  filter: BucketFilter,
  show: 'faster' | 'slower',
  allNames: string[]
): string {
  const subject = allNames[filter.subject];
  const than = comparandName(filter, allNames) ?? allNames[1 - filter.subject];
  return show === 'faster'
    ? `Only where ${subject} spends less time than ${than}: what ${subject} is ` +
        `already winning, and by how much.`
    : `Only where ${subject} spends more time than ${than}: the list of things ` +
        `to fix in ${subject}, with nothing to scroll past between them.`;
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

/**
 * One mean column: a loaded profile, in the order the reader listed them.
 *
 * List order rather than "the compared two first, then the rest", so that a
 * column means the same thing before and after the pair selection changes.
 * Watching Firefox's numbers move to a different column because you asked a
 * different question about them is exactly the kind of thing that makes a wide
 * table unreadable.
 */
type MeanColumn = {
  /** Position in the loaded profile list, which is also this filter's `subject`
   * and the key of `otherMeans`. */
  index: number;
  name: string;
  /** Which side of the comparison this profile is, or null when it is only a
   * column -- in which case `means` has its numbers. */
  side: 'base' | 'new' | null;
  means: ProfileMeans | null;
};

/** Which side of the comparison a loaded profile is, if either. */
function comparedSideOf(
  index: number,
  baseIndex: number,
  newIndex: number
): 'base' | 'new' | null {
  if (index === baseIndex) {
    return 'base';
  }
  return index === newIndex ? 'new' : null;
}

/**
 * The mean columns, by context rather than by prop.
 *
 * Same reason as the names: every level of the table needs them -- the header,
 * each score row, each bucket row -- and threading a list through four
 * components would swamp the props that actually differ per row.
 */
const MeanColumnsContext = createContext<MeanColumn[]>([]);

function useMeanColumns(): MeanColumn[] {
  return useContext(MeanColumnsContext);
}

/** Every loaded profile's name, in the order the filter's `subject` indexes
 * them -- which is the column order, because the columns are the profiles. */
function useProfileNameList(): string[] {
  const columns = useMeanColumns();
  return useMemo(() => columns.map((column) => column.name), [columns]);
}

/** A score row's mean for one column, or null for a subtest the profile did not
 * run -- which is not the same as having run it in no time. */
function readScoreMean(
  column: MeanColumn,
  row: ScoreComparison
): number | null {
  switch (column.side) {
    case 'base':
      return row.baseMean;
    case 'new':
      return row.newMean;
    default:
      return column.means?.scoreMeans.get(row.label) ?? null;
  }
}

/** Read any profile's mean off the rows of one bucket table. Bound to a label
 * because that is what the means-only profiles are keyed by. */
function makeMeanReader(columns: MeanColumn[], label: string): MeanReader {
  return (row, profileIndex) => {
    const column = columns[profileIndex];
    switch (column?.side) {
      case 'base':
        return row.baseMean;
      case 'new':
        return row.newMean;
      default:
        return (
          column?.means?.bucketMeans
            .get(label)
            ?.get(bucketMatchKey(row.key, row.bucketName)) ?? 0
        );
    }
  };
}

/** Label, the mean columns, and the six that describe the comparison of two of
 * them. */
function scoreTableColumnCount(columnCount: number): number {
  return 7 + columnCount;
}

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
  const columns = useMeanColumns();
  return (
    <>
      {columns.map((column) => {
        const mean = readScoreMean(column, row);
        return (
          <td className="benchmarkCell--number" key={column.index}>
            {mean === null ? '—' : mean.toFixed(2)}
          </td>
        );
      })}
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
  filter: BucketFilter,
  /** How to read any loaded profile's mean for a row of *this* table. */
  readMean: MeanReader,
  profileCount: number
): BucketRow[] {
  const filterMode = filter.mode;
  const rows: BucketRow[] = [];
  for (const c of comparisons) {
    // Always the compared pair, whoever the direction filter is about: this is
    // the Δ the table shows and ranks by.
    const absDiff = c.newMean - c.baseMean;
    if (!passesDirection(c, filter, readMean, profileCount)) {
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
  const noun = count === 1 ? 'function' : 'functions';
  const clause = directionClause(filter, useProfileNameList());
  const where = clause === null ? ' here' : ` here where ${clause}`;
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
 *
 * `pending` opens, `none` does not. A row that is going to have something behind it
 * should look like it from the start: an arrow that appears a second or two later
 * is an invitation the reader has already looked away from, and a reader who does
 * notice it has no way to tell "not yet" from "never" before clicking. So the arrow
 * is there immediately and the expansion says what it is waiting for.
 */
type RowExpansion =
  | { status: 'pending' }
  | { status: 'ready'; count: number }
  | { status: 'none' };

/**
 * A spinner where the count will be.
 *
 * The outer element is a `benchmarkBadge`, the same one the count arrives in, with
 * the spinner inside it — rather than a spinner styled to resemble a badge. Sizing
 * the two to match by hand is what it was before, and the two boxes drifted: the
 * spinner is a bordered empty box, so its height is its border box and all of that
 * sits above the flex line's baseline, where a badge puts its descender space
 * below. The row grew by a couple of pixels while it was there and shrank back when
 * the number replaced it. Nesting makes the box identical because it is the same
 * box.
 */
function PendingBadge() {
  return (
    <span
      className="benchmarkBadge benchmarkBadge--pending"
      title="Still working out which functions moved in this row."
      aria-label="Computing"
      role="progressbar"
    >
      <span className="benchmarkSpinner benchmarkSpinner--badge" />
    </span>
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
        {expansion.status !== 'none' ? (
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
  const columns = useMeanColumns();
  const columnCount = scoreTableColumnCount(columns.length);

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
          filter,
          makeMeanReader(columns, row.label),
          columns.length
        ).length
      );
    }
    return counts;
  }, [overallScore, suiteScores, bucketTables, numSuites, filter, columns]);

  const expansionOf = (label: string): RowExpansion => {
    const comparisons = bucketTables.get(label);
    if (comparisons === undefined) {
      return pendingLabels.includes(label)
        ? { status: 'pending' }
        : { status: 'none' };
    }
    // A table that came back empty is `ready` with a count of zero, not `none`:
    // `none` has to mean "there is no table and there never will be", because it
    // is the one state that does not open. A row that opened while pending and
    // then turned out to be empty would otherwise collapse under the reader,
    // taking the message they were reading with it and leaving them no answer.
    // `BucketTable` already has prose for a list that filters down to nothing.
    return { status: 'ready', count: bucketCounts.get(label) ?? 0 };
  };

  return (
    <table className="benchmarkTable">
      <thead>
        <tr>
          <th>Score</th>
          {columns.map((column) => (
            <th
              className="benchmarkCell--number benchmarkCell--colFixed"
              key={column.index}
              title={
                `Mean over ${column.name}'s iterations, in milliseconds.` +
                (column.side === null
                  ? ` ${column.name} is loaded but not compared: it has a ` +
                    `column, and the filters can ask about it, but the Δ and q ` +
                    `columns are ${names.new} against ${names.base}.`
                  : '')
              }
            >
              {column.name} mean
            </th>
          ))}
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
          const expandable = expansion.status !== 'none';
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
              {isExpanded ? (
                <tr className="benchmarkRow--expansion">
                  <td colSpan={columnCount}>
                    {/* What this subtest is worth, before the list of what is
                     * in it. The reader who just opened "Charts-observable"
                     * is deciding whether to spend an afternoon in there, and
                     * that decision is the whole-subtest number, not any one
                     * function's. It needs nothing but the score row, so it is
                     * also the one thing the expansion can show while the
                     * table behind it is still being computed. Not for the
                     * overall row, where "as fast as X overall, it would spend
                     * less time overall" is the Δ% column read back. */}
                    {isOverall ? null : (
                      <Counterfactual
                        thingName={row.label}
                        absDiff={row.newMean - row.baseMean}
                        baseTotal={row.baseMean}
                        newTotal={row.newMean}
                        suiteName={null}
                        alreadyOverall={false}
                        numSuites={numSuites}
                      />
                    )}
                    {comparisons ? (
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
                    ) : (
                      // Reached only from `pending`: `none` does not open, and
                      // `ready` means the table is in `bucketTables`.
                      <p className="benchmarkPendingBuckets">
                        Still working out which functions moved in {row.label}.
                        This takes a second or two per row.
                      </p>
                    )}
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
 * A row's numbers, said out loud, for the reader who just expanded it.
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
 *
 * Said about a function inside a score row, and about a score row itself, which
 * is why the thing being named and the thing the saving is a fraction of are
 * separate props rather than "the bucket" and "its enclosing row".
 */
function Counterfactual({
  thingName,
  absDiff,
  baseTotal,
  newTotal,
  suiteName,
  alreadyOverall,
  numSuites,
}: {
  /** What the sentence is about: a function, or a subtest. */
  thingName: string;
  /** New minus base, in ms. Positive means the new side is the slow one here. */
  absDiff: number;
  /** The two sides of the total the saving is a fraction of: the enclosing score
   * row for a function, and the row's own means when the row is the subject. */
  baseTotal: number;
  newTotal: number;
  /** An enclosing subtest to quantify the saving against as well, or null when
   * there is none to name -- the overall expansion, or a subtest row, whose
   * saving is the subtest. */
  suiteName: string | null;
  /** True when the saving is already an overall figure: the buckets under the
   * overall row are geomean-normalised, so nothing has to be carried through. */
  alreadyOverall: boolean;
  numSuites: number;
}) {
  const names = useBenchmarkProfileNames();
  if (absDiff === 0) {
    return null;
  }
  const newIsSlower = absDiff > 0;
  const slow = newIsSlower ? names.new : names.base;
  const fast = newIsSlower ? names.base : names.new;
  const slowTotal = newIsSlower ? newTotal : baseTotal;
  if (!(slowTotal > 0)) {
    return null;
  }

  const savingRel = Math.abs(absDiff) / slowTotal;
  // A saving inside one subtest reaches the overall score through the geomean
  // over all of them.
  const overallSaving = alreadyOverall
    ? savingRel
    : -impactOnGeomean(-savingRel, numSuites);
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

  // A profile of a single subtest -- which is a normal way to capture one -- has
  // a subtest figure and an overall figure that are the same number, and naming
  // both would just say it twice.
  const showSubtest = suiteName !== null && numSuites > 1;

  return (
    <p className="benchmarkCounterfactual">
      If <strong>{slow}</strong> were as fast as <strong>{fast}</strong> on{' '}
      <em>{thingName}</em>, it would spend{' '}
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
  const columns = useMeanColumns();
  const allNames = useProfileNameList();
  const columnCount = scoreTableColumnCount(columns.length);
  const readMean = makeMeanReader(columns, label);
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
    filter,
    readMean,
    columns.length
  )
    .sort((a, b) => Math.abs(b.absDiff) - Math.abs(a.absDiff))
    .slice(0, TOP_N);

  if (significant.length === 0) {
    // Naming the direction matters most in exactly this case: an empty list
    // under "only where X is slower" is a real answer, and reading it as "no
    // differences at all" would be the wrong one.
    const clause = directionClause(filter, allNames);
    const where = clause === null ? '' : ` where ${clause}`;
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
        {columns.map((column) => (
          <col className="benchmarkCell--colFixed" key={column.index} />
        ))}
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
                {columns.map((column) => (
                  <td className="benchmarkCell--number" key={column.index}>
                    {readMean(c, column.index).toFixed(2)}
                  </td>
                ))}
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
                    <Counterfactual
                      thingName={c.bucketName}
                      absDiff={absDiff}
                      baseTotal={enclosingBaseMean}
                      newTotal={enclosingNewMean}
                      suiteName={isOverall ? null : label}
                      alreadyOverall={isOverall}
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

function ComparisonResults({
  progress,
  allNames,
  baseIndex,
  newIndex,
}: {
  progress: ComparisonProgress;
  /** Every loaded profile's name, in list order. */
  allNames: string[];
  baseIndex: number;
  newIndex: number;
}) {
  const { scores, otherMeans, bucketTables, pendingLabels } = progress;

  const columns = useMemo(
    (): MeanColumn[] =>
      allNames.map((name, index) => ({
        index,
        name,
        side: comparedSideOf(index, baseIndex, newIndex),
        means: otherMeans.get(index) ?? null,
      })),
    [allNames, baseIndex, newIndex, otherMeans]
  );

  const getBaseBundle = useMemo(
    () => lazyBundle(scores.baseProfile),
    [scores.baseProfile]
  );
  const getNewBundle = useMemo(
    () => lazyBundle(scores.newProfile),
    [scores.newProfile]
  );

  const names = useBenchmarkProfileNames();
  const profileCount = allNames.length;
  const [filter, setFilter] = useState<BucketFilter>({
    mode: DEFAULT_BUCKET_FILTER_MODE,
    // The new side of the compared pair, because every Δ and every verdict in
    // the table is already said about it, so the rows and the control that
    // filters them start out talking about the same profile. And against the
    // best of the others, which with two loaded is just the other one.
    subject: newIndex,
    comparand: 'best',
    show: DEFAULT_BUCKET_SHOW,
  });

  const handleFilterModeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const mode = e.currentTarget.value as BucketFilterMode;
      setFilter((prev) => ({ ...prev, mode }));
    },
    []
  );
  // Changing the subject re-says the same thing about the other side, so the
  // direction flips with it and the listed rows do not move. Naming a subset a
  // different way should not change which subset it is -- and watching the
  // selection travel from "Firefox is slower" to "Chrome is faster" over an
  // unchanged table is the clearest statement available that those are one
  // question. What generalises is swapping the two *operands*, so this survives
  // a third profile; picking one that was not in the sentence cannot preserve
  // the rows and should not pretend to.
  const handleSubjectChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const subject = Number(e.currentTarget.value);
      setFilter((prev) => ({
        ...prev,
        subject,
        // A subject cannot be compared with itself. Falling back to the
        // aggregate rather than to some other profile avoids picking one on the
        // reader's behalf.
        comparand: prev.comparand === subject ? 'best' : prev.comparand,
        show:
          soleComparandIndex(prev, profileCount) === subject
            ? oppositeShow(prev.show)
            : prev.show,
      }));
    },
    [profileCount]
  );
  const handleComparandChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const raw = e.currentTarget.value;
      const comparand: BucketComparand = raw === 'best' ? 'best' : Number(raw);
      setFilter((prev) => ({ ...prev, comparand }));
    },
    []
  );
  const handleShowChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const show = e.currentTarget.value as BucketShow;
    setFilter((prev) => ({ ...prev, show }));
  }, []);

  return (
    <div className="benchmarkResults">
      <h3 className="benchmarkSectionTitle">Score and subtest totals</h3>
      {/* One sentence across four controls, rather than a list of options that
       * each name a side. The dropdown is a slot in that sentence, not a role
       * the report gives the profile in it: "reference" and "point of view"
       * already mean the side every Δ is measured against, and that is still
       * the base profile whatever is picked here. Written this way it also has
       * somewhere to grow — a third profile turns "is slower" into "is slower
       * than <which>" by adding a slot, where a list of ready-made sentences
       * would need one entry per ordered pair. */}
      <div className="benchmarkFilters">
        <span className="benchmarkFilter__label">Show</span>
        <label
          className="benchmarkFilter"
          title="Both directions, ranked together by how far they moved."
        >
          <input
            type="radio"
            name="benchmarkBucketShow"
            value="all"
            checked={filter.show === 'all'}
            onChange={handleShowChange}
          />
          <span>Everything</span>
        </label>
        <div className="benchmarkFilterClause">
          <span>or where</span>
          <select
            className="benchmarkFilterClause__select"
            aria-label="Profile the direction is about"
            value={filter.subject}
            onChange={handleSubjectChange}
            title={
              'Which profile the direction beside it is said about. It changes ' +
              'which rows are listed, not the numbers in them: every Δ stays ' +
              `${names.new} measured against ${names.base}.`
            }
          >
            {allNames.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <span>is</span>
          {SHOW_DIRECTIONS.map((show) => (
            <label
              className="benchmarkFilter"
              key={show}
              title={directionTitle(filter, show, allNames)}
            >
              <input
                type="radio"
                name="benchmarkBucketShow"
                value={show}
                checked={filter.show === show}
                onChange={handleShowChange}
                // The visible label is one word, because the rest of the
                // sentence is spelled out around it and repeating it would read
                // as two separate questions. Read on its own -- which is how a
                // screen reader takes a radio -- one word is not an option, so
                // the accessible name is the whole sentence.
                aria-label={showSentence(filter, show, allNames)}
              />
              <span>{show}</span>
            </label>
          ))}
          {/* The last slot, and the only one that is not always there: with two
           * profiles loaded, "than the best of the others" and "than the other
           * one" are the same set, so the choice would be between a value and
           * itself. */}
          {profileCount > 2 ? (
            <>
              <span>than</span>
              <select
                className="benchmarkFilterClause__select"
                aria-label="Profile the direction is measured against"
                value={filter.comparand}
                onChange={handleComparandChange}
                title={
                  'What the subject is being compared with. "The best of the ' +
                  'others" is per row -- whichever profile is quickest in that ' +
                  'bucket -- so it asks whether anyone does this faster at all, ' +
                  'which is the version of the question with an existence ' +
                  'proof attached. Rows are selected by comparing means; the q ' +
                  'column is still the comparison named above the table.'
                }
              >
                <option value="best">the best of the others</option>
                {allNames.map((name, index) =>
                  index === filter.subject ? null : (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  )
                )}
              </select>
            </>
          ) : null}
        </div>
      </div>
      <div className="benchmarkFilters">
        <span className="benchmarkFilter__label">…among buckets that</span>
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
      {profileCount > 2 ? (
        // Said once, above the table, rather than in a tooltip on each extra
        // header: a column with no q-value next to columns that have one is
        // exactly the sort of thing a reader will assume is an oversight.
        <p className="benchmarkColumnsNote">
          Every Δ, q and verdict below is <strong>{names.new}</strong> against{' '}
          <strong>{names.base}</strong>. The other columns are measured, not
          tested — the filters can ask about them, but no comparison was run.
        </p>
      ) : null}
      <MeanColumnsContext.Provider value={columns}>
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
      </MeanColumnsContext.Provider>
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
/** Two profiles are a comparison and read as "A vs B"; three or more are a list
 * of what is loaded, and which two are being compared is said underneath. */
function profileLinkSeparator(count: number): string {
  return count === 2 ? ' vs ' : ', ';
}

/** One side of the "Comparing X vs Y" control, above a report of three or more
 * profiles. */
function PairSelect({
  side,
  label,
  value,
  names,
  onChange,
}: {
  side: 'base' | 'new';
  label: string;
  value: number;
  names: string[];
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <select
      className="benchmarkComparingPair__select"
      data-side={side}
      aria-label={label}
      title={label}
      value={value}
      onChange={onChange}
    >
      {names.map((name, i) => (
        <option key={name} value={i}>
          {name}
        </option>
      ))}
    </select>
  );
}

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

  // Joined into one string rather than kept as an array, so that the effect
  // doesn't re-run (and re-compute a ~7000-bucket comparison) every time an
  // unrelated dispatch hands us a fresh array with the same contents.
  const urlKey = (profilesToCompare ?? []).join('\n');
  const urls = useMemo(
    () => (urlKey === '' ? [] : urlKey.split('\n')),
    [urlKey]
  );
  const allNames = useMemo(
    () =>
      resolveBenchmarkProfileNameList(
        profileNamesToCompare,
        Math.max(urls.length, 2)
      ),
    [profileNamesToCompare, urls.length]
  );

  /**
   * Which two of the loaded profiles this report is of.
   *
   * More than two can be loaded, but one report is still of one pair: the whole
   * table -- every Δ, every q, every verdict -- is two-sample. Choosing a
   * different pair recomputes it, which is seconds of arithmetic but no
   * downloads, since the profiles are cached by URL.
   *
   * Component state rather than URL state, so a shared link still opens the
   * default pair rather than someone else's reading position. Reset when the
   * profile list changes, since index 2 of the old list is not index 2 of the
   * new one.
   */
  const [pair, setPair] = useState<[number, number]>([0, 1]);
  useEffect(() => {
    // Index 2 of the old list is not index 2 of the new one, so an edit to the
    // profiles goes back to the first two. Returning `prev` unchanged when it is
    // already the default keeps this from re-rendering on every mount.
    setPair((prev) => (prev[0] === 0 && prev[1] === 1 ? prev : [0, 1]));
  }, [urlKey]);
  const [baseIndex, newIndex] =
    pair[0] < urls.length && pair[1] < urls.length ? pair : [0, 1];
  const names = useMemo(
    () => benchmarkProfileNamePair(allNames, baseIndex, newIndex),
    [allNames, baseIndex, newIndex]
  );
  const baseUrl = urls[baseIndex] ?? '';
  const newUrl = urls[newIndex] ?? '';

  const handlePairChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const side = e.currentTarget.dataset.side;
    const index = Number(e.currentTarget.value);
    setPair(([base, neu]) =>
      // Picking a profile that is already on the other side swaps them, rather
      // than producing a comparison of something with itself.
      side === 'base'
        ? [index, index === neu ? base : neu]
        : [index === base ? neu : base, index]
    );
  }, []);

  useEffect(() => {
    if (baseUrl === '' || newUrl === '') {
      setState({ phase: 'empty' });
      return undefined;
    }
    const allUrls = urlKey.split('\n');
    // A second edit while the first pair is still being worked on would
    // otherwise race, and whichever finished last would win. Aborting also
    // stops the comparison itself — terminating the workers computing its
    // tables — rather than leaving it to spend seconds finishing tables for a
    // pair nobody is looking at any more.
    const controller = new AbortController();
    setState({ phase: 'loading' });
    (async () => {
      try {
        for await (const progress of runBenchmarkComparison(
          allUrls,
          [baseIndex, newIndex],
          controller.signal,
          // The seconds of arithmetic behind the bucket tables belong on other
          // threads: the page has a score table to paint and links to follow.
          createBenchmarkTableWorkerPool
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
    // `urlKey` rather than `urls`, for the same reason it exists: an unrelated
    // dispatch that hands us an equal-but-fresh array must not re-run seconds of
    // arithmetic. The indices are in the deps because picking a different pair
    // out of an unchanged list is exactly what has to re-run it.
  }, [urlKey, baseUrl, newUrl, baseIndex, newIndex]);

  const form = (
    <BenchmarkCompareForm
      // Remount when the loaded profiles change (including via history
      // navigation) so the inputs show what is actually on screen.
      key={`${urlKey}\n${allNames.join('\n')}`}
      initialUrls={urls.length >= 2 ? urls : ['', '']}
      initialNames={allNames}
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
              happens to it when it is replaced by the second. Add more than two
              to keep them all loaded and read any pair of them.
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
              Profiles:{' '}
              {urls.map((url, i) => (
                <Fragment key={url}>
                  {i === 0 ? null : profileLinkSeparator(urls.length)}
                  <ProfileLink name={allNames[i]} url={url} />
                </Fragment>
              ))}
            </p>
            {/* One report is of one pair, so with more than two loaded there has
             * to be somewhere to say which. Both sides are selectable rather
             * than just the second: which profile the percentages are measured
             * against is as much a part of the question as which one is being
             * asked about, and with three builds the useful baseline is not
             * always the one that happens to be first in the URL. */}
            {urls.length > 2 ? (
              <p className="benchmarkComparingPair">
                Comparing{' '}
                <PairSelect
                  side="base"
                  label="Profile the percentages are measured against"
                  value={baseIndex}
                  names={allNames}
                  onChange={handlePairChange}
                />
                {' vs '}
                <PairSelect
                  side="new"
                  label="Profile being compared against it"
                  value={newIndex}
                  names={allNames}
                  onChange={handlePairChange}
                />
              </p>
            ) : null}
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
          <ComparisonResults
            progress={state.progress}
            allNames={allNames}
            baseIndex={baseIndex}
            newIndex={newIndex}
          />
        )}

        {/* Keeps enough page height below the content that collapsing a section
         * doesn't force the viewport to scroll up, which would visually move the
         * clicked row. */}
        <div className="benchmarkCompareViewer__spacer" aria-hidden="true" />
      </main>
    </BenchmarkProfileNamesContext.Provider>
  );
}
