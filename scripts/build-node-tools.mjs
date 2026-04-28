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

async function build() {
  await esbuild.build(profilerEditConfig);
  console.log('✅ profiler-edit build completed');
}

build().catch(console.error);
