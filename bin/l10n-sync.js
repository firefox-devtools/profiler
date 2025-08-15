#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This script will sync the l10 branch with the main branch.
// You can run this script with `node bin/l10n-sync.js` but you don't necessarily
// have to be at the project root directory to run it.
// Run with '-y' to automatically skip the prompts.

const cp = require('child_process');
const readline = require('readline');
const { promisify } = require('util');

/*::
  type ExecFilePromiseResult = {|
    stdout: string | Buffer,
    stderr: string | Buffer
  |};

  type ExecFile = (
    command: string,
    args?: string[]
  ) => Promise<ExecFilePromiseResult>;
*/

const execFile /*: ExecFile */ = promisify(cp.execFile);

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

let SKIP_PROMPTS = false;
const MERGE_COMMIT_MESSAGE = '🔃 Daily sync: main -> l10n';

/**
 * Logs the command to be executed first, and spawns a shell then executes the
 * command. Returns the stdout of the executed command.
 *
 * @throws Will throw an error if executed command fails.
 */
async function logAndExec(
  executable /*: string */,
  ...args /*: string[] */
) /*: Promise<ExecFilePromiseResult> */ {
  console.log('[exec]', executable, args.join(' '));
  const result = await execFile(executable, args);

  if (result.stdout.length) {
    console.log('stdout:\n' + result.stdout.toString());
  }

  if (result.stderr.length) {
    console.log('stderr:\n' + result.stderr.toString());
  }

  return result;
}

/**
 * Logs the command to be executed first, and executes a series of shell commands
 * and pipes the stdout of them to the next one. In the end, returns the stdout
 * of the last piped command.
 *
 * @throws Will throw an error if one of the executed commands fails.
 */
function logAndPipeExec(...commands /*: string[][] */) /*: string */ {
  console.log(
    '[exec]',
    commands.map((command) => command.join(' ')).join(' | ')
  );
  let prevOutput = '';
  for (const command of commands) {
    const [executable, ...args] = command;
    prevOutput = cp
      .execFileSync(executable, args, { input: prevOutput })
      .toString();
  }

  const output = prevOutput.toString();
  if (output.length) {
    console.log('stdout:\n' + output.toString());
  }
  return output;
}

/**
 * Pause with a message and wait for the enter as a confirmation.
 * The prompt will not be displayed if the `-y` argument is given to the script.
 * This is mainly used by the CircleCI automation.
 */
async function pauseWithMessageIfNecessary(
  message /*: string */ = ''
) /*: Promise<void> */ {
  if (SKIP_PROMPTS) {
    return;
  }

  if (message.length > 0) {
    message += '\n';
  }
  message += 'Press ENTER when youʼre ready...';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await promisify(rl.question).call(rl, message);
  rl.close();
}

/**
 * Check if Git workspace is clean.
 *
 * @throws Will throw an error if workspace is not clean.
 */
async function checkIfWorkspaceClean() /*: Promise<void> */ {
  console.log('>>> Checking if the workspace is clean for the operations.');
  // git status --porcelain --ignore-submodules -unormal
  const statusResult = await logAndExec(
    'git',
    'status',
    '--porcelain',
    '--ignore-submodules',
    '-unormal'
  );

  if (statusResult.stdout.length || statusResult.stderr.length) {
    throw new Error(
      'Your workspace is not clean. Please commit or stash your changes.'
    );
  }

  console.log('Workspace is clean.');
}

/**
 * Finds the Git upstream remote and returns it.
 *
 * @throws Will throw an error if it can't find an upstream remote.
 */
async function findUpstream() /*: Promise<string> */ {
  console.log('>>> Finding the upstream remote.');
  try {
    const gitRemoteResult = await logAndExec('git', 'remote', '-v');

    if (gitRemoteResult.stderr.length) {
      throw new Error(`'git remote' failed to run.`);
    }

    const gitRemoteOutput = gitRemoteResult.stdout.toString();
    const remotes = gitRemoteOutput.split('\n');
    const upstreamLine = remotes.find((line) =>
      // Change this regexp to make it work with your fork for debugging purpose.
      /devtools-html\/perf.html|firefox-devtools\/profiler/.test(line)
    );

    if (upstreamLine === undefined) {
      throw new Error(`'upstreamLine' is undefined.`);
    }

    const upstream = upstreamLine.split('\t')[0];
    return upstream;
  } catch (error) {
    console.error(error);
    throw new Error(
      "Couldn't find the upstream remote. Is it well configured?\n" +
        "We're looking for either devtools-html/perf.html or firefox-devtools/profiler."
    );
  }
}

/**
 * Compares the `compareBranch` with `baseBranch` and checks the changed files.
 * Fails if the `compareBranch` has changes from the files that doesn't match
 * the `allowedRegexp`.
 *
 * @throws Will throw an error if `compareBranch` has changes from the files
 * that doesn't match the `allowedRegexp`.
 */
