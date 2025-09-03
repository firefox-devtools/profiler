/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { nodeBaseConfig } from './lib/esbuild-configs.mjs';

const symbolicatorConfig = {
  ...nodeBaseConfig,
  metafile: true,
  entryPoints: ['src/symbolicator-cli/index.ts'],
  outfile: 'dist/symbolicator-cli.js',
};

async function build() {
  await esbuild.build(symbolicatorConfig);
  console.log('✅ Symbolicator-cli build completed');
}

build().catch(console.error);
