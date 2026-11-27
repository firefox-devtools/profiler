#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This script automates the production deployment and announcement workflow in
// docs-developer/deploying.md. Keep its behavior and prompts aligned with that
// document whenever the deployment process changes.

import type { spawnSync as nodeSpawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { basename, join, resolve } from 'path';
import { createInterface } from 'readline/promises';
import { fileURLToPath } from 'url';
import open from 'open';

const { sync: spawnSync } = createRequire(import.meta.url)('cross-spawn') as {
  sync: typeof nodeSpawnSync;
};

type RunOptions = {
  capture?: boolean;
  allowFailure?: boolean;
  cwd?: string;
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

type CliRelease = {
  version: string;
  tag: string;
  bumpCommit: string;
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

type AssociatedPullRequest = {
  user: { login: string } | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: { ref: string; repo: { full_name: string } };
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
  mergeCommit: { oid: string } | null;
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

type DeploymentResult = {
  commit: string;
  mergeCommit: string | null;
  body: string;
  date: string;
  url: string | null;
};

type FirefoxCheckout = {
  path: string;
  upstream: string;
};

class DeploymentCancelled extends Error {}

type TemporaryCheckout = {
  path: string;
  gitArgs: string[];
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const repository = 'firefox-devtools/profiler';
const toolchainsPath = 'taskcluster/kinds/fetch/toolchains.yml';
const bugFilingScript = '.agents/skills/bug-filing/file-bug.py';
const reviewers = ['canova', 'mstange', 'fatadel'];
const pollIntervalMs = 10_000;
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Run a command from the repository root or the specified checkout.
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
  { capture = false, allowFailure = false, cwd = repoRoot }: RunOptions = {}
): string | null {
  const commandLine = [command, ...args].join(' ');
  console.log(
    '[exec]',
    cwd === repoRoot ? commandLine : `(in ${cwd}) ${commandLine}`
  );
  const result = spawnSync(command, args, {
    cwd,
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
 * Run a command that changes a remote service, or print it in dry-run mode.
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
    throw new DeploymentCancelled('Stopped without performing that action.');
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
 * Collect deployment commits with their pull request authors, falling back to Git authors.
 */
export function collectDeploymentChanges(range: string): string {
  logAction(
    'Collecting deployment changes and resolving their pull request authors.'
  );
  const commits = gitOutput(
    'log',
    range,
    '--first-parent',
    '--format=format:%H%x00%an%x00%s',
    '--reverse'
  );
  return commits
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commit, gitAuthor, subject] = line.split('\0');
      const pages = JSON.parse(
        run(
          'gh',
          [
            'api',
            `repos/${repository}/commits/${commit}/pulls`,
            '--method',
            'GET',
            '--paginate',
            '--slurp',
          ],
          { capture: true }
        )
      ) as AssociatedPullRequest[][];
      const pullRequests = pages
        .flat()
        .filter(
          (pullRequest) =>
            pullRequest.merged_at &&
            pullRequest.base.ref === 'main' &&
            pullRequest.base.repo.full_name === repository
        );
      const pullRequest =
        pullRequests.find(
          ({ merge_commit_sha }) => merge_commit_sha === commit
        ) ?? (pullRequests.length === 1 ? pullRequests[0] : undefined);
      return `[${pullRequest?.user?.login ?? gitAuthor}] ${subject}`;
    })
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

  const fork =
    findGitHubRemote(remoteList, `${login}/profiler`, 'push') ??
    findGitHubRemote(remoteList, `${login}/perf.html`, 'push');

  if (!fork) {
    throw new Error(
      `Could not find a Git remote whose push URL points to ${login}/profiler or ${login}/perf.html.`
    );
  }

  console.log(`Using '${upstream}' as the canonical Git remote.`);
  console.log(`Using '${fork}' as the fork Git remote.`);
  return { upstream, fork };
}

/**
 * Refresh the remote deployment branches without changing the working copy.
 */
function fetchDeploymentBranches(upstream: string): void {
  logAction(`Fetching deployment branches from '${upstream}'.`);
  git('fetch', upstream, 'main', 'l10n', 'production');
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
      'number,url,state,reviewDecision,reviewRequests,reviews,headRefOid,mergeCommit,body,title'
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
  fetchDeploymentBranches(upstream);
  return plan;
}

/**
 * Read the profiler-cli package manifest.
 */
function readCliPackage(checkout: string): CliPackage {
  const path = join(checkout, 'profiler-cli', 'package.json');
  const contents = JSON.parse(
    readFileSync(path, 'utf8')
  ) as CliPackage['contents'];
  return { path, contents };
}

/**
 * Run an operation in a temporary clone of the requested revision.
 *
 * Retain failed operations' clones for inspection; cleanup cannot undo success.
 */
async function withTemporaryCheckout<T>(
  ref: string,
  action: (checkout: TemporaryCheckout) => Promise<T>
): Promise<T> {
  const commit = gitOutput(
    '-C',
    repoRoot,
    'rev-parse',
    '--verify',
    `${ref}^{commit}`
  );
  const configPath = gitOutput(
    '-C',
    repoRoot,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'config'
  );
  const hooksPath = gitOutput(
    '-C',
    repoRoot,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'hooks'
  );
  const path = mkdtempSync(join(tmpdir(), 'profiler-deploy-'));
  logAction(`Creating a temporary Profiler clone at ${path} for ${commit}.`);
  const gitArgs = [
    '-C',
    path,
    '-c',
    `include.path=${configPath}`,
    '-c',
    `core.hooksPath=${hooksPath}`,
    '--work-tree',
    path,
  ];
  let result: T;
  try {
    git('clone', '--shared', '--no-checkout', '--', repoRoot, path);
    // Keep repository-specific identity, signing, and hooks for commits and pushes.
    git(...gitArgs, 'checkout', '--detach', commit);
    result = await action({ path, gitArgs });
  } catch (error) {
    console.error(
      `The temporary Profiler clone is kept at ${path} for inspection.`
    );
    throw error;
  }
  logAction(`Removing the temporary Profiler clone at ${path}.`);
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `The operation succeeded, but the temporary Profiler clone could not be removed: ${error.message}. Remove ${path} manually.`
    );
  }
  return result;
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
export async function createVersionBumpPullRequest(
  version: string,
  forkOwner: string,
  forkRemote: string,
  upstream: string,
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
      `[dry-run] Would create '${branch}' from '${upstream}/main' in a temporary clone, install dependencies, update profiler-cli/package.json, commit, and push the version bump.`
    );
  } else if (hasLocalBranch) {
    console.log(`Using existing local branch '${branch}'.`);
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
  }

  if (!hasRemoteBranch) {
    if (dryRun) {
      if (hasLocalBranch) {
        console.log(
          `[dry-run] Would clone '${branch}' into a temporary directory and install dependencies before pushing.`
        );
      }
      runRemoteMutation(true, 'git', [
        'push',
        forkRemote,
        `${branch}:refs/heads/${branch}`,
      ]);
    } else {
      const forkUrl = gitOutput('remote', 'get-url', '--push', forkRemote);
      await withTemporaryCheckout(
        hasLocalBranch ? branch : `${upstream}/main`,
        async ({ path: checkout, gitArgs }) => {
          logAction(
            'Installing dependencies and preparing Git hooks in the temporary clone.'
          );
          run('yarn', ['install', '--frozen-lockfile'], { cwd: checkout });
          if (!hasLocalBranch) {
            git(...gitArgs, 'checkout', '-b', branch);
            const { path, contents } = readCliPackage(checkout);
            contents.version = version;
            writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
            git(...gitArgs, 'diff', '--', path);
            await confirm(
              `Commit the profiler-cli version bump to ${version}?`
            );
            git(...gitArgs, 'add', '--', path);
            git(
              ...gitArgs,
              'commit',
              '-m',
              `Bump profiler-cli version to ${version}`
            );
          }
          await confirm(`Push branch '${branch}' to '${forkRemote}'?`);
          git(...gitArgs, 'push', forkUrl, `HEAD:refs/heads/${branch}`);
        }
      );
    }
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
    upstream,
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
  fetchDeploymentBranches(upstream);
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
 * Open Markdown in the configured Git editor.
 */
function editMarkdown(initialBody: string): string {
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
        throw new Error('The edited Markdown cannot be empty.');
      }
      return `${body}\n`;
    }
  );
}

