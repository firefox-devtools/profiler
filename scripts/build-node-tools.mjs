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

async function build() {
  await esbuild.build(profilerEditConfig);
  console.log('✅ profiler-edit build completed');
}

build().catch(console.error);
