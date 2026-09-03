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
const isDryRun = forwardedArgs.includes('--dry-run');
const isPrerelease = version.includes('-');
const tagArgs = userSpecifiedTag
  ? []
  : ['--tag', isPrerelease ? 'next' : 'latest'];

// Yarn 1 points `npm_config_registry` at its own read-only mirror, which has
// none of the credentials from ~/.npmrc. Only that variable is dropped, since
// clearing `npm_config_userconfig` too would hide the user's ~/.npmrc from npm.
function envWithoutYarnRegistry() {
  const env = { ...process.env };
  delete env.npm_config_registry;
  return env;
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
  run('npm', args, { env: envWithoutYarnRegistry() });
}

// `yarn build-cli` bundles the working copy, not a commit, so uncommitted
// changes would ship to npm with no commit or tag matching them.
function getDirtyFiles() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout.split('\n').filter((line) => line.trim() !== '');
}

function checkWorkingCopyClean() {
  const dirtyFiles = getDirtyFiles();
  if (dirtyFiles === null) {
    console.error(
      `Could not run 'git status' in ${repoRoot} to check the working copy.`
    );
    process.exit(1);
  }

  if (dirtyFiles.length === 0) {
    return;
  }

  const shown = dirtyFiles.slice(0, 20);
  const rest = dirtyFiles.length - shown.length;
  const listing = shown.join('\n') + (rest > 0 ? `\n... and ${rest} more` : '');

  console.error(
    `Working copy is not clean. 'yarn build-cli' bundles the working copy, so\n` +
      `these changes would be published without a matching commit or tag:\n\n` +
      `${listing}\n\n` +
      `Commit or stash them before publishing.`
  );
  process.exit(1);
}

// `npm publish` needs a token in ~/.npmrc to start at all, and fails with
// ENEEDAUTH rather than offering to log you in. Get that out of the way before
// the long test run instead of after it. The separate browser round trip npm
// makes at publish time is the 2FA check for the upload itself, so being
// logged in here does not replace it.
function isLoggedIn() {
  const result = spawnSync('npm', ['whoami'], {
    cwd: repoRoot,
    env: envWithoutYarnRegistry(),
    stdio: 'ignore',
  });
  return result.status === 0;
}

console.log(`Publishing ${name}@${version} ${tagArgs.join(' ')}`.trim());

checkWorkingCopyClean();

// A dry run uploads nothing, so it needs no credentials.
if (!isDryRun && !isLoggedIn()) {
  console.log('Not logged in to npm, running `npm login`.');
  runNpm(['login']);
}

run('yarn', ['test-all']);
run('yarn', ['build-cli']);
runNpm(['publish', 'profiler-cli/', ...tagArgs, ...forwardedArgs]);