/**
 * Create or update and merge the production deployment pull request.
 */
export async function handleDeploymentPullRequest(
  upstream: string,
  dryRun: boolean,
  plannedChanges: string[],
  plannedLocalizers: string[]
): Promise<DeploymentResult> {
  logAction('Preparing the production deployment PR.');
  fetchDeploymentBranches(upstream);
  const range = `${upstream}/production..${upstream}/main`;
  const changes = combineDeploymentChanges(
    collectDeploymentChanges(range),
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
  const body = editMarkdown(generatedBody);
  const date = formatDate();
  const title = `Deploy ${date}`;
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
    return {
      commit: gitOutput('rev-parse', `${upstream}/main`),
      mergeCommit: null,
      body,
      date,
      url: null,
    };
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
    return {
      commit: originalHead,
      mergeCommit: null,
      body,
      date,
      url: pullRequest.url,
    };
  }

  const finalInfo = await waitForChecks(pullRequest, { required: false });
  if (finalInfo.headRefOid !== originalHead) {
    throw new Error(
      `The deployment candidate changed from ${originalHead} to ${finalInfo.headRefOid}. ` +
        'Run the script again to regenerate and confirm the deployment notes.'
    );
  }

  const mergedInfo = await mergePullRequest(pullRequest, 'merge', {
    subject: `${title} (#${pullRequest.number})`,
    body,
    expectedHeadOid: originalHead,
  });
  const mergeCommit = mergedInfo.mergeCommit?.oid;
  if (!mergeCommit || !/^[0-9a-f]{40}$/.test(mergeCommit)) {
    throw new Error(
      `GitHub did not report a merge commit for ${pullRequest.url}.`
    );
  }
  return {
    commit: originalHead,
    mergeCommit,
    body,
    date,
    url: pullRequest.url,
  };
}

