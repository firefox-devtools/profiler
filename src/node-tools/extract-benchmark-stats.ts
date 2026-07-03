/**
 * CLI entry point for extract-benchmark-stats.
 * See extract-benchmark-stats.ts for the browser-safe library logic.
 */

import fs from 'fs';
import minimist from 'minimist';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { extractBenchmarkStatsFromProfile } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import type { BenchmarkHarness } from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';

async function main() {
  const argv = minimist(process.argv.slice(2));

  if (!argv.input || !argv.output) {
    console.error(
      'Usage: extract-benchmark-stats --input <profile.json> --output <stats.json> [--harness speedometer|jetstream]'
    );
    process.exit(1);
  }

  const harness: BenchmarkHarness = argv.harness ?? 'speedometer';
  const uint8Array = fs.readFileSync(argv.input, null);
  const profile = await unserializeProfileOfArbitraryFormat(uint8Array.buffer);
  const stats = extractBenchmarkStatsFromProfile(profile, harness);

  // Float64Array serializes as an object with numeric keys under the default
  // JSON.stringify behaviour; the extractor returns typed subarrays for the
  // browser hot path, so convert them here for the CLI's JSON output.
  fs.writeFileSync(
    argv.output,
    JSON.stringify(stats, (_key, value) =>
      value instanceof Float64Array ? Array.from(value) : value
    )
  );
  console.log(
    `Wrote ${stats.suites.length} suites, ` +
      `${stats.globalBuckets.length} global buckets, ` +
      `${stats.suites.reduce((s, su) => s + su.buckets.length, 0)} suite-bucket pairs ` +
      `to ${argv.output}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
