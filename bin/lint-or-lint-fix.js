/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { spawnSync } = require('child_process');

const shouldFix = process.argv.includes('--fix');
const scriptToRun = shouldFix ? 'lint-fix' : 'lint-internal';
const result = spawnSync('yarn', [scriptToRun], { stdio: 'inherit' });
process.exitCode = result.status;