/**
 * Prompt for a published URL until it passes validation.
 */
async function waitForPublishedUrl(
  prompt: string,
  validate: (input: string) => string
): Promise<string> {
  for (;;) {
    const input = await ask(prompt);
    try {
      return validate(input);
    } catch (error) {
      console.error(error.message);
    }
  }
}

/**
 * Build Bugzilla fields for the deployed Firefox Profiler toolchain update.
 */
function buildToolchainBugFields(
  date: string,
  mergeCommit: string,
  cliVersion: string
): Record<string, string> {
  return {
    product: 'Core',
    component: 'Gecko Profiler',
    bug_type: 'task',
    short_desc: 'Update the Firefox Profiler toolchain',
    status_whiteboard: '[fp]',
    version: 'unspecified',
    rep_platform: 'Unspecified',
    op_sys: 'Unspecified',
    comment: [
      `Update the Firefox Profiler toolchain to the ${date} deploy.`,
      `This revision includes profiler-cli ${cliVersion}.`,
      '',
      `https://github.com/${repository}/commit/${mergeCommit}`,
    ].join('\n'),
  };
}

/**
 * Validate and normalize a Mozilla Bugzilla bug link.
 */
export function validateToolchainBugUrl(input: string): string {
  const id =
    /^https:\/\/bugzilla\.mozilla\.org\/show_bug\.cgi\?id=(\d+)(?:#.*)?$/.exec(
      input
    )?.[1];
  if (!id) {
    throw new Error(
      'Enter the created bug URL from https://bugzilla.mozilla.org/show_bug.cgi?id=...'
    );
  }
  return `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`;
}

/**
 * Replace the Firefox Profiler revision in the toolchain configuration.
 *
 * Require one exact fetch block and preserve all surrounding YAML verbatim.
 */
export function updateFirefoxProfilerRevision(
  contents: string,
  revision: string
): string {
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(
      'The Firefox toolchain requires a full production merge commit SHA.'
    );
  }
  const blocks = contents.match(
    /^firefox-profiler:\r?\n(?:[ \t][^\n]*\n|\r?\n)*/gm
  );
  if (
    blocks?.length !== 1 ||
    !/^ {8}repo: https:\/\/github\.com\/firefox-devtools\/profiler\r?$/m.test(
      blocks[0]
    )
  ) {
    throw new Error(
      `Could not identify the firefox-profiler fetch in ${toolchainsPath}.`
    );
  }
  const block = blocks[0];
  const revisionLine = /^( {8}revision: )[0-9a-f]{40}(\r?)$/gm;
  if ([...block.matchAll(revisionLine)].length !== 1) {
    throw new Error(
      `Expected one firefox-profiler revision in ${toolchainsPath}.`
    );
  }
  return contents.replace(
    block,
    block.replace(revisionLine, `$1${revision}$2`)
  );
}