async function checkAllowedPaths(
  { upstream, compareBranch, baseBranch, allowedRegexp } /*:
  {|
    upstream: string,
    compareBranch: string,
    baseBranch: string ,
    allowedRegexp: RegExp
  |}
  */
) {
  console.log(
    `>>> Checking if ${compareBranch} branch has changes from the files that are not allowed.`
  );

  // git rev-list --no-merges upstream/baseBranch..upstream/compareBranch | git diff-tree --stdin --no-commit-id --name-only -r
  const changedFilesResult = logAndPipeExec(
    [
      'git',
      'rev-list',
      '--no-merges',
      `${upstream}/${baseBranch}..${upstream}/${compareBranch}`,
    ],
    ['git', 'diff-tree', '--stdin', '--no-commit-id', '--name-only', '-r']
  );

  const changedFiles = changedFilesResult.split('\n');
  for (const file of changedFiles) {
    if (file.length > 0 && !allowedRegexp.test(file)) {
      throw new Error(
        `${compareBranch} branch includes changes from the files that are not ` +
          `allowed: ${file}`
      );
    }
  }
}

/**
 * This is a simple helper function that returns the friendly English versions
 * of how many times that occurs.
 *
 * It's a pretty simple hack and would be good to have a more sophisticated
 * (localized?) API function. But it's not really worth for a deployment only
 * script.
 */
function fewTimes(count /*: number */) /*: string */ {
  switch (count) {
    case 1:
      return 'once';
    case 2:
      return 'twice';
    default:
      return `${count} times`;
  }
}

/**
 * Tries to sync the l10n branch and retries for 3 times if it fails to sync.
 *
 * @throws Will throw an error if it fails to sync for more than 3 times.
 */
async function tryToSync(upstream /*: string */) /*: Promise<void> */ {
  console.log('>>> Syncing the l10n branch with main.');
  // RegExp for matching only the vendored locales.
  // It matches the files in `locales` directory but excludes `en-US` which is the
  // main locale we edit. For example:
  // ALLOWED: locales/it/app.ftl
  // DISALLOWED: locales/en-US/app.ftl
  // DISALLOWED: src/README.md
  // DISALLOWED: src/index.js
  const vendoredLocalesPath = /^locales[\\/](?!en-US[\\/]|README.md)/;

  // RegExp for matching anything but the vendored locales.
  // It matches the files that are not in the `locales` directory EXCEPT the
  // `locales/en-US/` directory which is the main locale we edit. For example:
  // ALLOWED: locales/en-US/app.ftl
  // ALLOWED: locales/README.md
  // ALLOWED: src/index.js
  // DISALLOWED: locales/it/app.ftl
  const nonVendoredLocalesPath =
    /^(?:locales[\\/](?:en-US[\\/]|README.md)|(?!locales[\\/]))/;

  // We have a total try count to re-try to sync a few more time if the previous
  // try fails. This can occur when someone else commits to l10n branch while we
  // are syncing. In that case, `git push` will fail and we'll pull the latest
  // changes and try again. Nevertheless, we should have a hard cap on the try
  // count for safety.
  const totalTryCount = 3;
  let error /*: Error | null */ = null;
  let tryCount = 0;

  // Try to sync and retry for `totalTryCount` times if it fails.
  do {
    try {
      if (tryCount > 0) {
        console.warn(
          'Syncing the l10n branch has failed.\n' +
            'This may be due to a new commit during this operation. Trying again.\n' +
            `Tried ${fewTimes(tryCount)} out of ${totalTryCount}.`
        );
      }

      console.log(`>>> Fetching upstream ${upstream}.`);
      await logAndExec('git', 'fetch', upstream);

      // First, check if the l10n branch contains only changes in `locales` directory.
      await checkAllowedPaths({
        upstream,
        compareBranch: 'l10n',
        baseBranch: 'main',
        allowedRegexp: vendoredLocalesPath,
      });

      // Second, check if the main branch contains changes except the translated locales.
      await checkAllowedPaths({
        upstream,
        compareBranch: 'main',
        baseBranch: 'l10n',
        allowedRegexp: nonVendoredLocalesPath,
      });

      console.log('>>> Merging main to l10n.');
      await logAndExec('git', 'checkout', `${upstream}/l10n`);

      const currentDate = DATE_FORMAT.format(new Date());
      await logAndExec(
        'git',
        'merge',
        `${upstream}/main`,
        '-m',
        `${MERGE_COMMIT_MESSAGE} (${currentDate})`,
        // Force the merge command to create a merge commit instead of a fast-forward.
        '--no-ff'
      );

      console.log(`>>> Pushing to ${upstream}'s l10n branch.`);
      await pauseWithMessageIfNecessary();
      await logAndExec('git', 'push', '--no-verify', upstream, 'HEAD:l10n');

      console.log('>>> Going back to your previous banch.');
      await logAndExec('git', 'checkout', '-');

      // Clear out the error after everything is done, in case this is a retry.
      error = null;
    } catch (e) {
      error = e;
    }
    tryCount++;
  } while (error !== null && tryCount < totalTryCount);

  if (error) {
    console.error(
      `Tried to sync the l10n branch ${fewTimes(totalTryCount)} but failed.`
    );
    throw error;
  }
}

/**
 * Main function to be executed in the global scope.
 *
 * @throws Will throw an error if any of the functions it calls throw.
 */
async function main() /*: Promise<void> */ {
  const args = process.argv.slice(2);

  if (args.includes('-y')) {
    SKIP_PROMPTS = true;
  }

  const upstream = await findUpstream();
  await checkIfWorkspaceClean();

  console.log(
    `This script will sync the branch 'l10n' on the remote '${upstream}' with the branch 'main'.`
  );
  await pauseWithMessageIfNecessary('Are you sure?');

  await tryToSync(upstream);

  console.log('>>> Done!');
}

main().catch((error /*: Error */) => {
  // Print the error to the console and exit if an error is caught.
  console.error(error);
  process.exitCode = 1;
});
