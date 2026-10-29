#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This script automates steps 1-4 of the production deployment workflow in
// docs-developer/deploying.md. Keep its behavior and prompts aligned with that
// document whenever the deployment process changes.

import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { createInterface } from 'readline/promises';
import { fileURLToPath } from 'url';

type RunOptions = {
  capture?: boolean;
  allowFailure?: boolean;
};

type DeploymentOptions = {
  dryRun: boolean;
};

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[] | null;
};

type CliVersionPlan = {
  defaultVersion: string;
  shouldPublishCurrentVersion: boolean;
};

type CliDeploymentPlan = {
  shouldPublishCli: boolean;
  version: string;
  plannedChange: string | null;
};

type L10nDeploymentPlan = {
  plannedChange: string | null;
  plannedLocalizers: string[];
};

type GitHubRepository = {
  owner: string;
  name: string;
};

type PullRequestReference = {
  number: number;
  url: string;
};

type PullRequestListItem = PullRequestReference & {
  headRepositoryOwner?: { login: string } | null;
};

type GitHubReview = {
  author?: { login?: string } | null;
  state: string;
  submittedAt: string;
  commit?: { oid: string } | null;
};

type PullRequestInfo = PullRequestReference & {
  state: string;
  reviewDecision: string;
  reviewRequests: { login: string }[];
  reviews: GitHubReview[];
  headRefOid: string;
  body: string;
  title: string;
};

type MergeOptions = {
  body?: string;
  expectedHeadOid?: string;
  subject?: string;
};

type CliPackage = {
  path: string;
  contents: { name: string; version: string };
};

type DeploymentRemotes = {
  upstream: string;
  fork: string;
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const repository = 'firefox-devtools/profiler';
const reviewers = ['canova', 'mstange', 'fatadel'];
const pollIntervalMs = 10_000;
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Run a command from the repository root.
 */
function run(
  command: string,
  args: string[],
  options: RunOptions & { allowFailure: true }
): string | null;
function run(command: string, args: string[], options?: RunOptions): string;
function run(
  command: string,
  args: string[],
  { capture = false, allowFailure = false }: RunOptions = {}
): string | null {
  const commandLine = [command, ...args].join(' ');
  console.log('[exec]', commandLine);
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
      `'${commandLine}' exited with status ${result.status}.${details}`
    );
  }

  return capture ? result.stdout.trim() : '';
}

/**
 * Parse the deployment command-line arguments.
 */
export function parseArguments(args: string[]): DeploymentOptions {
  const unknownArgument = args.find((argument) => argument !== '--dry-run');
  if (unknownArgument) {
    throw new Error(`Unknown argument '${unknownArgument}'.`);
  }

  return { dryRun: args.includes('--dry-run') };
}

/**
 * Run a command that changes GitHub or npm, or print it in dry-run mode.
 */
export function runRemoteMutation(
  dryRun: boolean,
  command: string,
  args: string[],
  { capture = false }: { capture?: boolean } = {}
): string | null {
  if (dryRun) {
    console.log('[dry-run] Would run:', [command, ...args].join(' '));
    return null;
  }

  return run(command, args, { capture });
}

/**
 * Log a deployment action.
 */
function logAction(action: string): void {
  console.log(`\n>>> ${action}`);
}

/**
 * Run a Git command.
 */
function git(...args: string[]): string {
  return run('git', args);
}

/**
 * Run a Git command and return its output.
 */
function gitOutput(...args: string[]): string {
  return run('git', args, { capture: true });
}

/**
 * Run a GitHub CLI command and return its output.
 */
function ghOutput(...args: string[]): string {
  return run('gh', [...args, '--repo', repository], { capture: true });
}

/**
 * Run a GitHub CLI command that changes the profiler repository.
 */
function ghMutation(dryRun: boolean, ...args: string[]): string | null {
  return runRemoteMutation(dryRun, 'gh', [...args, '--repo', repository]);
}

/**
 * Run a GitHub CLI command that changes the profiler repository and return its output.
 */
function ghMutationOutput(dryRun: boolean, ...args: string[]): string | null {
  return runRemoteMutation(dryRun, 'gh', [...args, '--repo', repository], {
    capture: true,
  });
}

/**
 * Ask the user for a value.
 */
