/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pkgUrl = new URL('../profiler-cli/package.json', import.meta.url);
const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));

const forwardedArgs = process.argv.slice(2);
const userSpecifiedTag = forwardedArgs.some(
  (a) => a === '--tag' || a.startsWith('--tag=')
);
const isPrerelease = version.includes('-');
const tagArgs = userSpecifiedTag
  ? []
  : ['--tag', isPrerelease ? 'next' : 'latest'];

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('yarn', ['test-all']);
run('yarn', ['build-profiler-cli']);
run('npm', ['publish', 'profiler-cli/', ...tagArgs, ...forwardedArgs]);
