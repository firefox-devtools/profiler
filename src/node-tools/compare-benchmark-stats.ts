/**
 * CLI entry point for compare-benchmark-stats.
 * See compare-benchmark-stats.ts for the browser-safe library logic.
 */

import fs from 'fs';
import minimist from 'minimist';
import type { ProfileBenchmarkStats } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import {
  compareBuckets,
  compareIterationTotals,
  suiteIterationTotals,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type {
  BucketComparison,
  ScoreComparison,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatChange(rel: number): string {
  if (!isFinite(rel)) return rel > 0 ? 'appeared' : 'disappeared';
  const pct = (rel * 100).toFixed(2);
  return rel >= 0 ? `+${pct}%` : `${pct}%`;
}

function printScoreAndSubtests(
  overall: ScoreComparison,
  suites: ScoreComparison[]
) {
  const COL = 45;
  const overallAbsDiff = overall.newMean - overall.baseMean;
  const overallAbsStr =
    (overallAbsDiff >= 0 ? '+' : '') + overallAbsDiff.toFixed(2);
  console.log(
    `${'Score'.padEnd(COL)} ${'base mean'.padStart(10)} ${'new mean'.padStart(10)} ${'Δ abs'.padStart(10)} ${'Δ%'.padStart(10)} ${'effect'.padStart(10)} ${'confidence'.padStart(12)}`
  );
  console.log('-'.repeat(COL + 64));
  console.log(
    `${'Overall (geomean-normalised)'.padEnd(COL)} ${overall.baseMean.toFixed(2).padStart(10)} ${overall.newMean.toFixed(2).padStart(10)} ${overallAbsStr.padStart(10)} ${formatChange(overall.relChange).padStart(10)} ${overall.effectSize.padStart(10)} ${overall.confidence.padStart(12)}`
  );
  console.log('');
  for (const s of suites) {
    const absDiff = s.newMean - s.baseMean;
    const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
    const label =
      s.label.length > COL - 2 ? s.label.slice(0, COL - 5) + '...' : s.label;
    console.log(
      `${'  ' + label.padEnd(COL - 2)} ${s.baseMean.toFixed(2).padStart(10)} ${s.newMean.toFixed(2).padStart(10)} ${absDiffStr.padStart(10)} ${formatChange(s.relChange).padStart(10)} ${s.effectSize.padStart(10)} ${s.confidence.padStart(12)}`
    );
  }
}

function printBucketResults(
  label: string,
  comparisons: BucketComparison[],
  topN: number | null
) {
  const significant = comparisons
    .filter((c) => c.confidence !== 'LOW')
    .sort(
      (a, b) =>
        Math.abs(b.newMean - b.baseMean) - Math.abs(a.newMean - a.baseMean)
    );

  if (significant.length === 0) {
    console.log(`\n[${label}] No significant bucket changes.`);
    return;
  }

  const shown = topN !== null ? significant.slice(0, topN) : significant;
  console.log(
    `\n[${label}] ${significant.length} significant buckets` +
      (topN !== null && significant.length > topN
        ? `, showing top ${topN} by absolute impact:`
        : ':')
  );
  console.log(
    `${'Bucket name'.padEnd(60)} ${'base mean'.padStart(10)} ${'new mean'.padStart(10)} ${'Δ abs'.padStart(10)} ${'Δ%'.padStart(10)} ${'effect'.padStart(10)} ${'confidence'.padStart(12)}`
  );
  console.log('-'.repeat(125));
  for (const c of shown) {
    const name =
      c.bucketName.length > 59
        ? c.bucketName.slice(0, 56) + '...'
        : c.bucketName;
    const absDiff = c.newMean - c.baseMean;
    const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
    console.log(
      `${name.padEnd(60)} ${c.baseMean.toFixed(2).padStart(10)} ${c.newMean.toFixed(2).padStart(10)} ${absDiffStr.padStart(10)} ${formatChange(c.relChange).padStart(10)} ${c.effectSize.padStart(10)} ${c.confidence.padStart(12)}`
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
        '  [--suite <name>] [--global] [--top 100] [--all] [--no-appeared]'
    );
    process.exit(1);
  }

  const topN: number | null = argv.all ? null : (argv.top ?? 100);
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

  const iterationCount = base.suites[0]?.iterationCount ?? 1;

  if (showGlobal) {
    const baseGlobalIter = suiteIterationTotals(
      base.globalBuckets,
      iterationCount
    );
    const newGlobalIter = suiteIterationTotals(
      newStats.globalBuckets,
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

    console.log('\n--- Score and subtest totals ---\n');
    printScoreAndSubtests(overallScore, suiteScores);

    const globalComparisons = compareBuckets(
      base.globalBuckets,
      newStats.globalBuckets,
      base.bucketNames,
      newStats.bucketNames,
      iterationCount,
      excludeAppearedDisappeared
    );
    printBucketResults('Global (geomean-normalised)', globalComparisons, topN);
  }

  if (suiteFilter !== undefined) {
    const matchingSuites = base.suites.filter((s) =>
      s.suiteName.toLowerCase().includes(suiteFilter.toLowerCase())
    );

    if (matchingSuites.length === 0) {
      console.error(`No suites matching "${suiteFilter}". Available suites:`);
      for (const s of base.suites) console.error(`  ${s.suiteName}`);
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
        baseSuite.iterationCount,
        excludeAppearedDisappeared
      );
      printBucketResults(baseSuite.suiteName, comparisons, topN);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
