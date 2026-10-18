/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Comparing one profile, the subject, with the fastest of the other loaded
 * profiles, row by row.
 *
 * The question this answers is "where is Firefox behind anyone, and by how
 * much". Its answer differs per row: Safari may be the fastest at one function
 * and Chrome at the next. So the subject is compared with every other profile,
 * one ordinary pairwise comparison each, and the rows are combined afterwards.
 * Each combined row carries the index of the profile its numbers are measured
 * against.
 *
 * ## Which comparison a row shows
 *
 * - If some other profile is faster than the subject on this row, the row is
 *   about the subject being slower. It shows the largest gap that is
 *   significant. If none is significant, it shows the gap to the fastest other
 *   profile, which is also the largest gap.
 * - If the subject is faster than every other profile, the row is about the
 *   subject being the fastest. It shows the gap to the closest competitor,
 *   which is the fastest of the others. It only counts as significant if the
 *   subject is significantly faster than every other profile.
 *
 * ## Why every comparison is held to alpha / m
 *
 * With m other profiles there are m comparisons per row, and a row is reported
 * if one of them clears the bar. Picking the best of several chances finds
 * something in noise more often than one chance would. Concretely: each pairwise
 * table controls its own false discovery rate, but a row reported via any one of
 * m tables can be false in any of them, and in the worst case the false rows add
 * up while the rows do not. Holding each comparison to alpha / m (Bonferroni over
 * the m comparisons) bounds the rate among the reported rows by alpha again.
 *
 * The "faster than every other" claim could get away with alpha per comparison,
 * because it needs all of them to clear (an intersection-union test). It uses
 * alpha / m as well, so that one rule covers every row and the q column means the
 * same thing throughout. This errs conservative.
 *
 * The adjusted significance is written to `qValue`, as `m × q` (or `m × p` for a
 * row that had no q-value), capped at 1. So `qValue ≤ alpha` is still the test,
 * and `classifyChange` needs no special case. For the "faster than every other"
 * case it is `m × ` the weakest of the m comparisons.
 *
 * The MDEs have to move with the bar, for the reason given in
 * docs-developer/benchmark-compare-fdr.md: an MDE is the smallest change that
 * would have been reported. The pairwise comparisons are run with alpha / m for
 * that reason, so the rows arriving here already carry the stricter MDE.
 *
 * With two profiles loaded, m is 1 and none of this applies: the view runs the
 * one pairwise comparison and does not call this module.
 */

import { bucketMatchKey } from './compare-benchmark-stats';
import type {
  BucketComparison,
  ComparisonStats,
  ScoreComparison,
} from './compare-benchmark-stats';

/** A row of the report, with the profile its Δ is measured against. `baseMean`
 * is that profile's mean, and `newMean` is the subject's. */
export type Compared<Row> = Row & {
  /** Position of the base side in the loaded profile list. */
  readonly comparand: number;
};

export type ComparedScore = Compared<ScoreComparison>;
export type ComparedBucket = Compared<BucketComparison>;

/** One pairwise comparison of the subject with one other profile. */
export type PairwiseRow<Row> = {
  /** Position of the other profile in the loaded profile list. */
  comparand: number;
  row: Row;
};

/** One pairwise bucket table, with the profile it compared the subject to. */
export type PairwiseBucketTable = {
  comparand: number;
  rows: BucketComparison[];
};

/** The figure a row's verdict is judged on: the corrected q-value where the row
 * has one, its own p-value where it does not. Same rule as `classifyChange`. */
function significanceOf(row: ComparisonStats): number {
  return row.qValue ?? row.pValue;
}

/**
 * Combine one row's pairwise comparisons into the row the report shows.
 *
 * `candidates` holds every comparison that exists for this row, which can be
 * fewer than `comparisonCount`: a subtest that one of the other profiles did not
 * run has no comparison with it. `comparisonCount` is still the m the bar is
 * divided by, so that every row is held to the same bar, and the MDEs computed
 * at that bar stay right.
 */
