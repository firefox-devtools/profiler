/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const require = createRequire(import.meta.url);

// The `source-map` package's Node build reads its WASM parser from
// `path.join(__dirname, 'mappings.wasm')` at runtime. Embed the .wasm into the
// bundle instead, so that profiler-edit.js keeps working when it's copied
// somewhere on its own.
const embedSourceMapWasmPlugin = {
  name: 'embed-source-map-wasm',
  setup(build) {
    build.onLoad(
      { filter: /[\\/]source-map[\\/]lib[\\/]read-wasm\.js$/ },
      () => {
        const wasmBase64 = readFileSync(
          require.resolve('source-map/lib/mappings.wasm')
        ).toString('base64');
        return {
          contents: `
            const bytes = Buffer.from(${JSON.stringify(wasmBase64)}, 'base64');
            module.exports = () => Promise.resolve(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            );
            module.exports.initialize = () => {};
          `,
          loader: 'js',
        };
      }
    );
  },
};

const profilerEditConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/profiler-edit.ts'],
  outfile: 'node-tools-dist/profiler-edit.js',
  plugins: [...nodeBaseConfig.plugins, embedSourceMapWasmPlugin],
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

// Dumps the call subtree below one benchmark bucket as per-iteration weight
// vectors, for docs-developer/auto-bucketing-prototype.mjs to consume.
const dumpBucketSubtreeConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/dump-bucket-subtree.ts'],
  outfile: 'node-tools-dist/dump-bucket-subtree.js',
};

const bucketNativeTreeConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/bucket-native-tree.ts'],
  outfile: 'node-tools-dist/bucket-native-tree.js',
};

const extractFunctionSourceConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/node-tools/extract-function-source.ts'],
  outfile: 'node-tools-dist/extract-function-source.js',
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
  await esbuild.build(dumpBucketSubtreeConfig);
  console.log('✅ dump-bucket-subtree build completed');
  await esbuild.build(bucketNativeTreeConfig);
  console.log('✅ bucket-native-tree build completed');
  await esbuild.build(extractFunctionSourceConfig);
  console.log('✅ extract-function-source build completed');
}

build().catch(console.error);