async function ask(question: string, defaultValue = ''): Promise<string> {
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

/**
 * Ask the user to confirm an action.
 */
async function confirm(action: string): Promise<void> {
  const answer = await ask(`${action}\nType "y" to continue:`);
  if (answer.toLowerCase() !== 'y') {
    throw new Error('Stopped without performing that action.');
  }
}

/**
 * Wait for a duration.
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a date for a pull request title.
 */
function formatDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Parse a semantic version.
 */
function parseVersion(version: string): ParsedVersion | null {
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

/**
 * Return the next minor version.
 */
export function bumpMinorVersion(version: string): string {
  const parsed = parseVersion(version);

  if (!parsed) {
    throw new Error(`Cannot calculate a minor bump for '${version}'.`);
  }

  return `${parsed.major}.${parsed.minor + 1}.0`;
}

/**
 * Check whether a value is a semantic version.
 */
export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== null;
}

/**
 * Compare semantic-version prerelease identifiers.
 */
function comparePrerelease(
  left: string[] | null,
  right: string[] | null
): number {
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

/**
 * Check whether a semantic version is newer than another.
 */
export function isVersionGreater(
  currentVersion: string,
  nextVersion: string
): boolean {
  const current = parseVersion(currentVersion);
  const next = parseVersion(nextVersion);
  if (!current || !next) {
    return false;
  }

  const numericParts: Array<'major' | 'minor' | 'patch'> = [
    'major',
    'minor',
    'patch',
  ];
  for (const part of numericParts) {
    if (current[part] !== next[part]) {
      return next[part] > current[part];
    }
  }

  return comparePrerelease(next.prerelease, current.prerelease) > 0;
}

/**
 * Determine the default CLI version and whether it needs publication.
 */
export function getCliVersionPlan(
  mainVersion: string,
  productionVersion: string
): CliVersionPlan {
  if (!isValidVersion(mainVersion) || !isValidVersion(productionVersion)) {
    throw new Error('The main and production CLI versions must be valid.');
  }
  if (mainVersion === productionVersion) {
    return {
      defaultVersion: bumpMinorVersion(mainVersion),
      shouldPublishCurrentVersion: false,
    };
  }
  if (isVersionGreater(productionVersion, mainVersion)) {
    return {
      defaultVersion: mainVersion,
      shouldPublishCurrentVersion: true,
    };
  }
  throw new Error(
    `The main CLI version ${mainVersion} is older than production ${productionVersion}.`
  );
}

/**
 * Parse a GitHub repository remote URL.
 */
export function parseGitHubRepositoryUrl(url: string): GitHubRepository | null {
  const match = url
    .replace(/\/$/, '')
    .match(
      /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+)$/i
    );

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    name: match[2].replace(/\.git$/i, ''),
  };
}

/**
 * Find a remote by its GitHub repository and URL direction.
 */
export function findGitHubRemote(
  remoteList: string,
  expectedRepository: string,
  direction: 'fetch' | 'push'
): string | null {
  for (const line of remoteList.split('\n')) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match || match[3] !== direction) {
      continue;
    }

    const parsedUrl = parseGitHubRepositoryUrl(match[2]);
    if (
      parsedUrl &&
      `${parsedUrl.owner}/${parsedUrl.name}`.toLowerCase() ===
        expectedRepository.toLowerCase()
    ) {
      return match[1];
    }
  }

  return null;
}

/**
 * Collect locale names from changed locale paths.
 */
