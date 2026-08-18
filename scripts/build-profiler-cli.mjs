/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { chmodSync, copyFileSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const require = createRequire(import.meta.url);

const { name, version } = JSON.parse(
  readFileSync(new URL('../profiler-cli/package.json', import.meta.url), 'utf8')
);

const BUILD_HASH = Date.now().toString(36);

const profilerCliConfig = {
  ...nodeBaseConfig,
  entryPoints: ['profiler-cli/src/index.ts'],
  loader: { ...nodeBaseConfig.loader, '.txt': 'text' },
  outfile: 'profiler-cli/dist/profiler-cli.js',
  minify: true,
  banner: {
    js: '#!/usr/bin/env node\n\n// Polyfill browser globals for Node.js\nglobalThis.self = globalThis;',
  },
  define: {
    __BUILD_HASH__: JSON.stringify(BUILD_HASH),
    __PACKAGE_NAME__: JSON.stringify(name),
    __VERSION__: JSON.stringify(version),
    // SOURCE_MAP_WORKER_PATH is injected by the browser build. The CLI doesn't
    // use source map workers but the shared code references this constant.
    SOURCE_MAP_WORKER_PATH: JSON.stringify('/source-map.worker.js'),
  },
  external: [...nodeBaseConfig.external, 'gecko-profiler-demangle'],
};

async function build() {
  await esbuild.build(profilerCliConfig);
  chmodSync('profiler-cli/dist/profiler-cli.js', 0o755);

  // The `source-map` package's Node build reads its WASM parser from
  // `path.join(__dirname, 'mappings.wasm')` at runtime and its `initialize` is
  // a no-op, so the .wasm must sit next to the bundle. esbuild bundles the JS
  // but not this runtime file, so copy it in explicitly.
  copyFileSync(
    require.resolve('source-map/lib/mappings.wasm'),
    'profiler-cli/dist/mappings.wasm'
  );

  console.log('✅ profiler-cli build completed');
}

build().catch(console.error);
