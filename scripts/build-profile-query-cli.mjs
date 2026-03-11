/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { execSync } from 'child_process';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const BUILD_HASH = Date.now().toString(36);

const profileQueryCliConfig = {
  ...nodeBaseConfig,
  entryPoints: ['src/profile-query-cli/index.ts'],
  loader: { ...nodeBaseConfig.loader, '.txt': 'text' },
  outfile: 'src/profile-query-cli/dist/pq.js',
  minify: true,
  banner: {
    js: '#!/usr/bin/env node\n\n// Polyfill browser globals for Node.js\nglobalThis.self = globalThis;',
  },
  define: {
    __BUILD_HASH__: JSON.stringify(BUILD_HASH),
  },
  external: [...nodeBaseConfig.external, 'gecko-profiler-demangle'],
};

async function build() {
  await esbuild.build(profileQueryCliConfig);
  execSync('chmod +x src/profile-query-cli/dist/pq.js');
  console.log('✅ Profile-query-cli build completed');
}

build().catch(console.error);