export function combineAgainstFastest<Row extends ComparisonStats>(
  candidates: ReadonlyArray<PairwiseRow<Row>>,
  comparisonCount: number,
  alpha: number = 0.05
): Compared<Row> {
  if (candidates.length === 0) {
    throw new Error('A row needs at least one comparison to be combined.');
  }
  const adjust = (significance: number) =>
    Math.min(1, comparisonCount * significance);

  // The largest Δ is the gap to the fastest other profile, since the subject's
  // own mean is the same in every comparison.
  let fastest = candidates[0];
  for (const candidate of candidates) {
    if (candidate.row.delta > fastest.row.delta) {
      fastest = candidate;
    }
  }

  if (fastest.row.delta < 0) {
    // Faster than every other profile. The claim is about all of them, so it is
    // only as strong as the weakest comparison.
    let weakest = 0;
    for (const candidate of candidates) {
      weakest = Math.max(weakest, significanceOf(candidate.row));
    }
    return {
      ...fastest.row,
      comparand: fastest.comparand,
      qValue: adjust(weakest),
    };
  }

  // Slower than at least one. Show the largest gap that is significant, so that
  // the profile the row names is one the subject is shown to be slower than. If
  // no gap is significant, the largest one is the honest thing to show.
  let chosen = fastest;
  if (adjust(significanceOf(fastest.row)) > alpha) {
    let best: PairwiseRow<Row> | null = null;
    for (const candidate of candidates) {
      if (
        candidate.row.delta > 0 &&
        adjust(significanceOf(candidate.row)) <= alpha &&
        (best === null || candidate.row.delta > best.row.delta)
      ) {
        best = candidate;
      }
    }
    if (best !== null) {
      chosen = best;
    }
  }
  return {
    ...chosen.row,
    comparand: chosen.comparand,
    qValue: adjust(significanceOf(chosen.row)),
  };
}

/** A comparison of two sides that both spent nothing: what a bucket table's
 * missing row means. Named after `template`, the same bucket in another table. */
function bothSpentNothing(template: BucketComparison): BucketComparison {
  return {
    key: template.key,
    bucketName: template.bucketName,
    baseFunc: null,
    newFunc: null,
    baseMean: 0,
    newMean: 0,
    relChange: 0,
    delta: 0,
    se: 0,
    df: 0,
    pValue: 1,
    pValueMethod: 'permutation',
    mde: 0,
    qValue: 1,
    familyWiseP: 1,
  };
}

/**
 * Combine the pairwise bucket tables behind one score row.
 *
 * Rows are matched across tables by `bucketMatchKey`, the rule every table
 * already matched its two sides by. A table leaves out a bucket that neither of
 * its two profiles spent any time in. That is a comparison of zero with zero, not
 * a missing one, so it takes part as such: it is how a function that only Chrome
 * runs is not reported as Firefox being slower than Safari.
 */
export function combineBucketTables(
  tables: ReadonlyArray<PairwiseBucketTable>,
  comparisonCount: number,
  alpha: number = 0.05
): ComparedBucket[] {
  // Per match key, that bucket's row in each table, in table order.
  const rowsByKey = new Map<string, Array<BucketComparison | undefined>>();
  tables.forEach((table, tableIndex) => {
    for (const row of table.rows) {
      const matchKey = bucketMatchKey(row.key, row.bucketName);
      let perTable = rowsByKey.get(matchKey);
      if (perTable === undefined) {
        perTable = new Array(tables.length);
        rowsByKey.set(matchKey, perTable);
      }
      perTable[tableIndex] = row;
    }
  });

  const combined: ComparedBucket[] = [];
  for (const perTable of rowsByKey.values()) {
    const template = perTable.find((row) => row !== undefined);
    if (template === undefined) {
      continue;
    }
    const candidates = tables.map((table, tableIndex) => ({
      comparand: table.comparand,
      row: perTable[tableIndex] ?? bothSpentNothing(template),
    }));
    combined.push(combineAgainstFastest(candidates, comparisonCount, alpha));
  }
  return combined;
}
