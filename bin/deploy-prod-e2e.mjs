#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { createInterface } from 'readline/promises';
import { fileURLToPath } from 'url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const repository = 'firefox-devtools/profiler';
const upstream = 'upstream';
const reviewers = ['canova', 'mstange', 'fatadel'];
const pollIntervalMs = 30_000;
const successfulCheckConclusions = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const failedCheckConclusions = new Set([
  'ACTION_REQUIRED',
  'CANCELLED',
  'FAILURE',
  'STALE',
  'STARTUP_FAILURE',
  'TIMED_OUT',
]);
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });

  if (result.error) {
    if (allowFailure) {
      return null;
    }
    throw result.error;
  }

  if (result.status !== 0) {
    if (allowFailure) {
      return null;
    }

    const details = capture ? `\n${result.stderr.trim()}` : '';
    throw new Error(
      `'${command} ${args.join(' ')}' exited with status ${result.status}.${details}`
    );
  }

  return capture ? result.stdout.trim() : '';
}

function git(...args) {
  return run('git', args);
}

function gitOutput(...args) {
  return run('git', args, { capture: true });
}

function gh(...args) {
  return run('gh', [...args, '--repo', repository]);
}

function ghOutput(...args) {
  return run('gh', [...args, '--repo', repository], { capture: true });
}

async function ask(question, defaultValue = '') {
  const prompt = defaultValue
    ? `${question} [${defaultValue}] `
    : `${question} `;
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await readline.question(prompt)).trim();
    return answer || defaultValue;
  } finally {
    readline.close();
  }
}

async function confirm(action) {
  const answer = await ask(`${action}\nType "yes" to continue:`);
  if (answer.toLowerCase() !== 'yes') {
    throw new Error('Stopped without performing that action.');
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function parseVersion(version) {
  const match = version.match(versionPattern);

  if (!match) {
    return null;
  }

  const prerelease = match[4]?.split('.') ?? null;
  if (
    prerelease?.some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith('0')
    )
  ) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

export function bumpMinorVersion(version) {
  const parsed = parseVersion(version);

  if (!parsed) {
    throw new Error(`Cannot calculate a minor bump for '${version}'.`);
  }

  return `${parsed.major}.${parsed.minor + 1}.0`;
}

export function isValidVersion(version) {
  return parseVersion(version) !== null;
}

function comparePrerelease(left, right) {
  if (left === null || right === null) {
    if (left === right) {
      return 0;
    }
    return left === null ? 1 : -1;
  }

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      if (leftIdentifier === rightIdentifier) {
        return 0;
      }
      return leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) {
      continue;
    }

    const leftIsNumeric = /^\d+$/.test(leftIdentifier);
    const rightIsNumeric = /^\d+$/.test(rightIdentifier);
    if (leftIsNumeric && rightIsNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }
    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    }
    return leftIdentifier.localeCompare(rightIdentifier);
  }

  return 0;
}

export function isVersionGreater(currentVersion, nextVersion) {
  const current = parseVersion(currentVersion);
  const next = parseVersion(nextVersion);
  if (!current || !next) {
    return false;
  }

  for (const part of ['major', 'minor', 'patch']) {
    if (current[part] !== next[part]) {
      return next[part] > current[part];
    }
  }

  return comparePrerelease(next.prerelease, current.prerelease) > 0;
}

