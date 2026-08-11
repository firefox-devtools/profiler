/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pkgUrl = new URL('../profiler-cli/package.json', import.meta.url);
const { name, version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));

const forwardedArgs = process.argv.slice(2);
const userSpecifiedTag = forwardedArgs.some(
  (a) => a === '--tag' || a.startsWith('--tag=')
);
const isPrerelease = version.includes('-');
const tagArgs = userSpecifiedTag
  ? []
  : ['--tag', isPrerelease ? 'next' : 'latest'];

// Yarn 1 injects its own `npm_config_*` variables into the environment of the
// scripts it runs, most importantly `npm_config_registry` pointing at
// registry.yarnpkg.com. npm inherits those, and since that mirror is read-only
// and holds none of the credentials from ~/.npmrc, `npm publish` fails with
// ENEEDAUTH. Give npm the environment it would see in a plain shell.
function envWithoutNpmConfig() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('npm_'))
  );
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) {
    console.error(`Failed to run '${cmd}': ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpm(args) {
  run('npm', args, { env: envWithoutNpmConfig() });
}

// `npm publish` needs a token in ~/.npmrc to start at all, and fails with
// ENEEDAUTH rather than offering to log you in. Get that out of the way before
// the long test run instead of after it. The separate browser round trip npm
// makes at publish time is the 2FA check for the upload itself, so being
// logged in here does not replace it.
function isLoggedIn() {
  const result = spawnSync('npm', ['whoami'], {
    cwd: repoRoot,
    env: envWithoutNpmConfig(),
    stdio: 'ignore',
  });
  return result.status === 0;
}

console.log(`Publishing ${name}@${version} ${tagArgs.join(' ')}`.trim());

if (!isLoggedIn()) {
  console.log('Not logged in to npm, running `npm login`.');
  runNpm(['login']);
}

run('yarn', ['test-all']);
run('yarn', ['build-cli']);
runNpm(['publish', 'profiler-cli/', ...tagArgs, ...forwardedArgs]);
