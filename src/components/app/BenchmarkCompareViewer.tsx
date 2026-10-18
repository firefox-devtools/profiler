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
  useRef,
} from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { AppHeader } from './AppHeader';
import { BenchmarkCompareForm } from './BenchmarkCompareForm';
import {
  BenchmarkProfileNamesContext,
  resolveBenchmarkProfileNameList,
  useBenchmarkProfileNames,
} from './BenchmarkProfileNames';
import type { BenchmarkProfileNames } from './BenchmarkProfileNames';
import {
  getBenchmarkBucketFilter,
  getProfileNamesToCompare,
  getProfilesToCompare,
} from 'firefox-profiler/selectors/url-state';
import {
  changeBenchmarkBucketFilter,
  changeProfilesToCompareBenchmark,
} from 'firefox-profiler/actions/app';
import { withHistoryReplaceStateSync } from 'firefox-profiler/app-logic/url-handling';
import { runBenchmarkComparison } from 'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison';
import {
  isPublicProfileUrl,
  uploadComparedProfiles,
} from 'firefox-profiler/profile-logic/benchmark/upload-compared-profiles';
import type { UploadProgress } from 'firefox-profiler/profile-logic/benchmark/upload-compared-profiles';
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
import type {
  ComparedBucket,
  ComparedScore,
} from 'firefox-profiler/profile-logic/benchmark/best-of-others';
import { pValueToConfidence } from 'firefox-profiler/profile-logic/benchmark/perf-compare-stats';
import type { ConfidenceRating } from 'firefox-profiler/profile-logic/benchmark/perf-compare-stats';
import type {
  Profile,
  BenchmarkBucketFilter,
  BenchmarkBucketFilterMode as BucketFilterMode,
  BenchmarkBucketShow as BucketShow,
  BenchmarkBucketComparand as BucketComparand,
} from 'firefox-profiler/types';
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
  | {
      phase: 'results';
      progress: ComparisonProgress;
      /** Which comparison `progress` is of. */
      subject: number;
      comparand: BucketComparand;
    };

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

/** What the reader picked in the filter controls, with the URL's defaults
 * resolved against the profiles on screen. Carried as one object because every
 * level of the table needs all of it, and because the badge count and the
 * expansion have to be computed from exactly the same choices. */
type BucketFilter = {
  mode: BucketFilterMode;
  /** Position in the loaded profile list of the profile the report is about:
   * the new side of every row. */
  subject: number;
  /** The base side of every row: one profile, or 'best' for the fastest of the
   * others, row by row. Only ever 'best' with three or more profiles loaded. */
  comparand: BucketComparand;
  show: BucketShow;
};

/**
 * The URL's filter, made to fit the profiles on screen.
 *
 * With no subject named, it is the second profile: the new side, when two
 * profiles are a before and an after. With two profiles loaded, the fastest of
 * the others is the other one, so 'best' is resolved to that profile and the
 * report is one ordinary comparison, as it always was. An index the URL names but
 * the list does not have is treated as unnamed, rather than comparing with a
 * profile that is not there.
 */
function resolveBucketFilter(
  urlFilter: BenchmarkBucketFilter,
  profileCount: number
): BucketFilter {
  const { subject: urlSubject, comparand: urlComparand } = urlFilter;
  const subject =
    urlSubject !== null && urlSubject < profileCount
      ? urlSubject
      : Math.max(0, Math.min(1, profileCount - 1));
  let comparand: BucketComparand =
    urlComparand !== 'best' &&
    urlComparand < profileCount &&
    urlComparand !== subject
      ? urlComparand
      : 'best';
  if (comparand === 'best' && profileCount === 2) {
    comparand = 1 - subject;
  }
  return { mode: urlFilter.mode, show: urlFilter.show, subject, comparand };
}

/** How many pairwise comparisons the report is made of: one per profile the
 * subject is compared with. */
function comparisonCountOf(filter: BucketFilter, profileCount: number): number {
  return filter.comparand === 'best' ? profileCount - 1 : 1;
}

/**
 * A profile's mean for one row, whether or not it is on one side of it.
 *
 * The subject's and a single comparand's means come off the row, where the
 * comparison put them; the others' come from profile-means.ts, keyed by the same
 * bucket-matching rule the comparison used. A profile with no bucket for a key
 * spent no time in it, which is zero rather than missing -- the reading the
 * comparison already gives a bucket only one side has.
 */
type MeanReader = (row: BucketComparison, profileIndex: number) => number;