export function collectUpdatedLocales(changedFiles: string): string[] {
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

/**
 * Collect localizer credits from Co-authored-by trailers.
 */
export function collectLocalizerCredits(trailers: string): string[] {
  const credits = new Set<string>();

  for (const trailer of trailers.split('\n')) {
    const withoutEmail = trailer.replace(/\s*<[^>]+>\s*/g, ' ').trim();
    const match = withoutEmail.match(/^(.*?)\s+\(([^()]+)\)$/);

    if (match) {
      const name = match[1]
        .replace(/\s*\[[^\]]*\]\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      credits.add(`${match[2]}: ${name}`);
    }
  }

  return [...credits].sort((a, b) => a.localeCompare(b));
}

/**
 * Build the production pull request body.
 */
export function buildDeploymentBody(
  changes: string,
  localizers: string[]
): string {
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

/**
 * Include changes that dry-run mode simulates without creating commits.
 */
export function combineDeploymentChanges(
  committedChanges: string,
  plannedChanges: string[]
): string {
  return [committedChanges.trim(), ...plannedChanges]
    .filter(Boolean)
    .join('\n');
}

/**
 * Select reviewers for the authenticated user.
 */
export function reviewersFor(login: string): string[] {
  const normalizedLogin = login.toLowerCase();
  return reviewers.includes(normalizedLogin)
    ? reviewers.filter((reviewer) => reviewer !== normalizedLogin)
    : [...reviewers];
}

/**
 * Ensure the working copy is clean.
 */
function ensureCleanWorkingCopy(): void {
  logAction('Checking for a clean working copy.');
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

/**
 * Ensure the GitHub CLI is available and return the authenticated login.
 */
function ensureGhAvailableAndLoggedIn(): string {
  logAction('Checking GitHub CLI availability and authentication.');
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

/**
 * Discover the canonical and fork remotes.
 */
function discoverDeploymentRemotes(login: string): DeploymentRemotes {
  logAction('Finding the canonical and fork Git remotes.');
  const remoteList = gitOutput('remote', '-v');
  const upstream = findGitHubRemote(remoteList, repository, 'fetch');

  if (!upstream) {
    throw new Error(
      'Could not find a Git remote whose fetch URL points to firefox-devtools/profiler.'
    );
  }

  const fork = findGitHubRemote(remoteList, `${login}/profiler`, 'push');

  if (!fork) {
    throw new Error(
      `Could not find a Git remote whose push URL points to ${login}/profiler.`
    );
  }

  console.log(`Using '${upstream}' as the canonical Git remote.`);
  console.log(`Using '${fork}' as the fork Git remote.`);
  return { upstream, fork };
}

/**
 * Refresh the deployment branches and update the local main branch when live.
 */
function updateMain(upstream: string, dryRun: boolean): void {
  logAction(`Fetching deployment branches from '${upstream}'.`);
  git('fetch', upstream, 'main', 'l10n', 'production');
  if (dryRun) {
    console.log(
      '[dry-run] Leaving the current branch and working tree unchanged.'
    );
    return;
  }

  logAction(`Updating the local main branch from '${upstream}'.`);
  git('checkout', 'main');
  git('pull', '--ff-only', upstream, 'main');
}

/**
 * Find an open pull request by base and head.
 */
function getOpenPullRequest(
  base: string,
  head: string,
  headOwner: string | null = null
): PullRequestReference | null {
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
      'number,url,title,body,headRefOid,headRepositoryOwner'
    )
  ) as PullRequestListItem[];

  return (
    result.find(
      (pullRequest) =>
        headOwner === null ||
        pullRequest.headRepositoryOwner?.login.toLowerCase() ===
          headOwner.toLowerCase()
    ) ?? null
  );
}

/**
 * Read the current state of a pull request.
 */
function getPullRequest(number: number): PullRequestInfo {
  return JSON.parse(
    ghOutput(
      'pr',
      'view',
      String(number),
      '--json',
      'number,url,state,reviewDecision,reviewRequests,reviews,headRefOid,body,title'
    )
  ) as PullRequestInfo;
}

/**
 * Create a pull request reference from its URL.
 */
function pullRequestFromUrl(url: string): PullRequestReference {
  const number = Number(new URL(url).pathname.split('/').at(-1));
  if (!Number.isInteger(number)) {
    throw new Error(`Could not determine a pull request number from ${url}.`);
  }
  return { number, url };
}

/**
 * Create a pull request after confirmation, or print the action in dry-run mode.
 */
async function createPullRequest(
  {
    base,
    head,
    title,
    body,
  }: { base: string; head: string; title: string; body: string },
  dryRun: boolean
): Promise<PullRequestReference | null> {
  if (!dryRun) {
    await confirm(
      `Create pull request '${title}' from '${head}' into '${base}'?`
    );
  }
  const url = ghMutationOutput(
    dryRun,
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
  if (url === null) {
    return null;
  }
  console.log(`Created ${url}`);
  return pullRequestFromUrl(url);
}

/**
 * Print the GitHub actions that would follow creation of a pull request.
 */
function previewNewPullRequestCompletion(
  pullRequest: string,
  requestedReviewers: string[],
  method: 'merge' | 'squash'
): void {
  console.log(
    `[dry-run] Would request review from ${requestedReviewers.join(', ')} on ${pullRequest}.`
  );
  console.log(
    `[dry-run] Would wait for approval and required checks on ${pullRequest}.`
  );
  console.log(
    `[dry-run] Would merge ${pullRequest} using the ${method} method.`
  );
}

/**
 * Find each reviewer's latest non-comment review.
 */
function latestReviewByAuthor(
  reviewsForPullRequest: GitHubReview[]
): Map<string, GitHubReview> {
  const latest = new Map<string, GitHubReview>();
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

/**
 * Check whether a review approves the current pull request head.
 */
function isCurrentApproval(
  review: GitHubReview | undefined,
  headRefOid: string
): boolean {
  return review?.state === 'APPROVED' && review.commit?.oid === headRefOid;
}

/**
 * Check whether a requested reviewer approved the current head.
 */
function hasRequiredApproval(
  info: PullRequestInfo,
  requestedReviewers: string[]
): boolean {
  const latestReviews = latestReviewByAuthor(info.reviews);
  return (
    info.reviewDecision === 'APPROVED' &&
    requestedReviewers.some((reviewer) =>
      isCurrentApproval(latestReviews.get(reviewer), info.headRefOid)
    )
  );
}

/**
 * Request reviews that are not already assigned or complete.
 */
async function requestMissingReviewers(
  pullRequest: PullRequestReference,
  requestedReviewers: string[],
  dryRun: boolean
): Promise<void> {
  logAction(`Checking reviewers for PR #${pullRequest.number}.`);
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

  if (!dryRun) {
    await confirm(
      `Request review from ${missing.join(', ')} on PR #${pullRequest.number}?`
    );
  }
  ghMutation(
    dryRun,
    'pr',
    'edit',
    String(pullRequest.number),
    '--add-reviewer',
    missing.join(',')
  );
}

/**
 * Wait for an approval of the current pull request head.
 */
async function waitForApproval(
  pullRequest: PullRequestReference,
  requestedReviewers: string[]
): Promise<PullRequestInfo> {
  console.log(
    `Waiting for a current-head approval from ${requestedReviewers.join(', ')} on ${pullRequest.url}.`
  );
  let lastHead: string | null = null;

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

/**
 * Wait until approvals and checks apply to the same head.
 */
async function waitUntilReady(
  pullRequest: PullRequestReference,
  requestedReviewers: string[]
): Promise<PullRequestInfo> {
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

/**
 * Build the arguments for watching pull request checks.
 */
export function checkWaitArguments(
  pullRequestNumber: number,
  required: boolean
): string[] {
  const args = ['pr', 'checks', String(pullRequestNumber), '--watch'];

  if (required) {
    args.push('--fail-fast', '--required');
  }

  return args;
}

/**
 * Check whether GitHub has not reported pull request checks yet.
 */
export function checksHaveNotStarted(stderr: string): boolean {
  return /^no (?:required )?checks reported on /m.test(stderr);
}

/**
 * Run the GitHub check watcher while retaining its error message.
 */
function runCheckWatcher(args: string[]): {
  status: number | null;
  stderr: string;
} {
  const commandArgs = [...args, '--repo', repository];
  console.log('[exec]', ['gh', ...commandArgs].join(' '));
  const result = spawnSync('gh', commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['inherit', 'inherit', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  const stderr = result.stderr.trim();
  if (stderr) {
    console.error(stderr);
  }
  return { status: result.status, stderr };
}

/**
 * Wait for pull request checks to finish.
 */
async function waitForChecks(
  pullRequest: PullRequestReference,
  { required = true }: { required?: boolean } = {}
): Promise<PullRequestInfo> {
  console.log(
    `Waiting for ${required ? 'required ' : ''}checks on ${pullRequest.url}.`
  );

  const args = checkWaitArguments(pullRequest.number, required);
  for (;;) {
    const { status, stderr } = runCheckWatcher(args);
    if (status === 0) {
      break;
    }
    if (checksHaveNotStarted(stderr)) {
      console.log(
        `No checks are reported on PR #${pullRequest.number} yet. Waiting for them to start.`
      );
      await wait(pollIntervalMs);
      continue;
    }

    if (required) {
      throw new Error(
        `'gh ${args.join(' ')} --repo ${repository}' exited with status ${status}.`
      );
    }
    await confirm(
      `One or more non-required checks failed on PR #${pullRequest.number}. Continue anyway?`
    );
    break;
  }

  console.log(`Checks finished on PR #${pullRequest.number}.`);
  return getPullRequest(pullRequest.number);
}

/**
 * Merge a pull request and wait for completion, or print the action in dry-run mode.
 */
async function mergePullRequest(
  pullRequest: PullRequestReference,
  method: 'merge' | 'squash',
  { body, expectedHeadOid, subject }: MergeOptions = {},
  dryRun = false
): Promise<PullRequestInfo> {
  logAction(`Preparing to merge PR #${pullRequest.number}.`);
  const info = getPullRequest(pullRequest.number);
  if (expectedHeadOid && info.headRefOid !== expectedHeadOid) {
    throw new Error(
      `PR #${pullRequest.number} changed from ${expectedHeadOid} to ${info.headRefOid}.`
    );
  }
  if (!dryRun) {
    await confirm(
      `Merge PR #${pullRequest.number} using the ${method} method at ${info.headRefOid}?`
    );
  }
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

  ghMutation(dryRun, ...args);
  if (dryRun) {
    return info;
  }
  console.log(`Waiting for PR #${pullRequest.number} to be merged.`);

  for (;;) {
    const mergedInfo = getPullRequest(pullRequest.number);
    if (mergedInfo.headRefOid !== info.headRefOid) {
      throw new Error(
        `PR #${pullRequest.number} changed from ${info.headRefOid} to ${mergedInfo.headRefOid}.`
      );
    }
    if (mergedInfo.state === 'MERGED') {
      console.log(`PR #${pullRequest.number} was merged.`);
      return mergedInfo;
    }
    if (mergedInfo.state !== 'OPEN') {
      throw new Error(
        `PR #${pullRequest.number} was ${mergedInfo.state.toLowerCase()} without being merged.`
      );
    }
    await wait(pollIntervalMs);
  }
}

/**
 * Create, wait for approval, and merge the localization pull request when needed.
 */
async function handleL10nPullRequest(
  login: string,
  upstream: string,
  dryRun: boolean
): Promise<L10nDeploymentPlan> {
  logAction('Checking for localization updates.');
  const changedFiles = gitOutput(
    'diff',
    '--name-only',
    `${upstream}/main...${upstream}/l10n`
  );
  const locales = collectUpdatedLocales(changedFiles);

  if (locales.length === 0) {
    console.log('No updated locales were found. Skipping the l10n PR.');
    return { plannedChange: null, plannedLocalizers: [] };
  }

  const title = `🔃 Sync: l10n -> main (${formatDate()})`;
  const plannedLocalizers = dryRun
    ? collectLocalizerCredits(
        gitOutput(
          'log',
          `${upstream}/main..${upstream}/l10n`,
          '--grep',
          '^Pontoon',
          '--format=%(trailers:key=Co-authored-by,valueonly)'
        )
      )
    : [];
  const plan = {
    plannedChange: dryRun ? `[${login}] ${title}` : null,
    plannedLocalizers,
  };
  console.log(`Updated locales: ${locales.join(', ')}`);
  let pullRequest = getOpenPullRequest('main', 'l10n');

  if (pullRequest) {
    console.log(`Using existing l10n PR: ${pullRequest.url}`);
  } else {
    pullRequest = await createPullRequest(
      {
        base: 'main',
        head: 'l10n',
        title,
        body: `Updated locales: ${locales.join(', ')}.`,
      },
      dryRun
    );
  }

  const requestedReviewers = reviewersFor(login);
  if (pullRequest === null) {
    previewNewPullRequestCompletion(
      'the new localization PR',
      requestedReviewers,
      'merge'
    );
    return plan;
  }

  await requestMissingReviewers(pullRequest, requestedReviewers, dryRun);
  if (dryRun) {
    console.log(
      `[dry-run] Would wait for approval and required checks on PR #${pullRequest.number}.`
    );
    await mergePullRequest(pullRequest, 'merge', {}, true);
    return plan;
  }

  const readyInfo = await waitUntilReady(pullRequest, requestedReviewers);
  await mergePullRequest(pullRequest, 'merge', {
    expectedHeadOid: readyInfo.headRefOid,
  });
  logAction('Updating the local main branch after the localization merge.');
  git('pull', '--ff-only', upstream, 'main');
  return plan;
}

/**
 * Read the profiler-cli package manifest.
 */
function readCliPackage(): CliPackage {
  const path = join(repoRoot, 'profiler-cli', 'package.json');
  const contents = JSON.parse(
    readFileSync(path, 'utf8')
  ) as CliPackage['contents'];
  return { path, contents };
}

/**
 * Check whether a local branch exists.
 */
function localBranchExists(branch: string): boolean {
  return (
    run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      allowFailure: true,
    }) !== null
  );
}

/**
 * Check whether a remote-tracking branch exists.
 */
function remoteBranchExists(remote: string, branch: string): boolean {
  return (
    run(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`],
      { allowFailure: true }
    ) !== null
  );
}

/**
 * Read the profiler-cli version at a Git ref.
 */
function cliVersionAtRef(ref: string): string {
  const contents = JSON.parse(
    gitOutput('show', `${ref}:profiler-cli/package.json`)
  ) as CliPackage['contents'];
  return contents.version;
}

/**
 * Create or resume the profiler-cli version pull request.
 */
async function createVersionBumpPullRequest(
  version: string,
  forkOwner: string,
  forkRemote: string,
  dryRun: boolean
): Promise<PullRequestReference | null> {
  const branch = `bump-cli-${version}`;
  logAction(`Preparing the profiler-cli version PR for ${version}.`);
  let pullRequest = getOpenPullRequest('main', branch, forkOwner);

  if (pullRequest) {
    console.log(`Using existing CLI version PR: ${pullRequest.url}`);
    return pullRequest;
  }

  git('fetch', forkRemote);
  const hasLocalBranch = localBranchExists(branch);
  const hasRemoteBranch = remoteBranchExists(forkRemote, branch);

  if (dryRun && !hasLocalBranch && !hasRemoteBranch) {
    console.log(
      `[dry-run] Would create local branch '${branch}', update profiler-cli/package.json, and commit the version bump.`
    );
  } else if (hasLocalBranch) {
    console.log(`Using existing local branch '${branch}'.`);
    if (!dryRun) {
      git('checkout', branch);
    }
    if (cliVersionAtRef(branch) !== version) {
      throw new Error(
        `Local branch '${branch}' does not contain profiler-cli version ${version}.`
      );
    }

    if (
      hasRemoteBranch &&
      gitOutput('rev-parse', branch) !==
        gitOutput('rev-parse', `${forkRemote}/${branch}`)
    ) {
      throw new Error(
        `Local and remote '${branch}' branches point to different commits.`
      );
    }
  } else if (hasRemoteBranch) {
    console.log(`Using existing remote branch '${forkRemote}/${branch}'.`);
    if (cliVersionAtRef(`${forkRemote}/${branch}`) !== version) {
      throw new Error(
        `Remote branch '${branch}' does not contain profiler-cli version ${version}.`
      );
    }
  } else {
    console.log(`Creating local branch '${branch}'.`);
    git('checkout', '-b', branch, 'main');
    const { path, contents } = readCliPackage();
    contents.version = version;
    writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
    git('diff', '--', path);
    await confirm(`Commit the profiler-cli version bump to ${version}?`);
    git('add', path);
    git('commit', '-m', `Bump profiler-cli version to ${version}`);
  }

  if (!hasRemoteBranch) {
    if (!dryRun) {
      await confirm(`Push branch '${branch}' to '${forkRemote}'?`);
    }
    runRemoteMutation(dryRun, 'git', [
      'push',
      '--set-upstream',
      forkRemote,
      branch,
    ]);
  }

  pullRequest = await createPullRequest(
    {
      base: 'main',
      head: `${forkOwner}:${branch}`,
      title: `Bump profiler-cli version to ${version}`,
      body: '',
    },
    dryRun
  );
  return pullRequest;
}

/**
 * Select the profiler-cli version and merge its pull request when needed.
 */
async function handleVersionBumpPullRequest(
  login: string,
  upstream: string,
  forkRemote: string,
  dryRun: boolean
): Promise<CliDeploymentPlan> {
  logAction('Checking the profiler-cli version for this deployment.');
  const mainVersion = cliVersionAtRef(`${upstream}/main`);
  const productionVersion = cliVersionAtRef(`${upstream}/production`);
  const { defaultVersion, shouldPublishCurrentVersion } = getCliVersionPlan(
    mainVersion,
    productionVersion
  );
  const version = await ask(
    `Profiler CLI version (main ${mainVersion}, production ${productionVersion}):`,
    defaultVersion
  );

  if (!isValidVersion(version)) {
    throw new Error(`'${version}' is not a valid semantic version.`);
  }
  if (version === mainVersion) {
    console.log(`Keeping the existing profiler-cli version ${version}.`);
    return {
      shouldPublishCli: shouldPublishCurrentVersion,
      version,
      plannedChange: null,
    };
  }
  if (!isVersionGreater(mainVersion, version)) {
    throw new Error(
      `Profiler CLI version ${version} must be newer than ${mainVersion}.`
    );
  }

  const pullRequest = await createVersionBumpPullRequest(
    version,
    login,
    forkRemote,
    dryRun
  );
  const requestedReviewers = reviewersFor(login);
  const plan = {
    shouldPublishCli: true,
    version,
    plannedChange: dryRun
      ? `[${login}] Bump profiler-cli version to ${version}`
      : null,
  };
  if (pullRequest === null) {
    previewNewPullRequestCompletion(
      'the new profiler-cli version PR',
      requestedReviewers,
      'squash'
    );
    return plan;
  }

  await requestMissingReviewers(pullRequest, requestedReviewers, dryRun);
  if (dryRun) {
    console.log(
      `[dry-run] Would wait for approval and required checks on PR #${pullRequest.number}.`
    );
    await mergePullRequest(pullRequest, 'squash', {}, true);
    return plan;
  }

  const readyInfo = await waitUntilReady(pullRequest, requestedReviewers);
  await mergePullRequest(pullRequest, 'squash', {
    expectedHeadOid: readyInfo.headRefOid,
  });
  logAction('Updating the local main branch after the profiler-cli merge.');
  git('checkout', 'main');
  git('pull', '--ff-only', upstream, 'main');
  return plan;
}

/**
 * Run an action with a temporary file and remove it afterwards.
 */
function withTemporaryFile<T>(
  prefix: string,
  filename: string,
  contents: string,
  action: (path: string) => T
): T {
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

/**
 * Open the deployment pull request body in the configured Git editor.
 */
function editDeploymentBody(initialBody: string): string {
  return withTemporaryFile(
    'profiler-deploy-',
    'pull-request-body.md',
    initialBody,
    (path) => {
      const command = `${gitOutput('var', 'GIT_EDITOR')} "${path.replaceAll('"', '\\"')}"`;
      console.log('[exec]', command);
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

/**
 * Create or update and merge the production deployment pull request.
 */
async function handleDeploymentPullRequest(
  upstream: string,
  dryRun: boolean,
  plannedChanges: string[],
  plannedLocalizers: string[]
): Promise<string> {
  logAction('Preparing the production deployment PR.');
  updateMain(upstream, dryRun);
  const range = `${upstream}/production..${upstream}/main`;
  const changes = combineDeploymentChanges(
    gitOutput(
      'log',
      range,
      '--first-parent',
      '--oneline',
      '--no-decorate',
      '--format=format:[%an] %s',
      '--reverse'
    ),
    plannedChanges
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
  const localizers = [
    ...new Set([
      ...collectLocalizerCredits(localizerTrailers),
      ...plannedLocalizers,
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const generatedBody = buildDeploymentBody(changes, localizers);
  console.log('\nOpening the generated deployment PR body in your editor.');
  const body = editDeploymentBody(generatedBody);
  const title = `Deploy ${formatDate()}`;
  let pullRequest = getOpenPullRequest('production', 'main');

  if (pullRequest) {
    console.log(`An open deployment PR already exists: ${pullRequest.url}`);
    if (!dryRun) {
      await confirm(`Replace the title and body of PR #${pullRequest.number}?`);
    }
    const pullRequestNumber = pullRequest.number;
    withTemporaryFile(
      'profiler-deploy-body-',
      'pull-request-body.md',
      body,
      (path) => {
        ghMutation(
          dryRun,
          'pr',
          'edit',
          String(pullRequestNumber),
          '--title',
          title,
          '--body-file',
          path
        );
      }
    );
    if (!dryRun) {
      pullRequest = getPullRequest(pullRequestNumber);
    }
  } else {
    pullRequest = await createPullRequest(
      {
        base: 'production',
        head: 'main',
        title,
        body,
      },
      dryRun
    );
  }

  if (pullRequest === null) {
    console.log('[dry-run] Would wait for checks on the new production PR.');
    console.log(
      '[dry-run] Would merge the new production PR using the merge method and its body as the commit message.'
    );
    return gitOutput('rev-parse', `${upstream}/main`);
  }

  const originalHead = getPullRequest(pullRequest.number).headRefOid;
  if (dryRun) {
    console.log(
      `[dry-run] Would wait for checks on PR #${pullRequest.number}.`
    );
    await mergePullRequest(
      pullRequest,
      'merge',
      {
        subject: `${title} (#${pullRequest.number})`,
        body,
        expectedHeadOid: originalHead,
      },
      true
    );
    return originalHead;
  }

  const finalInfo = await waitForChecks(pullRequest, { required: false });
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

/**
 * Verify the deployed commit and publish profiler-cli when needed.
 */
async function finishDeployment(
  deployedMainCommit: string,
  shouldPublishCli: boolean,
  cliVersion: string,
  upstream: string,
  dryRun: boolean
): Promise<void> {
  logAction('Verifying the production deployment before publishing.');
  git('fetch', upstream, 'main');
  const currentMainCommit = gitOutput('rev-parse', `${upstream}/main`);
  if (currentMainCommit !== deployedMainCommit) {
    throw new Error(
      `main moved to ${currentMainCommit} after the deployment candidate ${deployedMainCommit} was selected. ` +
        'Refusing to finish a deployment from a different commit.'
    );
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would check out main and pull the merged deployment changes from '${upstream}'.`
    );
    console.log(
      `[dry-run] Would ask for confirmation that the Netlify production deployment for ${deployedMainCommit} is live.`
    );
  } else {
    git('checkout', 'main');
    git('pull', '--ff-only', upstream, 'main');
    await confirm(
      `Confirm that the Netlify production deployment for ${deployedMainCommit} is live?`
    );
  }

  if (!shouldPublishCli) {
    console.log(
      'The profiler-cli version is unchanged from production. Skipping npm publication.'
    );
    return;
  }

  const { contents } = readCliPackage();
  if (dryRun) {
    console.log(
      `[dry-run] Would publish ${contents.name}@${cliVersion} to npm.`
    );
  } else {
    if (contents.version !== cliVersion) {
      throw new Error(
        `Expected profiler-cli version ${cliVersion}, found ${contents.version}.`
      );
    }
    await confirm(`Publish ${contents.name}@${contents.version} to npm?`);
  }
  runRemoteMutation(dryRun, 'yarn', ['publish-cli']);
}

/**
 * Run the production deployment workflow.
 */
export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const { dryRun } = parseArguments(args);
  console.log(
    `Firefox Profiler production deployment${dryRun ? ' (dry run)' : ''}`
  );
  await confirm(
    dryRun
      ? 'Start the dry run? This script will fetch recent changes, but it will not change the working tree, GitHub, or npm.'
      : 'Start the deployment? This script will switch branches, pull recent changes, and may create a local version-bump branch. Commits and remote changes will still require separate confirmation.'
  );
  const login = ensureGhAvailableAndLoggedIn();
  console.log(`Authenticated to GitHub as ${login}.`);
  ensureCleanWorkingCopy();
  const { upstream, fork: forkRemote } = discoverDeploymentRemotes(login);
  updateMain(upstream, dryRun);
  const l10nPlan = await handleL10nPullRequest(login, upstream, dryRun);
  const cliPlan = await handleVersionBumpPullRequest(
    login,
    upstream,
    forkRemote,
    dryRun
  );
  const plannedChanges = [];
  if (l10nPlan.plannedChange) {
    plannedChanges.push(l10nPlan.plannedChange);
  }
  if (cliPlan.plannedChange) {
    plannedChanges.push(cliPlan.plannedChange);
  }
  const deployedMainCommit = await handleDeploymentPullRequest(
    upstream,
    dryRun,
    plannedChanges,
    l10nPlan.plannedLocalizers
  );
  await finishDeployment(
    deployedMainCommit,
    cliPlan.shouldPublishCli,
    cliPlan.version,
    upstream,
    dryRun
  );
  if (dryRun) {
    console.log(
      'Dry run completed. No GitHub or npm changes, local branches, commits, or working-tree changes were created.'
    );
    return;
  }
  console.log(
    cliPlan.shouldPublishCli
      ? 'Deployment and profiler-cli publication completed.'
      : 'Deployment completed without profiler-cli publication.'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nDeployment stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
