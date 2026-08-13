/**
 * CLI entry point for compare-benchmark-stats.
 * See compare-benchmark-stats.ts for the browser-safe library logic.
 */

import fs from 'fs';
import minimist from 'minimist';
import type { ProfileBenchmarkStats } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import {
  applyBenjaminiHochberg,
  classifyChange,
  compareBuckets,
  compareIterationTotals,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
  RESOLUTION_TOLERANCE,
  suiteIterationTotals,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type {
  BucketComparison,
  ComparisonStats,
  ScoreComparison,
  Verdict,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Minimum detectable effect, tagged "~" when it rests on an approximation.
 *
 * A bucket MDE is built on the family pass's permutation-derived critical |t|, so
 * it rests on no approximation. A score row MDE comes from the Welch t
 * distribution, which is only as good as that approximation is for the row in
 * question. The family pass supplies familyWiseP exactly when it supplied the MDE,
 * so that is the flag.
 */
function formatMde(row: ComparisonStats): string {
  const approximate = row.familyWiseP === null;
  return `${approximate ? '~' : ''}\u00b1${row.mde.toFixed(2)}`;
}

function formatChange(rel: number): string {
  if (!isFinite(rel)) {
    return rel > 0 ? 'appeared' : 'disappeared';
  }
  const pct = (rel * 100).toFixed(2);
  return rel >= 0 ? `+${pct}%` : `${pct}%`;
}

/** Plain-language answer for a row, which is what the reader came for. */
const VERDICT_LABELS: Record<Verdict, string> = {
  slower: 'SLOWER',
  faster: 'FASTER',
  unchanged: 'no change',
  unresolved: "can't tell",
};

function printScoreAndSubtests(
  overall: ScoreComparison,
  suites: ScoreComparison[]
) {
  const COL = 45;
  const row = (label: string, s: ScoreComparison) => {
    const absDiff = s.newMean - s.baseMean;
    const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
    return (
      `${label.padEnd(COL)} ${s.baseMean.toFixed(2).padStart(10)} ` +
      `${s.newMean.toFixed(2).padStart(10)} ${absDiffStr.padStart(10)} ` +
      `${formatMde(s).padStart(9)} ${formatChange(s.relChange).padStart(10)} ` +
      `${formatCorrected(s.qValue).padStart(9)} ` +
      `${VERDICT_LABELS[classifyChange(s)].padStart(11)}`
    );
  };
  console.log(
    `${'Score'.padEnd(COL)} ${'base mean'.padStart(10)} ${'new mean'.padStart(10)} ${'Δ abs'.padStart(10)} ${'MDE'.padStart(9)} ${'Δ%'.padStart(10)} ${'q'.padStart(9)} ${'verdict'.padStart(11)}`
  );
  console.log('-'.repeat(COL + 72));
  console.log(row('Overall (geomean-normalised)', overall));
  console.log('');
  for (const s of suites) {
    const label =
      s.label.length > COL - 2 ? s.label.slice(0, COL - 5) + '...' : s.label;
    console.log(row('  ' + label, s));
  }
  console.log(
    '\nThe subtest q-values are corrected for there being 20 subtests. The ' +
      'overall\nscore has no q: it is the one hypothesis you came to ask about, ' +
      'so it is judged\non its own p-value. "can\'t tell" means the MDE beside ' +
      'it is more than ' +
      `${(RESOLUTION_TOLERANCE * 100).toFixed(0)}% of the\nrow, i.e. this many ` +
      'runs could not have resolved a change worth caring about.'
  );
}

/** A corrected p-value, or "-" for a row that is not part of a family. */
function formatCorrected(value: number | null): string {
  if (value === null) {
    return '-';
  }
  return value >= 0.1 ? value.toFixed(2) : value.toPrecision(2);
}

function printBucketResults(
  label: string,
  comparisons: BucketComparison[],
  topN: number | null,
  qThreshold: number
) {
  // The uncorrected count is printed alongside the corrected one because the gap
  // between them is the whole point: at ~6800 buckets, p ≤ 0.05 admits hundreds
  // of rows on two builds that do not differ at all.
  const uncorrected = comparisons.filter((c) => c.pValue <= 0.05).length;
  const familyWise = comparisons.filter(
    (c) => c.familyWiseP !== null && c.familyWiseP <= 0.05
  ).length;
  const discoveries = comparisons
    .filter((c) => c.qValue !== null && c.qValue <= qThreshold)
    .sort(
      (a, b) =>
        Math.abs(b.newMean - b.baseMean) - Math.abs(a.newMean - a.baseMean)
    );

  console.log(
    `\n[${label}] ${comparisons.length} buckets tested. ` +
      `${uncorrected} at p ≤ 0.05 (uncorrected), ` +
      `${discoveries.length} at q ≤ ${qThreshold} (FDR), ` +
      `${familyWise} at FWER ≤ 0.05.`
  );
  if (discoveries.length === 0) {
    console.log('No bucket survives the multiple-comparisons correction.');
    return;
  }

  const shown = topN !== null ? discoveries.slice(0, topN) : discoveries;
  if (topN !== null && discoveries.length > topN) {
    console.log(`Showing the top ${topN} by absolute impact:`);
  }
  console.log(
    `${'Bucket name'.padEnd(60)} ${'base mean'.padStart(10)} ${'new mean'.padStart(10)} ${'Δ abs'.padStart(10)} ${'MDE'.padStart(9)} ${'Δ%'.padStart(10)} ${'q'.padStart(9)} ${'pFWER'.padStart(9)}`
  );
  console.log('-'.repeat(132));
  for (const c of shown) {
    const name =
      c.bucketName.length > 59
        ? c.bucketName.slice(0, 56) + '...'
        : c.bucketName;
    const absDiff = c.newMean - c.baseMean;
    const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
    console.log(
      `${name.padEnd(60)} ${c.baseMean.toFixed(2).padStart(10)} ${c.newMean.toFixed(2).padStart(10)} ${absDiffStr.padStart(10)} ${formatMde(c).padStart(9)} ${formatChange(c.relChange).padStart(10)} ${formatCorrected(c.qValue).padStart(9)} ${formatCorrected(c.familyWiseP).padStart(9)}`
    );
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const argv = minimist(process.argv.slice(2));

  if (!argv.base || !argv.new) {
    console.error(
      'Usage: compare-benchmark-stats --base <base-stats.json> --new <new-stats.json>\n' +
        '  [--suite <name>] [--global] [--top 100] [--all] [--no-appeared]\n' +
        '  [--qvalue 0.05]'
    );
    process.exit(1);
  }

  const topN: number | null = argv.all ? null : (argv.top ?? 100);
  const qThreshold: number = argv.qvalue ?? 0.05;
  const suiteFilter: string | undefined = argv.suite;
  const showGlobal: boolean = !suiteFilter || argv.global;
  // minimist turns --no-appeared into { appeared: false }
  const excludeAppearedDisappeared: boolean = argv.appeared === false;

  const base: ProfileBenchmarkStats = JSON.parse(
    fs.readFileSync(argv.base, 'utf8')
  );
  const newStats: ProfileBenchmarkStats = JSON.parse(
    fs.readFileSync(argv.new, 'utf8')
  );

  // bucketFuncs was added later; older stats files don't include it. The CLI
  // doesn't need real func indices (no flame graph here), so fill with -1.
  if (!base.bucketFuncs) {
    base.bucketFuncs = new Array(base.bucketNames.length).fill(-1);
  }
  if (!newStats.bucketFuncs) {
    newStats.bucketFuncs = new Array(newStats.bucketNames.length).fill(-1);
  }
  // bucketKeys was added later too; fall back to bucketNames so older stats
  // files still match using the prior name-based behaviour.
  if (!base.bucketKeys) {
    base.bucketKeys = base.bucketNames;
  }
  if (!newStats.bucketKeys) {
    newStats.bucketKeys = newStats.bucketNames;
  }

  const iterationCount = base.suites[0]?.iterationCount ?? 1;

  if (showGlobal) {
    // One shared set of per-suite normalisation factors for both profiles, so
    // that the rank statistics compare like with like. Older stats files also
    // carry a per-profile `globalBuckets` array; it's ignored, since its
    // factors were computed from that profile alone.
    const sharedSuiteFactors = computeSharedSuiteFactors(base, newStats);
    const baseGlobalBuckets = computeGlobalBuckets(
      base,
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
    const newGlobalIter = suiteIterationTotals(
      newGlobalBuckets,
      iterationCount
    );
    const overallScore = compareIterationTotals(
      'Overall',
      baseGlobalIter,
      newGlobalIter
    );

    const suiteScores: ScoreComparison[] = [];
    for (const baseSuite of base.suites) {
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

    console.log('\n--- Score and subtest totals ---\n');
    printScoreAndSubtests(overallScore, suiteScores);

    const globalComparisons = compareBuckets(
      baseGlobalBuckets,
      newGlobalBuckets,
      base.bucketNames,
      newStats.bucketNames,
      base.bucketFuncs,
      newStats.bucketFuncs,
      iterationCount,
      excludeAppearedDisappeared,
      base.bucketKeys,
      newStats.bucketKeys
    );
    printBucketResults(
      'Global (geomean-normalised)',
      globalComparisons,
      topN,
      qThreshold
    );
  }

  if (suiteFilter !== undefined) {
    const matchingSuites = base.suites.filter((s) =>
      s.suiteName.toLowerCase().includes(suiteFilter.toLowerCase())
    );

    if (matchingSuites.length === 0) {
      console.error(`No suites matching "${suiteFilter}". Available suites:`);
      for (const s of base.suites) {
        console.error(`  ${s.suiteName}`);
      }
      process.exit(1);
    }

    for (const baseSuite of matchingSuites) {
      const newSuite = newStats.suites.find(
        (s) => s.suiteName === baseSuite.suiteName
      );
      if (newSuite === undefined) {
        console.warn(
          `Suite "${baseSuite.suiteName}" not found in new stats, skipping.`
        );
        continue;
      }
      const comparisons = compareBuckets(
        baseSuite.buckets,
        newSuite.buckets,
        base.bucketNames,
        newStats.bucketNames,
        base.bucketFuncs,
        newStats.bucketFuncs,
        baseSuite.iterationCount,
        excludeAppearedDisappeared,
        base.bucketKeys,
        newStats.bucketKeys
      );
      printBucketResults(baseSuite.suiteName, comparisons, topN, qThreshold);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