/** The comparand as a single profile, when it is one. */
function soleComparandIndex(filter: BucketFilter): number | null {
  return filter.comparand === 'best' ? null : filter.comparand;
}

/**
 * Does this row belong in the list the reader asked for?
 *
 * Every row is the subject measured against its comparand, so this is the sign
 * of the row's own Δ. Strict both ways, so a bucket two profiles spend exactly
 * the same time in is in neither the wins nor the losses. Against the fastest of
 * the others that reads as: slower means somebody here is faster, and faster
 * means nobody is. See best-of-others.ts for how such a row is chosen.
 */
function passesDirection(row: ComparisonStats, filter: BucketFilter): boolean {
  switch (filter.show) {
    case 'all':
      return true;
    case 'slower':
      return row.delta > 0;
    case 'faster':
      return row.delta < 0;
    default:
      throw new Error(`Unhandled direction ${filter.show as string}`);
  }
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

/** What the comparand 'best' is called, wherever a sentence needs a name for the
 * base side. */
const FASTEST_OF_THE_OTHERS = 'the fastest of the others';

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
    ? FASTEST_OF_THE_OTHERS
    : allNames[filter.comparand];
}

/**
 * How a direction reads out loud: "Chrome is faster", or "Firefox is slower than
 * the fastest of the others".
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
 * What a row's Δ% columns are a share of.
 *
 * Against a single comparand, the base side's total, as it always was: the
 * change the base profile would see if it behaved like the subject here. Against
 * the fastest of the others there is no single base side, since each row can be
 * measured against a different profile. So the share is of the subject's own
 * total instead: what the subject would save if it were as fast as that profile
 * here. Positive still means the subject is the slower one.
 */
type ImpactScale = 'base' | 'subject';

/** A Δ as the two Δ% columns show it, as a share of `enclosing`: the score row
 * it belongs to, or the score row itself. */
function relativeImpact(
  absDiff: number,
  enclosing: ComparisonStats,
  isOverall: boolean,
  numSuites: number,
  scale: ImpactScale
): { subtestRel: number | null; overallRel: number } {
  let rel;
  if (scale === 'base') {
    rel = enclosing.baseMean === 0 ? Infinity : absDiff / enclosing.baseMean;
  } else if (enclosing.newMean === 0) {
    rel = absDiff < 0 ? -Infinity : 0;
  } else {
    rel = absDiff / enclosing.newMean;
  }
  if (isOverall) {
    // The overall score has no enclosing subtest, and its buckets are already
    // geomean-normalised, so their shares add up to the overall figure as is.
    return { subtestRel: null, overallRel: rel };
  }
  // A share of one subtest reaches the overall score through the geomean over
  // all of them. Against the fastest of the others the share is a saving of the
  // subject's, so it goes through the geomean as one, and comes out with the
  // same sign it went in with.
  return {
    subtestRel: rel,
    overallRel:
      scale === 'base'
        ? impactOnGeomean(rel, numSuites)
        : -impactOnGeomean(-rel, numSuites),
  };
}

/**
 * How many pairwise comparisons each row is made of, by context: one, or the
 * number of profiles the subject is compared with when the comparand is the
 * fastest of the others. The cells that explain a q-value or name a row's base
 * side need it, and they are several components below the controls.
 */
const ComparisonCountContext = createContext<number>(1);

