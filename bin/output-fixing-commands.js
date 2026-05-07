/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file runs before linting commands and intercept errors so that more
// friendly errors can be output.

const spawn = require('cross-spawn');

const fixingCommands = {
  lint: 'lint-fix',
  'lint-js': 'lint-fix-js',
  'lint-css': 'lint-fix-css',
  'prettier-run': 'prettier-fix',
  test: 'test -u',
  'test-cli': 'test-cli -u',
};

const command = process.argv.slice(2);
const currentScriptName = process.env.npm_lifecycle_event;

// Redirect the main lint command, but not individual commands.
if (currentScriptName === 'lint' && command.includes('--fix')) {
  console.log(`🔧 Detected --fix flag, running: yarn lint-fix`);
  const result = spawn.sync('yarn', ['lint-fix'], { stdio: 'inherit' });
  if (result.error) {
    console.error(`❌ Failed to spawn command: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status;
  }
  process.exit();
}

const result = spawn.sync(command[0], command.slice(1), { stdio: 'inherit' });

if (result.error) {
  console.error(`❌ Failed to spawn command: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status;
  if (currentScriptName && currentScriptName in fixingCommands) {
    console.log(
      '💡 You might be able to fix the error by running `yarn ' +
        fixingCommands[currentScriptName] +
        '`'
    );
  }
}
