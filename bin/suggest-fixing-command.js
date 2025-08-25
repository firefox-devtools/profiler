/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file runs before linting commands and intercept errors so that more
// friendly errors can be output.

const cp = require('child_process');

const scriptToRun = process.argv[2];
const scriptToSuggest = process.argv[3];
const extraArgs = process.argv.slice(4);

const result = cp.spawnSync('yarn', [scriptToRun, ...extraArgs], {
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exitCode = result.status;
  console.log(
    '💡 You might be able to fix the error by running `yarn ' +
      scriptToSuggest +
      '`'
  );
}
