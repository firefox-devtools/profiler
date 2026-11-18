import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

import {
  buildChangedAssetsTable,
  parseBaseline,
  renderReport,
} from '../../scripts/lib/bundle-size-report.mjs';

// Marks the comment of this script, so that each new report updates it.
export const MARKER = '<!-- profiler-bundle-size-report -->';
// A pull request with this label gets the report even when no size changed.
export const ALWAYS_REPORT_LABEL = 'perf';
// A pull request with this label keeps its conversation free of the report.
export const NO_REPORT_LABEL = 'documentation';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const COMMENT_AUTHOR = 'github-actions[bot]';
const MAX_FILE_SIZE = 1_000_000;
const NUMBER_PATTERN = /^[1-9]\d{0,9}$/;

export function parsePullRequestNumber(text) {
  const trimmedText = text.trim();
  return NUMBER_PATTERN.test(trimmedText) ? Number(trimmedText) : null;
}

export function buildCommentBody(report, headSha) {
  return `${MARKER}\n${report.trim()}\n\nMeasured on ${headSha.slice(0, 9)}.`;
}

export function findReportComment(comments) {
  return (
    comments.find(
      (comment) =>
        comment.user?.login === COMMENT_AUTHOR &&
        (comment.body ?? '').startsWith(MARKER)
    ) ?? null
  );
}

// A pull request gets the report when it changes a size, or when the sizes of
// its base commit are not there to compare with. This leaves out the ones that
// keep every size as it is, about tests for example. Once a pull request has
// the comment, each push keeps it current. The labels have the last word.
export function shouldReport({ sizes, baseline, labels, hasComment }) {
  if (labels.includes(NO_REPORT_LABEL)) {
    return false;
  }
  return (
    hasComment ||
    labels.includes(ALWAYS_REPORT_LABEL) ||
    !baseline ||
    buildChangedAssetsTable(sizes.assets, baseline) !== null
  );
}

// The sizes of the artifact with the expected shape, or null. A file of the
// artifact is read when it is a regular file of a reasonable size.
export async function readSizes(file) {
  try {
    const stats = await fs.lstat(file);
    if (!stats.isFile() || stats.size > MAX_FILE_SIZE) {
      return null;
    }
    return parseBaseline(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

const hasBothSizes = (items) =>
  items.every(({ brotliSize }) => brotliSize !== undefined);

async function githubRequest(requestPath, token, options = {}) {
  const response = await fetch(`${GITHUB_API_URL}${requestPath}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'firefox-profiler-bundle-size-report',
      'x-github-api-version': GITHUB_API_VERSION,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}\n${message}`
    );
  }

  return response.json();
}

export async function main(reportDir) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!reportDir || !eventPath || !repository || !token) {
    throw new Error(
      'The report directory, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required.'
    );
  }

  const payload = JSON.parse(await fs.readFile(eventPath, 'utf8'));
  const headSha = payload.workflow_run?.head_sha;
  const sizes = await readSizes(path.join(reportDir, 'sizes.json'));
  const pullNumber = parsePullRequestNumber(
    await fs
      .readFile(path.join(reportDir, 'pull-request-number'), 'utf8')
      .catch(() => '')
  );

  if (
    !headSha ||
    pullNumber === null ||
    !sizes ||
    !hasBothSizes(sizes.entries) ||
    !hasBothSizes(sizes.assets)
  ) {
    console.log('This run has no sizes to report.');
    return;
  }

  // The report belongs on the pull request whose latest commit it measured.
  const pullRequest = await githubRequest(
    `/repos/${repository}/pulls/${pullNumber}`,
    token
  );
  if (pullRequest.head?.sha !== headSha) {
    console.log(
      `Pull request #${pullNumber} has moved on from ${headSha.slice(0, 9)}. Its next run brings the report.`
    );
    return;
  }

  const baseline = await readSizes(path.join(reportDir, 'baseline.json'));
  const comments = await githubRequest(
    `/repos/${repository}/issues/${pullNumber}/comments?per_page=100`,
    token
  );
  const comment = findReportComment(comments);
  const labels = (pullRequest.labels ?? []).map((label) => label.name);

  if (
    !shouldReport({ sizes, baseline, labels, hasComment: comment !== null })
  ) {
    console.log(`No comment needed on pull request #${pullNumber}.`);
    return;
  }

  // The report is rendered here, from the numbers and names of the artifact.
  const report = renderReport(sizes.entries, baseline, sizes.assets, {
    isBaselineExpected: true,
  });
  const body = JSON.stringify({ body: buildCommentBody(report, headSha) });

  if (comment) {
    await githubRequest(
      `/repos/${repository}/issues/comments/${comment.id}`,
      token,
      { body, method: 'PATCH' }
    );
    console.log(`Updated the report on pull request #${pullNumber}.`);
  } else {
    await githubRequest(
      `/repos/${repository}/issues/${pullNumber}/comments`,
      token,
      { body, method: 'POST' }
    );
    console.log(`Posted the report on pull request #${pullNumber}.`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main(process.argv[2]);
}
