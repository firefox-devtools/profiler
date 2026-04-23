/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const symbolicatorConfig = {
  ...nodeBaseConfig,
  metafile: true,
  entryPoints: ['src/merge-android-profiles/index.ts'],
  outfile: 'dist/merge-android-profiles.js',
};

async function build() {
  await esbuild.build(symbolicatorConfig);
  console.log('✅ merge-android-profiles build completed');
}

build().catch(console.error);
