/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a script which can be run with or without --fix.
// It will run prettier with the right flags.

const { spawnSync } = require('child_process');

const PRETTIER_FLAGS = [
  '--cache',
  ...['--cache-strategy', 'content'],
  ...['--cache-location', '.prettiercache'],
  ...['--log-level', 'warn'],
];

const shouldFix = process.argv.includes('--fix');
const writeOrCheck = shouldFix ? '--write' : '--check';
const args = [writeOrCheck, '.', ...PRETTIER_FLAGS];
const result = spawnSync('prettier', args, { stdio: 'inherit' });
process.exitCode = result.status;
