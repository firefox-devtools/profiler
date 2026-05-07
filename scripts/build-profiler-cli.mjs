/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { chmodSync, readFileSync } from 'fs';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const { version } = JSON.parse(
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
    __VERSION__: JSON.stringify(version),
  },
  external: [...nodeBaseConfig.external, 'gecko-profiler-demangle'],
};

async function build() {
  await esbuild.build(profilerCliConfig);
  chmodSync('profiler-cli/dist/profiler-cli.js', 0o755);
  console.log('✅ profiler-cli build completed');
}

build().catch(console.error);
