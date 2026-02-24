/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import { photonConfig } from './lib/esbuild-configs.mjs';

async function buildPhoton() {
  console.log('Building Photon...');
  await esbuild.build(photonConfig);
  console.log('✅ Photon build completed');
}

buildPhoton().catch(console.error);
