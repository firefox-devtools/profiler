/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file runs before linting commands and intercept errors so that more
// friendly errors can be output.

const cp = require('child_process');

const fixingCommands = {
  lint: 'lint-fix',
  'lint-js': 'lint-fix-js',
  'lint-css': 'lint-fix-css',
  'prettier-run': 'prettier-fix',
  test: 'test -u',
};

const command = process.argv.slice(2);

const result = cp.spawnSync(command[0], command.slice(1), { stdio: 'inherit' });

if (result.status !== 0) {
  process.exitCode = result.status;
  const currentScriptName = process.env.npm_lifecycle_event;
  if (currentScriptName && currentScriptName in fixingCommands) {
    console.log(
      '💡 You might be able to fix the error by running `yarn ' +
        fixingCommands[currentScriptName] +
        '`'
    );
  }
}