function useComparisonCount(): number {
  return useContext(ComparisonCountContext);
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
function mdeTitle(
  row: ComparisonStats,
  names: BenchmarkProfileNames,
  comparisonCount: number
): string {
  const method = row.pValueMethod === 'permutation' ? 'permutation' : 'Welch t';
  let p;
  if (row.qValue === null) {
    p = `p=${row.pValue.toPrecision(2)} (${method})`;
  } else if (comparisonCount > 1) {
    p =
      `q=${row.qValue.toPrecision(2)}, multiplied by ${comparisonCount} ` +
      `because ${names.new} is compared with ${comparisonCount} profiles, ` +
      `from p=${row.pValue.toPrecision(2)} (${method})`;
  } else {
    p =
      `q=${row.qValue.toPrecision(2)}, from p=${row.pValue.toPrecision(2)} ` +
      `(${method}) corrected for every bucket in this table`;
  }
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
  /** Which side of every row this profile is, or null when it is not on the
   * same side of every row -- in which case `means` has its numbers. Against the
   * fastest of the others, that is every profile but the subject. */
  side: 'base' | 'new' | null;
  means: ProfileMeans | null;
};

/** Which side of every row a loaded profile is, if either. */
function comparedSideOf(
  index: number,
  filter: BucketFilter
): 'base' | 'new' | null {
  if (index === filter.subject) {
    return 'new';
  }
  return index === filter.comparand ? 'base' : null;
}

/**
 * One mean cell. Against the fastest of the others, the cell of the profile the
 * row is measured against is marked, since that is the only place the row says
 * which profile it is.
 */
function MeanCell({
  column,
  mean,
  isComparand,
}: {
  column: MeanColumn;
  mean: number | null;
  isComparand: boolean;
}) {
  return (
    <td
      className={
        isComparand
          ? 'benchmarkCell--number benchmarkCell--comparand'
          : 'benchmarkCell--number'
      }
      title={
        isComparand
          ? `The Δ on this row is measured against ${column.name}.`
          : undefined
      }
    >
      {mean === null ? '—' : mean.toFixed(2)}
    </td>
  );
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
  const comparisonCount = useComparisonCount();
  if (row.qValue === null) {
    return <td className="benchmarkCell--number benchmarkCell--q">—</td>;
  }
  const text = formatQValue(row.qValue);
  const familyWise =
    row.familyWiseP === null
      ? ''
      : ` Chance that any bucket in the table would look this extreme with ` +
        `nothing changed anywhere: ${row.familyWiseP.toPrecision(2)}.`;
  const multiplied =
    comparisonCount > 1
      ? ` Multiplied by ${comparisonCount}, one per profile compared with, so ` +
        `that picking the best of ${comparisonCount} comparisons does not find ` +
        `more in noise than one comparison would. A row where the subject is ` +
        `the fastest takes the weakest of the ${comparisonCount}.`
      : '';
  return (
    <td
      className="benchmarkCell--number benchmarkCell--q"
      title={`Expected share of noise among the rows at least this extreme: ${text}.${familyWise}${multiplied}`}
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
  row: ComparedScore;
  isOverall: boolean;
  numSuites: number;
}) {
  const absDiff = row.newMean - row.baseMean;
  const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
  const comparisonCount = useComparisonCount();
  const againstFastest = comparisonCount > 1;
  // For the overall row, the score IS the geomean — there's no enclosing
  // subtest, so leave the subtest column blank, and the overall column shows
  // the actual measured geomean change. For a subtest row, the subtest's change
  // is its own, and its impact on the overall geomean assumes only this subtest
  // changed.
  const { subtestRel, overallRel } = relativeImpact(
    absDiff,
    row,
    isOverall,
    numSuites,
    againstFastest ? 'subject' : 'base'
  );
  const names = useBenchmarkProfileNames();
  const columns = useMeanColumns();
  const markedComparand = againstFastest ? row.comparand : null;
  return (
    <>
      {columns.map((column) => (
        <MeanCell
          key={column.index}
          column={column}
          mean={readScoreMean(column, row)}
          isComparand={column.index === markedComparand}
        />
      ))}
      <td className="benchmarkCell--number">{absDiffStr}</td>
      <td
        className="benchmarkCell--number benchmarkCell--mde"
        title={mdeTitle(row, names, comparisonCount)}
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
  c: ComparedBucket;
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
  comparisons: ComparedBucket[],
  /** The score row this table expands. */
  enclosing: ComparisonStats,
  isOverall: boolean,
  numSuites: number,
  filter: BucketFilter,
  scale: ImpactScale
): BucketRow[] {
  const filterMode = filter.mode;
  const rows: BucketRow[] = [];
  for (const c of comparisons) {
    if (!passesDirection(c, filter)) {
      continue;
    }
    // The Δ the table shows and ranks by: the subject against this row's
    // comparand.
    const absDiff = c.newMean - c.baseMean;
    const { subtestRel, overallRel } = relativeImpact(
      absDiff,
      enclosing,
      isOverall,
      numSuites,
      scale
    );
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
    rows.push({ c, absDiff, subtestRel, overallRel });
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

/**
 * The names of one row's two sides. Against the fastest of the others the base
 * side can differ from row to row, and every sentence about a row -- the
 * verdict, its tooltip, the counterfactual, the flame-graph labels -- has to name
 * the profile that row is actually measured against.
 */
function RowNames({
  comparand,
  children,
}: {
  comparand: number;
  children: React.ReactNode;
}) {
  const names = useBenchmarkProfileNames();
  const allNames = useProfileNameList();
  const base = allNames[comparand] ?? names.base;
  const rowNames = useMemo(() => ({ base, new: names.new }), [base, names.new]);
  return (
    <BenchmarkProfileNamesContext.Provider value={rowNames}>
      {children}
    </BenchmarkProfileNamesContext.Provider>
  );
}

function meanColumnTitle(
  column: MeanColumn,
  againstFastest: boolean,
  names: BenchmarkProfileNames
): string {
  const title = `Mean over ${column.name}'s iterations, in milliseconds.`;
  if (column.side !== null) {
    return title;
  }
  if (againstFastest) {
    return `${title} On each row, the mean of the profile the Δ is measured against is marked.`;
  }
  return `${title} ${column.name} is loaded but not compared: the Δ and q columns are ${names.new} against ${names.base}.`;
}

function ScoreTable({
  overallScore,
  suiteScores,
  bucketTables,
  pendingLabels,
  filter,
  getBundle,
  viewerUrls,
}: {
  overallScore: ComparedScore;
  suiteScores: ComparedScore[];
  /** Per-function tables computed so far, keyed by score-row label. */
  bucketTables: Map<string, ComparedBucket[]>;
  /** Rows whose table is still being computed. */
  pendingLabels: string[];
  filter: BucketFilter;
  getBundle: (profileIndex: number) => BucketProfileBundle;
  viewerUrls: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const numSuites = suiteScores.length;
  const names = useBenchmarkProfileNames();
  const columns = useMeanColumns();
  const columnCount = scoreTableColumnCount(columns.length);
  const againstFastest = useComparisonCount() > 1;
  const scale: ImpactScale = againstFastest ? 'subject' : 'base';

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
          row,
          isOverall,
          numSuites,
          filter,
          scale
        ).length
      );
    }
    return counts;
  }, [overallScore, suiteScores, bucketTables, numSuites, filter, scale]);

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
              title={meanColumnTitle(column, againstFastest, names)}
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
              againstFastest
                ? `How much of ${names.new}'s time on this subtest the ` +
                  `difference is worth: what ${names.new} would save on this ` +
                  `subtest if it were as fast as the marked profile here.`
                : `How much of this subtest's ${names.base} time the difference ` +
                  `is worth: the change ${names.base} would see on this subtest ` +
                  `if it behaved like ${names.new} here.`
            }
          >
            Δ% subtest
          </th>
          <th
            className="benchmarkCell--number benchmarkCell--colFixed"
            title={
              againstFastest
                ? `The same thing carried through to the overall score: what ` +
                  `${names.new} would save overall if it were as fast as the ` +
                  `marked profile here and nowhere else.`
                : `The same thing carried through to the overall score: what ` +
                  `${names.base} would score if it behaved like ${names.new} ` +
                  `here and nowhere else.`
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
              '6800-row overall view.' +
              (againstFastest
                ? ' Also multiplied by the number of profiles compared with, ' +
                  'so it is filled in on score rows as well.'
                : ' Blank on score rows, which are not one of a family.')
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
              <RowNames comparand={row.comparand}>
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
                       * function's. It needs nothing but the score row, so it
                       * is also the one thing the expansion can show while the
                       * table behind it is still being computed. Not for the
                       * overall row, where "as fast as X overall, it would
                       * spend less time overall" is the Δ% column read back. */}
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
                          enclosing={row}
                          isOverall={isOverall}
                          numSuites={numSuites}
                          filter={filter}
                          getBundle={getBundle}
                          viewerUrls={viewerUrls}
                        />
                      ) : (
                        // Reached only from `pending`: `none` does not open, and
                        // `ready` means the table is in `bucketTables`.
                        <p className="benchmarkPendingBuckets">
                          Still working out which functions moved in {row.label}
                          . This takes a second or two per row.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : null}
              </RowNames>
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
  enclosing,
  isOverall,
  numSuites,
  filter,
  getBundle,
  viewerUrls,
}: {
  comparisons: ComparedBucket[];
  label: string;
  /** The score row this table expands (overall row or subtest row). Each
   * bucket's Δ is expressed as a share of it, to give the bucket's impact on
   * the enclosing score, and the counterfactual sentence is a share of the
   * slower side's total on it. */
  enclosing: ComparedScore;
  /** True when this table is expanded under the overall row (globalBuckets).
   * The Δ% subtest column then shows "—" and the Δ% overall column shows the
   * share directly (global buckets are already geomean-normalised, so their
   * contributions sum linearly to the overall score). When false, the subtest
   * column is the share and the overall one comes from impactOnGeomean. */
  isOverall: boolean;
  numSuites: number;
  filter: BucketFilter;
  /** The flame-graph bundle of a loaded profile, built on first call. Nothing
   * above this component needs them, and building one derives every table of a
   * multi-hundred-megabyte profile — so they are deliberately not on the path to
   * the score table's first paint. Expanding a bucket row is the earliest point
   * anything here can want one, and by then the reader has clicked something
   * and is expecting a beat. */
  getBundle: (profileIndex: number) => BucketProfileBundle;
  /** Viewer URLs of the loaded profiles, forwarded to BucketFlameGraphPair so
   * its "open in a new profiler tab" link can point back at the original
   * profile. */
  viewerUrls: string[];
}) {
  const columns = useMeanColumns();
  const allNames = useProfileNameList();
  const columnCount = scoreTableColumnCount(columns.length);
  const readMean = makeMeanReader(columns, label);
  const names = useBenchmarkProfileNames();
  const comparisonCount = useComparisonCount();
  const againstFastest = comparisonCount > 1;

  // For a subtest expansion, filter to samples inside that suite's iteration
  // markers so flame graphs reflect only what contributed to the subtest
  // score. For the overall expansion, we want the full profile since global
  // buckets aggregate across all suites. Per profile, since against the fastest
  // of the others the rows' base sides are not all the same profile.
  const getInnerBundle = useMemo(() => {
    const cache = new Map<number, BucketProfileBundle>();
    return (profileIndex: number) => {
      let bundle = cache.get(profileIndex);
      if (bundle === undefined) {
        bundle = isOverall
          ? getBundle(profileIndex)
          : withSuiteFilteredThread(getBundle(profileIndex), label);
        cache.set(profileIndex, bundle);
      }
      return bundle;
    };
  }, [getBundle, label, isOverall]);

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
    enclosing,
    isOverall,
    numSuites,
    filter,
    againstFastest ? 'subject' : 'base'
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
          const rowNames = {
            base: allNames[c.comparand] ?? names.base,
            new: names.new,
          };
          return (
            <Fragment key={c.key}>
              <RowNames comparand={c.comparand}>
                <tr
                  className={
                    expandable ? 'benchmarkRow--bucket-expandable' : undefined
                  }
                  data-toggle-key={c.key}
                  onClick={expandable ? handleToggle : undefined}
                >
                  <td
                    className="benchmarkCell--bucketName"
                    title={c.bucketName}
                  >
                    {expandable ? (
                      <span className="benchmarkDisclosure" aria-hidden="true">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    ) : null}
                    {c.bucketName}
                  </td>
                  {columns.map((column) => (
                    <MeanCell
                      key={column.index}
                      column={column}
                      mean={readMean(c, column.index)}
                      isComparand={
                        againstFastest ? column.index === c.comparand : false
                      }
                    />
                  ))}
                  <td className="benchmarkCell--number">{absDiffStr}</td>
                  <td
                    className="benchmarkCell--number benchmarkCell--mde"
                    title={mdeTitle(c, rowNames, comparisonCount)}
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
                        baseTotal={
                          readScoreMean(columns[c.comparand], enclosing) ??
                          enclosing.baseMean
                        }
                        newTotal={enclosing.newMean}
                        suiteName={isOverall ? null : label}
                        alreadyOverall={isOverall}
                        numSuites={numSuites}
                      />
                      <BucketFlameGraphPair
                        baseBundle={getInnerBundle(c.comparand)}
                        newBundle={getInnerBundle(filter.subject)}
                        baseFunc={c.baseFunc}
                        newFunc={c.newFunc}
                        baseViewerUrl={viewerUrls[c.comparand] ?? ''}
                        newViewerUrl={viewerUrls[filter.subject] ?? ''}
                        suiteName={isOverall ? null : label}
                      />
                    </td>
                  </tr>
                ) : null}
              </RowNames>
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

