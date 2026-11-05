/**
 * CLI entry point for compare-benchmark-stats.
 * See compare-benchmark-stats.ts for the browser-safe library logic.
 */

import fs from 'fs';
import minimist from 'minimist';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { extractBenchmarkStatsFromProfile } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import type { ProfileBenchmarkStats } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import type { BenchmarkHarness } from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import {
  applyBenjaminiHochberg,
  bucketTableSideOf,
  classifyChange,
  compareBucketsOf,
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
// Input
// ---------------------------------------------------------------------------

/**
 * Read either a profile or an already-extracted stats file, whichever it turns
 * out to be.
 *
 * Two profiles is the common case — a try push with and without a patch — and
 * having to run `extract-benchmark-stats` twice first, remember where the
 * intermediate files went, and pass the right pair of them is friction for no
 * benefit. `extract-benchmark-stats` is still there and its output is still
 * accepted, which is worth keeping for iterating on the comparison itself: it is
 * the expensive half, roughly ten seconds and 1.3 GB against a tenth of a second
 * to re-read the stats.
 *
 * Detection rather than a flag, because the answer is unambiguous from the bytes:
 * a profile is either gzipped or JSON without a `bucketNames` array in it.
 */
async function loadStats(
  path: string,
  harness: BenchmarkHarness
): Promise<ProfileBenchmarkStats> {
  const bytes = fs.readFileSync(path, null);
  const asStats = parseStatsFile(bytes);
  if (asStats !== null) {
    return asStats;
  }
  let profile;
  try {
    profile = await unserializeProfileOfArbitraryFormat(bytes.buffer);
  } catch (error) {
    // Passing the wrong file is the likeliest way to get here, and the
    // unserializer's own message does not mention that a stats file would also
    // have been fine. Say what was expected rather than dumping a stack.
    throw new Error(
      `${path} is neither a profile nor a stats file from ` +
        `extract-benchmark-stats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return extractBenchmarkStatsFromProfile(profile, harness);
}

function parseStatsFile(bytes: Buffer): ProfileBenchmarkStats | null {
  // Gzip magic: a profile, and not worth handing to JSON.parse.
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
  const candidate = parsed as Partial<ProfileBenchmarkStats>;
  if (
    !Array.isArray(candidate?.bucketNames) ||
    !Array.isArray(candidate.suites)
  ) {
    return null;
  }
  return candidate as ProfileBenchmarkStats;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const argv = minimist(process.argv.slice(2));

  if (!argv.base || !argv.new) {
    console.error(
      'Usage: compare-benchmark-stats --base <before> --new <after>\n' +
        '\n' +
        '  <before> and <after> are each either a profile (as captured, .gz and\n' +
        '  all) or a stats file from extract-benchmark-stats. Detected, not\n' +
        '  declared.\n' +
        '\n' +
        '  [--suite <name>]  per-suite tables; "" for all of them\n' +
        '  [--global]        the across-suite table too (default when no --suite)\n' +
        '  [--qvalue 0.05]   false discovery rate a bucket has to clear\n' +
        '  [--top 100]       cap each table; --all for no cap\n' +
        '  [--no-appeared]   skip buckets present in only one of the two\n' +
        '  [--harness speedometer|jetstream]'
    );
    process.exit(1);
  }

  const topN: number | null = argv.all ? null : (argv.top ?? 100);
  const qThreshold: number = argv.qvalue ?? 0.05;
  const suiteFilter: string | undefined = argv.suite;
  const showGlobal: boolean = !suiteFilter || argv.global;
  // minimist turns --no-appeared into { appeared: false }
  const excludeAppearedDisappeared: boolean = argv.appeared === false;

  const harness: BenchmarkHarness = argv.harness ?? 'speedometer';
  // Sequentially, not with Promise.all: extracting from a profile peaks around
  // 1.3 GB, and doing both at once would need that twice over for no gain, since
  // it is CPU-bound rather than waiting on anything.
  const base = await loadStats(argv.base, harness);
  const newStats = await loadStats(argv.new, harness);

  // Names, keys and funcs for each side, with the fallbacks a stats file older
  // than one of those fields needs. Once, here, rather than per table.
  const meta = {
    base: bucketTableSideOf(base),
    new: bucketTableSideOf(newStats),
  };

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

    const globalComparisons = compareBucketsOf(meta, {
      baseBuckets: baseGlobalBuckets,
      newBuckets: newGlobalBuckets,
      iterationCount,
      excludeAppearedDisappeared,
    });
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
      const comparisons = compareBucketsOf(meta, {
        baseBuckets: baseSuite.buckets,
        newBuckets: newSuite.buckets,
        iterationCount: baseSuite.iterationCount,
        excludeAppearedDisappeared,
      });
      printBucketResults(baseSuite.suiteName, comparisons, topN, qThreshold);
    }
  }
}

main().catch((err) => {
  // The message, not the stack: the errors reachable from here are about which
  // files were passed, and a stack through the bundler's minified output tells
  // the reader nothing. `--stack` for when it is a real bug.
  const argv = process.argv.slice(2);
  console.error(
    err instanceof Error && !argv.includes('--stack') ? err.message : err
  );
  process.exit(1);
});