export function collectUpdatedLocales(changedFiles) {
  return [
    ...new Set(
      changedFiles
        .split('\n')
        .filter(Boolean)
        .map((path) => path.split('/')[1])
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function collectLocalizerCredits(trailers) {
  const credits = new Set();

  for (const trailer of trailers.split('\n')) {
    const withoutEmail = trailer.replace(/\s*<[^>]+>\s*/g, ' ').trim();
    const match = withoutEmail.match(/^(.*?)\s+\(([^()]+)\)$/);

    if (match) {
      credits.add(`${match[2]}: ${match[1]}`);
    }
  }

  return [...credits].sort((a, b) => a.localeCompare(b));
}

export function buildDeploymentBody(changes, localizers) {
  return [
    'Changes:',
    '',
    changes.trim(),
    '',
    'And special thanks to our localizers:',
    '',
    localizers.join('\n'),
    '',
  ].join('\n');
}

export function reviewersFor(login) {
  const normalizedLogin = login.toLowerCase();
  return reviewers.includes(normalizedLogin)
    ? reviewers.filter((reviewer) => reviewer !== normalizedLogin)
    : [...reviewers];
}

function ensureCleanWorkingCopy() {
  const status = gitOutput(
    'status',
    '--porcelain',
    '--ignore-submodules',
    '-unormal'
  );

  if (status) {
    throw new Error(
      `The working copy must be clean before deployment:\n\n${status}`
    );
  }
}

function ensureGhAvailableAndLoggedIn() {
  if (
    run('gh', ['--version'], { capture: true, allowFailure: true }) === null
  ) {
    throw new Error("The GitHub CLI 'gh' is not installed or is not on PATH.");
  }

  if (
    run('gh', ['auth', 'status', '--hostname', 'github.com'], {
      allowFailure: true,
    }) === null
  ) {
    throw new Error("Run 'gh auth login' before starting a deployment.");
  }

  return run('gh', ['api', 'user', '--jq', '.login'], { capture: true });
}

function ensureUpstreamRemote() {
  const url = run('git', ['remote', 'get-url', upstream], {
    capture: true,
    allowFailure: true,
  });

  if (!url || !/firefox-devtools\/profiler(?:\.git)?$/.test(url)) {
    throw new Error(
      "The 'upstream' remote must point to firefox-devtools/profiler."
    );
  }
}

function checkoutAndUpdateMain() {
  git('checkout', 'main');
  git('fetch', upstream);
  git('pull', '--ff-only', upstream, 'main');
}

function getOpenPullRequest(base, head) {
  const result = JSON.parse(
    ghOutput(
      'pr',
      'list',
      '--state',
      'open',
      '--base',
      base,
      '--head',
      head,
      '--json',
      'number,url,title,body,headRefOid'
    )
  );

  return result[0] ?? null;
}

function getPullRequest(number) {
  return JSON.parse(
    ghOutput(
      'pr',
      'view',
      String(number),
      '--json',
      'number,url,state,reviewDecision,reviewRequests,reviews,headRefOid,statusCheckRollup,body,title'
    )
  );
}

function pullRequestFromUrl(url) {
  const number = Number(new URL(url).pathname.split('/').at(-1));
  if (!Number.isInteger(number)) {
    throw new Error(`Could not determine a pull request number from ${url}.`);
  }
  return { number, url };
}

async function createPullRequest({ base, head, title, body }) {
  await confirm(
    `Create pull request '${title}' from '${head}' into '${base}'?`
  );
  const url = ghOutput(
    'pr',
    'create',
    '--base',
    base,
    '--head',
    head,
    '--title',
    title,
    '--body',
    body
  );
  console.log(`Created ${url}`);
  return pullRequestFromUrl(url);
}

function latestReviewByAuthor(reviewsForPullRequest) {
  const latest = new Map();
  const sortedReviews = [...reviewsForPullRequest].sort((a, b) =>
    a.submittedAt.localeCompare(b.submittedAt)
  );

  for (const review of sortedReviews) {
    if (review.author?.login && review.state !== 'COMMENTED') {
      latest.set(review.author.login.toLowerCase(), review);
    }
  }

  return latest;
}

function isCurrentApproval(review, headRefOid) {
  return review?.state === 'APPROVED' && review.commit?.oid === headRefOid;
}

function hasRequiredApproval(info, requestedReviewers) {
  const latestReviews = latestReviewByAuthor(info.reviews);
  return (
    info.reviewDecision === 'APPROVED' &&
    requestedReviewers.some((reviewer) =>
      isCurrentApproval(latestReviews.get(reviewer), info.headRefOid)
    )
  );
}

async function requestMissingReviewers(pullRequest, requestedReviewers) {
  const info = getPullRequest(pullRequest.number);
  const currentRequests = new Set(
    info.reviewRequests.map((request) => request.login.toLowerCase())
  );
  const latestReviews = latestReviewByAuthor(info.reviews);
  const missing = requestedReviewers.filter((reviewer) => {
    const latestReview = latestReviews.get(reviewer);
    return (
      !currentRequests.has(reviewer) &&
      !isCurrentApproval(latestReview, info.headRefOid)
    );
  });

  if (missing.length === 0) {
    console.log('The requested reviewers are already assigned or approved.');
    return;
  }

  await confirm(
    `Request review from ${missing.join(', ')} on PR #${pullRequest.number}?`
  );
  gh(
    'pr',
    'edit',
    String(pullRequest.number),
    '--add-reviewer',
    missing.join(',')
  );
}

async function waitForApproval(pullRequest, requestedReviewers) {
  console.log(
    `Waiting for a current-head approval from ${requestedReviewers.join(', ')} on ${pullRequest.url}.`
  );
  let lastHead = null;

  for (;;) {
    const info = getPullRequest(pullRequest.number);

    if (info.state !== 'OPEN') {
      throw new Error(`PR #${pullRequest.number} is no longer open.`);
    }

    if (info.headRefOid !== lastHead) {
      console.log(`Current PR head: ${info.headRefOid}`);
      lastHead = info.headRefOid;
    }

    if (hasRequiredApproval(info, requestedReviewers)) {
      console.log(`PR #${pullRequest.number} has the required approval.`);
      return info;
    }

    await wait(pollIntervalMs);
  }
}

async function waitUntilReady(pullRequest, requestedReviewers) {
  for (;;) {
    const approvedInfo = await waitForApproval(pullRequest, requestedReviewers);
    const checkedInfo = await waitForChecks(pullRequest);
    const currentInfo = getPullRequest(pullRequest.number);

    if (
      approvedInfo.headRefOid === checkedInfo.headRefOid &&
      checkedInfo.headRefOid === currentInfo.headRefOid &&
      hasRequiredApproval(currentInfo, requestedReviewers)
    ) {
      return currentInfo;
    }

    console.log(
      `PR #${pullRequest.number} changed while waiting. Checking its new head again.`
    );
  }
}

function checkName(check) {
  return check.name ?? check.context ?? 'unknown check';
}

export function classifyChecks(checks) {
  const failed = [];
  const pending = [];

  for (const check of checks) {
    const name = checkName(check);
    const conclusion = check.conclusion?.toUpperCase();
    const state = check.state?.toUpperCase();

    if (
      failedCheckConclusions.has(conclusion) ||
      state === 'ERROR' ||
      state === 'FAILURE'
    ) {
      failed.push(name);
    } else if (
      (conclusion && !successfulCheckConclusions.has(conclusion)) ||
      (!conclusion && state !== 'SUCCESS')
    ) {
      pending.push(name);
    }
  }

  return { failed, pending };
}

async function waitForChecks(pullRequest) {
  console.log(`Waiting for all checks on ${pullRequest.url}.`);
  let successfulSet = null;
  let lastSummary = null;

  for (;;) {
    const info = getPullRequest(pullRequest.number);
    const checks = info.statusCheckRollup ?? [];
    const { failed, pending } = classifyChecks(checks);

    if (failed.length > 0) {
      throw new Error(
        `Checks failed on PR #${pullRequest.number}: ${failed.join(', ')}`
      );
    }

    const summary = `${checks.length} checks, ${pending.length} pending`;
    if (summary !== lastSummary) {
      console.log(summary);
      lastSummary = summary;
    }

    if (checks.length > 0 && pending.length === 0) {
      const currentSet = checks.map(checkName).sort().join('\n');
      if (currentSet === successfulSet) {
        console.log(`All checks passed on PR #${pullRequest.number}.`);
        return info;
      }
      successfulSet = currentSet;
    } else {
      successfulSet = null;
    }

    await wait(pollIntervalMs);
  }
}

async function mergePullRequest(
  pullRequest,
  method,
  { body, expectedHeadOid, subject } = {}
) {
  const info = getPullRequest(pullRequest.number);
  if (expectedHeadOid && info.headRefOid !== expectedHeadOid) {
    throw new Error(
      `PR #${pullRequest.number} changed from ${expectedHeadOid} to ${info.headRefOid}.`
    );
  }
  await confirm(
    `Merge PR #${pullRequest.number} using the ${method} method at ${info.headRefOid}?`
  );
  const args = [
    'pr',
    'merge',
    String(pullRequest.number),
    `--${method}`,
    '--match-head-commit',
    info.headRefOid,
  ];

  if (subject) {
    args.push('--subject', subject);
  }
  if (body !== undefined) {
    args.push('--body', body);
  }

  gh(...args);
}

async function handleL10nPullRequest(login) {
  git('fetch', upstream);
  const changedFiles = gitOutput(
    'diff',
    '--name-only',
    `${upstream}/main...${upstream}/l10n`
  );
  const locales = collectUpdatedLocales(changedFiles);

  if (locales.length === 0) {
    console.log('No updated locales were found. Skipping the l10n PR.');
    return;
  }

  console.log(`Updated locales: ${locales.join(', ')}`);
  let pullRequest = getOpenPullRequest('main', 'l10n');

  if (pullRequest) {
    console.log(`Using existing l10n PR: ${pullRequest.url}`);
  } else {
    pullRequest = await createPullRequest({
      base: 'main',
      head: 'l10n',
      title: `🔃 Sync: l10n -> main (${formatDate()})`,
      body: `Updated locales: ${locales.join(', ')}.`,
    });
  }

  const requestedReviewers = reviewersFor(login);
  await requestMissingReviewers(pullRequest, requestedReviewers);
  const readyInfo = await waitUntilReady(pullRequest, requestedReviewers);
  await mergePullRequest(pullRequest, 'merge', {
    expectedHeadOid: readyInfo.headRefOid,
  });
  git('pull', '--ff-only', upstream, 'main');
}

function readCliPackage() {
  const path = join(repoRoot, 'profiler-cli', 'package.json');
  return { path, contents: JSON.parse(readFileSync(path, 'utf8')) };
}

function localBranchExists(branch) {
  return (
    run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      allowFailure: true,
    }) !== null
  );
}

function remoteBranchExists(branch) {
  return (
    run(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/remotes/${upstream}/${branch}`],
      { allowFailure: true }
    ) !== null
  );
}

function cliVersionAtRef(ref) {
  return JSON.parse(gitOutput('show', `${ref}:profiler-cli/package.json`))
    .version;
}

async function createVersionBumpPullRequest(version) {
  const branch = `bump-cli-${version}`;
  let pullRequest = getOpenPullRequest('main', branch);

  if (pullRequest) {
    console.log(`Using existing CLI version PR: ${pullRequest.url}`);
    return pullRequest;
  }

  const hasLocalBranch = localBranchExists(branch);
  const hasRemoteBranch = remoteBranchExists(branch);

  if (hasLocalBranch) {
    git('checkout', branch);
    const { contents } = readCliPackage();
    if (contents.version !== version) {
      throw new Error(
        `Local branch '${branch}' does not contain profiler-cli version ${version}.`
      );
    }

    if (
      hasRemoteBranch &&
      gitOutput('rev-parse', branch) !==
        gitOutput('rev-parse', `${upstream}/${branch}`)
    ) {
      throw new Error(
        `Local and remote '${branch}' branches point to different commits.`
      );
    }
  } else if (hasRemoteBranch) {
    if (cliVersionAtRef(`${upstream}/${branch}`) !== version) {
      throw new Error(
        `Remote branch '${branch}' does not contain profiler-cli version ${version}.`
      );
    }
  } else {
    git('checkout', '-b', branch, 'main');
    const { path, contents } = readCliPackage();
    contents.version = version;
    writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
    git('diff', '--', path);
    await confirm(`Commit the profiler-cli version bump to ${version}?`);
    git('add', path);
    git(
      'commit',
      '-m',
      `Bump profiler-cli version to ${version}`,
      '-m',
      'Record the version that will be published with the next production\n' +
        'deployment.'
    );
  }

  if (!hasRemoteBranch) {
    await confirm(`Push branch '${branch}' to '${upstream}'?`);
    git('push', '--set-upstream', upstream, branch);
  }

  pullRequest = await createPullRequest({
    base: 'main',
    head: branch,
    title: `Bump profiler-cli version to ${version}`,
    body: '',
  });
  return pullRequest;
}

async function handleVersionBumpPullRequest(login) {
  const currentVersion = readCliPackage().contents.version;
  const defaultVersion = bumpMinorVersion(currentVersion);
  const version = await ask(
    `Profiler CLI version (currently ${currentVersion}):`,
    defaultVersion
  );

  if (!isValidVersion(version)) {
    throw new Error(`'${version}' is not a valid semantic version.`);
  }
  if (version === currentVersion) {
    console.log(`Keeping the existing profiler-cli version ${version}.`);
    return;
  }
  if (!isVersionGreater(currentVersion, version)) {
    throw new Error(
      `Profiler CLI version ${version} must be newer than ${currentVersion}.`
    );
  }

  const pullRequest = await createVersionBumpPullRequest(version);
  const requestedReviewers = reviewersFor(login);
  await requestMissingReviewers(pullRequest, requestedReviewers);
  const readyInfo = await waitUntilReady(pullRequest, requestedReviewers);
  await mergePullRequest(pullRequest, 'squash', {
    expectedHeadOid: readyInfo.headRefOid,
  });
  git('checkout', 'main');
  git('pull', '--ff-only', upstream, 'main');
}

function editorCommand() {
  return (
    process.env.GIT_EDITOR ||
    run('git', ['config', '--get', 'core.editor'], {
      capture: true,
      allowFailure: true,
    }) ||
    process.env.VISUAL ||
    process.env.EDITOR ||
    'vi'
  );
}

function withTemporaryFile(prefix, filename, contents, action) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const path = join(directory, filename);
  writeFileSync(path, contents);

  try {
    return action(path);
  } finally {
    if (basename(directory).startsWith(prefix)) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function editDeploymentBody(initialBody) {
  return withTemporaryFile(
    'profiler-deploy-',
    'pull-request-body.md',
    initialBody,
    (path) => {
      const command = `${editorCommand()} "${path.replaceAll('"', '\\"')}"`;
      const result = spawnSync(command, {
        cwd: repoRoot,
        shell: true,
        stdio: 'inherit',
      });

      if (result.error || result.status !== 0) {
        throw (
          result.error ?? new Error(`The editor exited with ${result.status}.`)
        );
      }

      const body = readFileSync(path, 'utf8').trim();
      if (!body) {
        throw new Error('The deployment PR body cannot be empty.');
      }
      return `${body}\n`;
    }
  );
}

async function handleDeploymentPullRequest() {
  git('fetch', upstream);
  const range = `${upstream}/production..${upstream}/main`;
  const changes = gitOutput(
    'log',
    range,
    '--first-parent',
    '--oneline',
    '--no-decorate',
    '--format=format:[%an] %s',
    '--reverse'
  );

  if (!changes) {
    throw new Error('There are no changes to deploy to production.');
  }

  const localizerTrailers = gitOutput(
    'log',
    range,
    '--grep',
    '^Pontoon',
    '--format=%(trailers:key=Co-authored-by,valueonly)'
  );
  const localizers = collectLocalizerCredits(localizerTrailers);
  const generatedBody = buildDeploymentBody(changes, localizers);
  console.log('\nOpening the generated deployment PR body in your editor.');
  const body = editDeploymentBody(generatedBody);
  const title = `Deploy ${formatDate()}`;
  let pullRequest = getOpenPullRequest('production', 'main');

  if (pullRequest) {
    console.log(`An open deployment PR already exists: ${pullRequest.url}`);
    await confirm(`Replace the title and body of PR #${pullRequest.number}?`);
    withTemporaryFile(
      'profiler-deploy-body-',
      'pull-request-body.md',
      body,
      (path) => {
        gh(
          'pr',
          'edit',
          String(pullRequest.number),
          '--title',
          title,
          '--body-file',
          path
        );
      }
    );
    pullRequest = getPullRequest(pullRequest.number);
  } else {
    pullRequest = await createPullRequest({
      base: 'production',
      head: 'main',
      title,
      body,
    });
  }

  const originalHead = getPullRequest(pullRequest.number).headRefOid;
  const finalInfo = await waitForChecks(pullRequest);
  if (finalInfo.headRefOid !== originalHead) {
    throw new Error(
      `The deployment candidate changed from ${originalHead} to ${finalInfo.headRefOid}. ` +
        'Run the script again to regenerate and confirm the deployment notes.'
    );
  }

  await mergePullRequest(pullRequest, 'merge', {
    subject: `${title} (#${pullRequest.number})`,
    body,
    expectedHeadOid: originalHead,
  });
  return originalHead;
}

async function publishCli(deployedMainCommit) {
  git('fetch', upstream, 'main');
  const currentMainCommit = gitOutput('rev-parse', `${upstream}/main`);
  if (currentMainCommit !== deployedMainCommit) {
    throw new Error(
      `main moved to ${currentMainCommit} after the deployment candidate ${deployedMainCommit} was selected. ` +
        'Refusing to publish a CLI build from a different commit.'
    );
  }

  git('checkout', 'main');
  git('pull', '--ff-only', upstream, 'main');
  const { contents } = readCliPackage();
  await confirm(
    `Confirm that the Netlify production deployment for ${deployedMainCommit} is live?`
  );
  await confirm(`Publish ${contents.name}@${contents.version} to npm?`);
  run('yarn', ['publish-cli']);
}

export async function main() {
  console.log('Firefox Profiler production deployment');
  const login = ensureGhAvailableAndLoggedIn();
  console.log(`Authenticated to GitHub as ${login}.`);
  ensureCleanWorkingCopy();
  ensureUpstreamRemote();
  checkoutAndUpdateMain();
  await handleL10nPullRequest(login);
  await handleVersionBumpPullRequest(login);
  const deployedMainCommit = await handleDeploymentPullRequest();
  await publishCli(deployedMainCommit);
  console.log('Deployment and profiler-cli publication completed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nDeployment stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