/**
 * What the report is of: one profile, the subject, measured against one other
 * profile or against the fastest of the others, row by row. Every Δ, q and
 * verdict below it is said about the subject. Both slots are selectable: which
 * profile the percentages are measured against is as much a part of the
 * question as which one is being asked about.
 *
 * In the header rather than with the filters, because changing either slot
 * computes a new comparison, and the control should not disappear while that
 * happens.
 */
function ComparisonSelect({
  allNames,
  filter,
}: {
  allNames: string[];
  filter: BucketFilter;
}) {
  const dispatch = useDispatch();
  const urlFilter = useSelector(getBenchmarkBucketFilter);
  const profileCount = allNames.length;
  const soleComparand = soleComparandIndex(filter);

  // Picking the profile on the other side swaps the two, rather than comparing
  // a profile with itself. A swap re-says the same thing about the other side,
  // so the direction flips with it and the listed rows do not move: naming a
  // subset a different way should not change which subset it is, and watching
  // the selection travel from "Firefox is slower" to "Chrome is faster" over the
  // same rows is the clearest statement available that those are one question.
  // Picking a profile that was not in the sentence cannot preserve the rows and
  // does not pretend to.
  const handleSubjectChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const subject = Number(e.currentTarget.value);
      dispatch(
        changeBenchmarkBucketFilter({
          ...urlFilter,
          subject,
          comparand:
            urlFilter.comparand === subject
              ? filter.subject
              : urlFilter.comparand,
          show:
            soleComparand === subject ? oppositeShow(filter.show) : filter.show,
        })
      );
    },
    [dispatch, urlFilter, filter, soleComparand]
  );
  const handleComparandChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const raw = e.currentTarget.value;
      const comparand: BucketComparand = raw === 'best' ? 'best' : Number(raw);
      dispatch(changeBenchmarkBucketFilter({ ...urlFilter, comparand }));
    },
    [dispatch, urlFilter]
  );

  return (
    <p className="benchmarkComparison">
      <span>Compare</span>
      <select
        className="benchmarkComparison__select"
        aria-label="Profile the report is about"
        value={filter.subject}
        onChange={handleSubjectChange}
        title={
          'The profile every row is about. Each Δ is this profile minus the ' +
          'one it is compared with, so positive means it is slower.'
        }
      >
        {allNames.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </select>
      <span>with</span>
      {/* With two profiles loaded there is nothing to choose: the fastest of
       * the others is the other one. */}
      {soleComparand !== null && profileCount <= 2 ? (
        <span>{allNames[soleComparand]}</span>
      ) : (
        <select
          className="benchmarkComparison__select"
          aria-label="Profile it is compared with"
          value={filter.comparand}
          onChange={handleComparandChange}
          title={
            '"The fastest of the others" is per row: whichever profile is ' +
            'quickest at that function or subtest. It asks whether anyone does ' +
            'this faster at all, which is the version of the question with an ' +
            'existence proof attached.'
          }
        >
          <option value="best">{FASTEST_OF_THE_OTHERS}</option>
          {allNames.map((name, index) =>
            index === filter.subject ? null : (
              <option key={name} value={index}>
                {name}
              </option>
            )
          )}
        </select>
      )}
    </p>
  );
}

