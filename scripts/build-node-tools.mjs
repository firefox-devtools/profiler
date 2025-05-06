/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const profilerEditConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/profiler-edit.ts'],
  outfile: 'node-tools-dist/profiler-edit.js',
};

const analyzeBenchmarkConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/analyze-benchmark.ts'],
  outfile: 'node-tools-dist/analyze-benchmark.js',
};

const extractBenchmarkStatsConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/extract-benchmark-stats.ts'],
  outfile: 'node-tools-dist/extract-benchmark-stats.js',
};

const compareBenchmarkStatsConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/compare-benchmark-stats.ts'],
  outfile: 'node-tools-dist/compare-benchmark-stats.js',
};

async function build() {
  await esbuild.build(profilerEditConfig);
  console.log('✅ profiler-edit build completed');
  await esbuild.build(analyzeBenchmarkConfig);
  console.log('✅ analyze-benchmark build completed');
  await esbuild.build(extractBenchmarkStatsConfig);
  console.log('✅ extract-benchmark-stats build completed');
  await esbuild.build(compareBenchmarkStatsConfig);
  console.log('✅ compare-benchmark-stats build completed');
}

build().catch(console.error);