/**
 * Reject a Firefox checkout with uncommitted changes.
 */
function ensureCleanFirefoxCheckout(path: string): void {
  logAction(`Checking for a clean Firefox working copy at ${path}.`);
  const status = gitOutput('-C', path, 'status', '--porcelain', '-unormal');
  if (status) {
    throw new Error(`The Firefox working copy must be clean:\n\n${status}`);
  }
}

/**
 * Resolve and validate MOZILLA_CENTRAL.
 */
function firefoxCheckoutPath(): string {
  const configuredPath = process.env.MOZILLA_CENTRAL;
  if (!configuredPath?.trim()) {
    throw new Error(
      'Set MOZILLA_CENTRAL to the path of your Firefox Git checkout before running deploy-prod.'
    );
  }
  const path = resolve(configuredPath);
  for (const file of [toolchainsPath, bugFilingScript]) {
    if (!statSync(join(path, file), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(
        `MOZILLA_CENTRAL must point to a Firefox checkout containing ${file}: ${path}`
      );
    }
  }
  return path;
}

/**
 * Check Firefox toolchain prerequisites and discover the canonical remote.
 */
export function prepareFirefoxCheckout(path: string): FirefoxCheckout {
  logAction('Checking the Firefox toolchain update prerequisites.');
  run('python3', ['--version']);
  // Invoking moz-phab, even with --version, can trigger its automatic updater.
  const mozPhabPath =
    process.platform === 'win32'
      ? run('where.exe', ['moz-phab'], { capture: true, allowFailure: true })
      : run('/bin/sh', ['-c', 'command -v moz-phab'], {
          capture: true,
          allowFailure: true,
        });
  if (!mozPhabPath) {
    throw new Error(
      "The Phabricator CLI 'moz-phab' is not installed or is not on PATH."
    );
  }
  ensureCleanFirefoxCheckout(path);
  const upstream = findGitHubRemote(
    gitOutput('-C', path, 'remote', '-v'),
    'mozilla-firefox/firefox',
    'fetch'
  );
  if (!upstream) {
    throw new Error(
      'The Firefox checkout needs a fetch remote for mozilla-firefox/firefox.'
    );
  }
  return { path, upstream };
}

/**
 * Attempt the Firefox toolchain update and offer recovery after command failures.
 */
export async function updateFirefoxToolchain(
  date: string,
  mergeCommit: string,
  cliVersion: string,
  checkout: FirefoxCheckout
): Promise<void> {
  try {
    await submitFirefoxToolchain(date, mergeCommit, cliVersion, checkout);
  } catch (error) {
    if (error instanceof DeploymentCancelled) {
      throw error;
    }
    console.error(`Firefox toolchain update failed: ${error.message}`);
    await confirm(
      'Complete it manually by following "Update the Firefox Profiler toolchain in Firefox" in docs-developer/deploying.md. Continue with CLI publication and announcements?'
    );
  }
}

/**
 * File the toolchain bug and submit its Firefox revision.
 */
async function submitFirefoxToolchain(
  date: string,
  mergeCommit: string,
  cliVersion: string,
  checkout: FirefoxCheckout
): Promise<void> {
  logAction('Preparing the Firefox Profiler toolchain bug and revision.');
  const { path, upstream } = checkout;
  ensureCleanFirefoxCheckout(path);
  logAction(`Fetching Firefox main from '${upstream}'.`);
  git('-C', path, 'fetch', upstream, 'main');
  const baseCommit = gitOutput('-C', path, 'rev-parse', 'FETCH_HEAD');
  const contents = gitOutput(
    '-C',
    path,
    'show',
    `${baseCommit}:${toolchainsPath}`
  );
  const updated = updateFirefoxProfilerRevision(`${contents}\n`, mergeCommit);
  if (updated === `${contents}\n`) {
    console.log(
      'Firefox main already uses this production merge commit. Skipping the toolchain update.'
    );
    return;
  }
  await confirm(
    `Create a branch for the toolchain bug from Firefox main in ${path} and update ${toolchainsPath}? This will switch that checkout's branch after you create the bug.`
  );
  console.log('Review and create the toolchain bug in your browser.');
  run('python3', [
    join(path, bugFilingScript),
    ...Object.entries(
      buildToolchainBugFields(date, mergeCommit, cliVersion)
    ).map(([field, value]) => `${field}=${value}`),
  ]);
  const bugUrl = await waitForPublishedUrl(
    'Paste the created Bugzilla bug URL:',
    validateToolchainBugUrl
  );
  const bugId = new URL(bugUrl).searchParams.get('id')!;
  const branch = `update-firefox-profiler-${bugId}`;
  ensureCleanFirefoxCheckout(path);
  git('-C', path, 'checkout', '-b', branch, baseCommit);
  logAction(`Updating the Firefox Profiler toolchain to ${mergeCommit}.`);
  const toolchainsFile = join(path, toolchainsPath);
  writeFileSync(
    toolchainsFile,
    updateFirefoxProfilerRevision(
      readFileSync(toolchainsFile, 'utf8'),
      mergeCommit
    )
  );
  git('-C', path, 'diff', '--', toolchainsPath);
  const message = `Bug ${bugId} - Update the Firefox Profiler toolchain to the ${date} deploy r?#profiler-reviewers\n\nThis revision includes profiler-cli ${cliVersion}.\n`;
  console.log(message);
  await confirm('Commit this Firefox toolchain update?');
  git('-C', path, 'add', '--', toolchainsPath);
  withTemporaryFile(
    'profiler-toolchain-',
    'commit-message.txt',
    message,
    (messagePath) => {
      git('-C', path, 'commit', '--file', messagePath);
    }
  );
  const commit = gitOutput('-C', path, 'rev-parse', 'HEAD');
  logAction(`Submitting the Firefox toolchain revision for ${bugUrl}.`);
  await confirm(
    'Submit this commit with moz-phab? It will create a Phabricator revision and amend the local commit with its URL.'
  );
  run('moz-phab', [
    'submit',
    '--path',
    path,
    '--single',
    '--interactive',
    commit,
  ]);
  console.log(
    `The toolchain revision for ${bugUrl} still needs review and landing. Submission alone does not update Firefox.`
  );
}

/**
 * Publish and tag the CLI from one checkout of the deployed commit.
 */
export async function finishDeployment(
  deployedMainCommit: string,
  cliPlan: CliDeploymentPlan,
  upstream: string,
  dryRun: boolean
): Promise<CliRelease | null> {
  logAction('Confirming the Netlify deployment is live before publishing.');

  if (dryRun) {
    console.log(
      `[dry-run] Would ask for confirmation that the Netlify production deployment for ${deployedMainCommit} is live.`
    );
  } else {
    await confirm(
      `Confirm that the Netlify production deployment for ${deployedMainCommit} is live?`
    );
  }

  if (!cliPlan.shouldPublishCli) {
    console.log(
      'The profiler-cli version is unchanged from production. Skipping npm publication.'
    );
    return null;
  }

  const cliVersion = cliPlan.version;
  const release = {
    version: cliVersion,
    tag: `profiler-cli-v${cliVersion}`,
    bumpCommit:
      dryRun && cliPlan.plannedChange
        ? '<version-bump-commit>'
        : findCliVersionCommit(deployedMainCommit, cliVersion),
  };
  // A remote can fetch upstream but push to a fork. Publish the tag to its fetch URL.
  const canonicalUrl = gitOutput('remote', 'get-url', upstream);
  const pushArgs = [
    'push',
    canonicalUrl,
    `${release.bumpCommit}:refs/tags/${release.tag}`,
  ];
  const contents = JSON.parse(
    gitOutput('show', `${deployedMainCommit}:profiler-cli/package.json`)
  ) as CliPackage['contents'];
  if (dryRun) {
    console.log(
      `[dry-run] Would create a temporary clone at ${deployedMainCommit} and install dependencies.`
    );
    console.log(
      `[dry-run] Would publish ${contents.name}@${cliVersion} to npm.`
    );
    runRemoteMutation(true, 'yarn', ['publish-cli']);
    runRemoteMutation(true, 'git', pushArgs);
    return release;
  }
  if (contents.version !== cliVersion) {
    throw new Error(
      `Expected profiler-cli version ${cliVersion}, found ${contents.version}.`
    );
  }
  await confirm(`Publish ${contents.name}@${contents.version} to npm?`);
  await withTemporaryCheckout(deployedMainCommit, async ({ path, gitArgs }) => {
    logAction(
      'Installing dependencies for the deployed CLI in the temporary clone.'
    );
    run('yarn', ['install', '--frozen-lockfile'], { cwd: path });
    logAction(
      `Publishing ${contents.name}@${contents.version} from ${deployedMainCommit}.`
    );
    run('yarn', ['publish-cli'], { cwd: path });
    logAction(`Tagging ${release.tag} at its version-bump commit.`);
    await confirm(
      `Publish tag '${release.tag}' at ${release.bumpCommit} to ${canonicalUrl}?`
    );
    git(...gitArgs, ...pushArgs);
  });
  return release;
}

/**
 * Find the commit that introduces the deployed CLI version on main.
 */
export function findCliVersionCommit(
  deployedCommit: string,
  version: string
): string {
  if (cliVersionAtRef(deployedCommit) !== version) {
    throw new Error(
      `The deployed commit does not contain profiler-cli ${version}.`
    );
  }
  const commits = gitOutput(
    'log',
    '--first-parent',
    '--format=%H',
    deployedCommit,
    '--',
    'profiler-cli/package.json'
  )
    .split('\n')
    .filter(Boolean);
  for (const commit of commits) {
    if (
      cliVersionAtRef(commit) === version &&
      cliVersionAtRef(`${commit}^`) !== version
    ) {
      return commit;
    }
  }
  throw new Error(
    `Could not find the version-bump commit for profiler-cli ${version}.`
  );
}

/**
 * Prepare the announcement in Discourse's browser composer.
 */
export function buildAnnouncementUrl(deployment: DeploymentResult): string {
  const body = [
    'The latest version of the [Firefox Profiler](https://profiler.firefox.com) is now live! Check out the full changelog below to see what’s changed:',
    '',
    '**Highlights:**',
    '',
    '<!-- Move notable changes from Other Changes here and remove this comment before publishing. -->',
    '',
    deployment.body
      .trim()
      .replace(/^Changes:$/m, '**Other Changes:**')
      .replace(/^\[[^\]\n]+\] .+$/gm, '- $&')
      .replace(
        /^And special thanks to our localizers:$/m,
        'Big thanks to our amazing localizers for making this release possible:'
      )
      .replace(
        /\(#(\d+)\)/g,
        `([#$1](https://github.com/${repository}/pull/$1))`
      ),
    '',
    'Find out more about the Firefox Profiler on [profiler.firefox.com](https://profiler.firefox.com)! If you have any questions, join the discussion on our [Matrix channel](https://chat.mozilla.org/#/room/#profiler:mozilla.org)!',
    '',
  ].join('\n');
  const url = new URL('https://discourse.mozilla.org/new-topic');
  url.search = new URLSearchParams({
    title: `Firefox Profiler Deployment (${deployment.date})`,
    body,
    category_id: '521',
    tags: 'firefox-profiler',
  }).toString();
  return url.href;
}

/**
 * Accept a published Mozilla Discourse topic link.
 */
export function validateAnnouncementUrl(input: string): string {
  const url = URL.canParse(input) ? new URL(input) : null;
  if (
    !url ||
    url.origin !== 'https://discourse.mozilla.org' ||
    url.username ||
    url.password ||
    !/^\/t\/(?:[^/]+\/)?\d+(?:\/\d+)?\/?$/.test(url.pathname)
  ) {
    throw new Error(
      'Enter the published topic URL from https://discourse.mozilla.org/t/...'
    );
  }
  return url.href;
}

/**
 * Announce the deployment and publish edited release notes.
 */
async function announceDeployment(
  deployment: DeploymentResult,
  release: CliRelease | null,
  dryRun: boolean
): Promise<void> {
  logAction('Preparing the Discourse deployment announcement.');
  const composerUrl = buildAnnouncementUrl(deployment);
  const fallbackUrl = new URL(composerUrl);
  const announcementBody = fallbackUrl.searchParams.get('body');
  fallbackUrl.searchParams.delete('body');
  console.log(
    `If the prefilled link fails, open ${fallbackUrl.href} and paste this announcement body:\n\n${announcementBody}`
  );
  let announcementUrl = 'https://discourse.mozilla.org/t/DRY-RUN/0';
  if (dryRun) {
    console.log(
      `[dry-run] Would open the prefilled announcement in your browser:\n${composerUrl}`
    );
    console.log(
      '[dry-run] Would wait for you to review and publish the announcement, then paste its URL.'
    );
  } else {
    console.log(
      'Review the announcement, fill in Highlights, and publish it in your browser.'
    );
    console.log(composerUrl);
    console.log('[exec] open browser with Discourse composer');
    try {
      await open(composerUrl);
    } catch (error) {
      console.warn(
        `Could not open the browser: ${error.message}. Use the short composer link and announcement body above.`
      );
    }
    announcementUrl = await waitForPublishedUrl(
      'Paste the published Discourse topic URL:',
      validateAnnouncementUrl
    );
  }

  if (!release) {
    return;
  }
  const { tag, bumpCommit, version } = release;
  logAction(`Preparing the GitHub release notes for ${tag}.`);
  const generateArgs = [
    'api',
    `repos/${repository}/releases/generate-notes`,
    '--method',
    'POST',
    '-f',
    `tag_name=${tag}`,
    '-f',
    `target_commitish=${bumpCommit}`,
    '--jq',
    '.body',
  ];
  let generatedNotes: string;
  if (dryRun) {
    console.log(
      '[dry-run] Would generate release notes:',
      ['gh', ...generateArgs].join(' ')
    );
    generatedNotes = deployment.body;
  } else {
    generatedNotes = run('gh', generateArgs, { capture: true });
  }
  console.log(
    'Opening release notes in your editor. Fill in Highlights and remove noisy changes.'
  );
  const body = editMarkdown(
    [
      '## Highlights',
      '',
      '<!-- Describe notable CLI commands or behavior changes; remove this comment before publishing. -->',
      '',
      generatedNotes.trim(),
      '',
      `**📢 Deploy announcement:** [Firefox Profiler Deployment (${deployment.date})](${announcementUrl})`,
      '',
    ].join('\n')
  );
  console.log(body);
  if (!dryRun) {
    await confirm(`Publish the GitHub release '${tag}' with these notes?`);
  }
  withTemporaryFile(
    'profiler-deploy-release-',
    'release-notes.md',
    body,
    (path) => {
      ghMutation(
        dryRun,
        'release',
        'create',
        tag,
        '--verify-tag',
        '--title',
        tag,
        '--notes-file',
        path,
        ...(parseVersion(version)?.prerelease
          ? ['--prerelease', '--latest=false']
          : ['--latest'])
      );
    }
  );
}

/**
 * Run the production deployment workflow.
 */
export async function main(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const { dryRun } = parseArguments(args);
  const firefoxPath = dryRun ? null : firefoxCheckoutPath();
  console.log(
    `Firefox Profiler production deployment${dryRun ? ' (dry run)' : ''}`
  );
  await confirm(
    dryRun
      ? 'Start the dry run? This script will fetch recent changes, but it will not change working trees, GitHub, npm, Discourse, Bugzilla, or Phabricator.'
      : 'Start the deployment? This script will fetch recent changes and use temporary clones for the CLI version bump and publication, keeping your Profiler branch and working tree unchanged. It will create a branch in the Firefox checkout. Commits and remote changes will still require separate confirmation.'
  );
  const login = ensureGhAvailableAndLoggedIn();
  console.log(`Authenticated to GitHub as ${login}.`);
  ensureCleanWorkingCopy();
  const { upstream, fork: forkRemote } = discoverDeploymentRemotes(login);
  const firefoxCheckout =
    firefoxPath === null ? null : prepareFirefoxCheckout(firefoxPath);
  fetchDeploymentBranches(upstream);
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
  const deployment = await handleDeploymentPullRequest(
    upstream,
    dryRun,
    plannedChanges,
    l10nPlan.plannedLocalizers
  );
  if (firefoxCheckout && deployment.mergeCommit) {
    await updateFirefoxToolchain(
      deployment.date,
      deployment.mergeCommit,
      cliPlan.version,
      firefoxCheckout
    );
  } else {
    console.log(
      '[dry-run] Would file the Firefox toolchain bug and submit the toolchain revision with moz-phab.'
    );
  }
  const release = await finishDeployment(
    deployment.commit,
    cliPlan,
    upstream,
    dryRun
  );
  await announceDeployment(deployment, release, dryRun);
  if (dryRun) {
    console.log(
      'Dry run completed. No GitHub, npm, Discourse, Bugzilla, or Phabricator changes, local branches, commits, tags, or working-tree changes were created.'
    );
    return;
  }
  console.log(
    cliPlan.shouldPublishCli
      ? 'Deployment, announcement, and profiler-cli release completed.'
      : 'Deployment and announcement completed without a new profiler-cli release.'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nDeployment stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