/**
 * What the columns of a report of three or more profiles are, said once above
 * the table rather than in a tooltip on each header: a column with no q-value
 * next to columns that have one, or a q-value larger than the same comparison's
 * on its own, is exactly the sort of thing a reader will assume is an oversight.
 */
function ColumnsNote({
  comparisonCount,
  profileCount,
}: {
  comparisonCount: number;
  profileCount: number;
}) {
  const names = useBenchmarkProfileNames();
  if (comparisonCount > 1) {
    return (
      <p className="benchmarkColumnsNote">
        Each row compares <strong>{names.new}</strong> with whichever of the
        others is fastest on that row, and that profile’s mean is{' '}
        <span className="benchmarkCell--comparand">marked</span>. Picking the
        best of {comparisonCount} comparisons would find more in noise than one
        comparison, so each q is multiplied by {comparisonCount}.
      </p>
    );
  }
  if (profileCount > 2) {
    return (
      <p className="benchmarkColumnsNote">
        Every Δ, q and verdict below is <strong>{names.new}</strong> against{' '}
        <strong>{names.base}</strong>. The other columns are measured, not
        tested.
      </p>
    );
  }
  return null;
}

function ComparisonResults({
  progress,
  allNames,
  filter,
}: {
  progress: ComparisonProgress;
  /** Every loaded profile's name, in list order. */
  allNames: string[];
  /** The filter the comparison in `progress` was run for. */
  filter: BucketFilter;
}) {
  const { sources, scores, otherMeans, bucketTables, pendingLabels } = progress;

  const columns = useMemo(
    (): MeanColumn[] =>
      allNames.map((name, index) => ({
        index,
        name,
        side: comparedSideOf(index, filter),
        means: otherMeans.get(index) ?? null,
      })),
    [allNames, filter, otherMeans]
  );

  const getBundle = useMemo(() => {
    const lazyBundles = sources.profiles.map(lazyBundle);
    return (profileIndex: number) => lazyBundles[profileIndex]();
  }, [sources.profiles]);

  const profileCount = allNames.length;
  const comparisonCount = comparisonCountOf(filter, profileCount);
  const dispatch = useDispatch();
  const urlFilter = useSelector(getBenchmarkBucketFilter);
  const changeFilter = useCallback(
    (change: Partial<BenchmarkBucketFilter>) => {
      dispatch(changeBenchmarkBucketFilter({ ...urlFilter, ...change }));
    },
    [dispatch, urlFilter]
  );

  const handleFilterModeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const mode = e.currentTarget.value as BucketFilterMode;
      changeFilter({ mode });
    },
    [changeFilter]
  );
  const handleShowChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const show = e.currentTarget.value as BucketShow;
      changeFilter({ show });
    },
    [changeFilter]
  );

  const than = comparandName(filter, allNames);

  return (
    <div className="benchmarkResults">
      <h3 className="benchmarkSectionTitle">Score and subtest totals</h3>
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
          <span>or where {allNames[filter.subject]} is</span>
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
          {than === null ? null : <span>than {than}</span>}
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
      <ColumnsNote
        comparisonCount={comparisonCount}
        profileCount={profileCount}
      />
      <MeanColumnsContext.Provider value={columns}>
        <ComparisonCountContext.Provider value={comparisonCount}>
          <ScoreTable
            overallScore={scores.overallScore}
            suiteScores={scores.suiteScores}
            bucketTables={bucketTables}
            pendingLabels={pendingLabels}
            filter={filter}
            getBundle={getBundle}
            viewerUrls={sources.viewerUrls}
          />
        </ComparisonCountContext.Provider>
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
 * of what is loaded, and what is compared with what is chosen underneath. */
function profileLinkSeparator(count: number): string {
  return count === 2 ? ' vs ' : ', ';
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

type UploadState =
  | { phase: 'idle' }
  /** `progress` is null until the first profile has been compressed. */
  | { phase: 'uploading'; progress: UploadProgress | null }
  | { phase: 'error'; error: string }
  /** `urlKey` is the profile list the upload produced. The confirmation is only
   * shown while that list is still the one on the page. */
  | { phase: 'done'; urlKey: string };

/**
 * A button that uploads the compared profiles and points the page at the
 * uploaded copies.
 *
 * Links to this page usually name Taskcluster artifacts, which expire, and the
 * comparison stops working when they do. Uploaded profiles do not expire. There
 * are no sharing options: the copies are uploaded exactly as loaded, so that
 * the report computed from them is the report on screen.
 */
function UploadProfiles({
  urls,
  names,
  isLoaded,
}: {
  urls: string[];
  names: string[];
  /** Whether the profiles have finished loading. The upload sends the copies
   * already in memory, so there is nothing to upload before then. */
  isLoaded: boolean;
}) {
  const dispatch = useDispatch();
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const urlKey = urls.join('\n');

  // The list on the page now, read when an upload finishes. If the reader has
  // changed the profiles in the meantime, the uploaded URLs belong to a list
  // that is no longer shown, and must not replace the new one.
  const currentUrlKey = useRef(urlKey);
  useEffect(() => {
    currentUrlKey.current = urlKey;
  }, [urlKey]);

  const handleClick = useCallback(async () => {
    const startedUrlKey = urlKey;
    setUpload({ phase: 'uploading', progress: null });
    try {
      const newUrls = await uploadComparedProfiles(urls, names, (progress) =>
        setUpload({ phase: 'uploading', progress })
      );
      if (currentUrlKey.current !== startedUrlKey) {
        setUpload({ phase: 'idle' });
        return;
      }
      // Replace rather than push: the page shows the same comparison as
      // before, and the entry it replaces is the one that will expire.
      withHistoryReplaceStateSync(() => {
        dispatch(changeProfilesToCompareBenchmark(newUrls, names));
      });
      setUpload({ phase: 'done', urlKey: newUrls.join('\n') });
    } catch (err) {
      setUpload({
        phase: 'error',
        error: String((err as Error)?.message ?? err),
      });
    }
  }, [dispatch, urlKey, urls, names]);

  switch (upload.phase) {
    case 'uploading': {
      const { progress } = upload;
      return (
        <p className="benchmarkUpload" role="status">
          {progress === null
            ? 'Preparing the upload…'
            : `Uploading profile ${progress.index + 1} of ${progress.count}: ` +
              `${Math.round(progress.fraction * 100)}%`}
        </p>
      );
    }
    case 'done':
      if (upload.urlKey === urlKey) {
        return (
          <p className="benchmarkUpload" role="status">
            The profiles are uploaded. The links above and the address of this
            page now point to the uploaded copies.
          </p>
        );
      }
      break;
    case 'idle':
    case 'error':
      break;
    default:
      throw new Error(
        `Unhandled upload phase ${(upload as UploadState).phase}`
      );
  }

  if (!isLoaded || urls.every(isPublicProfileUrl)) {
    return null;
  }
  return (
    <p className="benchmarkUpload">
      <button
        type="button"
        className="photon-button photon-button-default photon-button-micro"
        title={
          'Upload the profiles without removing any information from them. ' +
          'Uploaded profiles do not expire, so a link to this comparison ' +
          'keeps working. Anyone with the link can see the profiles.'
        }
        onClick={handleClick}
      >
        Upload profiles
      </button>
      {upload.phase === 'error' ? (
        <span className="benchmarkUpload__error">
          The upload failed: {upload.error}
        </span>
      ) : null}
    </p>
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

  const urlFilter = useSelector(getBenchmarkBucketFilter);
  const filter = useMemo(
    () => resolveBucketFilter(urlFilter, urls.length),
    [urlFilter, urls.length]
  );
  const { subject, comparand } = filter;
  const names = useMemo(
    (): BenchmarkProfileNames => ({
      base: comparand === 'best' ? FASTEST_OF_THE_OTHERS : allNames[comparand],
      new: allNames[subject],
    }),
    [allNames, subject, comparand]
  );

  // Which comparison is computed is URL state, so a shared link opens the one
  // its sender was reading. Choosing a different one recomputes it, which is
  // seconds of arithmetic but no downloads, since the profiles are cached by
  // URL.
  useEffect(() => {
    const allUrls = urlKey === '' ? [] : urlKey.split('\n');
    if (allUrls.length < 2) {
      setState({ phase: 'empty' });
      return undefined;
    }
    // A second edit while the first comparison is still being worked on would
    // otherwise race, and whichever finished last would win. Aborting also
    // stops the comparison itself — terminating the workers computing its
    // tables — rather than leaving it to spend seconds finishing tables for a
    // comparison nobody is looking at any more.
    const controller = new AbortController();
    setState({ phase: 'loading' });
    (async () => {
      try {
        for await (const progress of runBenchmarkComparison(
          allUrls,
          subject,
          comparand,
          controller.signal,
          // The seconds of arithmetic behind the bucket tables belong on other
          // threads: the page has a score table to paint and links to follow.
          createBenchmarkTableWorkerPool
        )) {
          if (controller.signal.aborted) {
            return;
          }
          setState({ phase: 'results', progress, subject, comparand });
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
    // arithmetic. The subject and comparand are in the deps because choosing a
    // different comparison out of an unchanged list is exactly what has to
    // re-run it.
  }, [urlKey, subject, comparand]);

  // Results from before the comparison changed, in the render before the effect
  // above has caught up. They are of a different comparison, so they are not
  // shown under the new one's controls.
  const isStale =
    state.phase === 'results' &&
    (state.subject !== subject || state.comparand !== comparand);

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
              to compare any one of them with the fastest of the others.
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
             * part nobody needs until they want different profiles. */}
            <p className="benchmarkProfileLinks">
              Profiles:{' '}
              {urls.map((url, i) => (
                <Fragment key={url}>
                  {i === 0 ? null : profileLinkSeparator(urls.length)}
                  <ProfileLink name={allNames[i]} url={url} />
                </Fragment>
              ))}
            </p>
            <UploadProfiles
              urls={urls}
              names={allNames}
              isLoaded={state.phase === 'results'}
            />
            <ComparisonSelect allNames={allNames} filter={filter} />
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

        {state.phase === 'loading' || isStale ? (
          <div className="benchmarkLoading">
            <div className="benchmarkSpinner" />
            {/* Only covers the part with nothing to show yet: downloading the
             * profiles and reading their per-iteration weights out. From the
             * score table onwards the remaining work is per-row, and each row
             * says so itself. */}
            <p>Loading profiles…</p>
          </div>
        ) : null}

        {state.phase === 'error' && (
          <div className="benchmarkError">
            <p>
              <strong>Error:</strong> {state.error}
            </p>
          </div>
        )}

        {state.phase === 'results' && !isStale && (
          <ComparisonResults
            progress={state.progress}
            allNames={allNames}
            filter={filter}
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
