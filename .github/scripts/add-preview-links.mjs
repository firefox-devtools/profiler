import fs from 'fs/promises';
import { pathToFileURL } from 'url';

export const START_MARKER = '<!-- profiler-preview-links:start -->';
export const END_MARKER = '<!-- profiler-preview-links:end -->';

const GITHUB_API_URL = 'https://api.github.com';
const MAIN_BASE_URL = 'https://main--perf-html.netlify.app';
const PROFILE_HOST = 'profiler.firefox.com';
const SHARE_HOST = 'share.firefox.dev';

export function hasDeployPreviewLink(body) {
  return (
    body.includes(START_MARKER) ||
    /https:\/\/deploy-preview-\d+--perf-html\.netlify\.app(?:\/|\b)/.test(body)
  );
}

export function extractIssueNumbers(text) {
  const issueNumbers = new Set();
  const markdownIssueRegExp = /(?:^|[^\w/-])#(\d+)\b/g;
  const issueUrlRegExp =
    /https:\/\/github\.com\/firefox-devtools\/profiler\/issues\/(\d+)\b/g;

  for (const match of text.matchAll(markdownIssueRegExp)) {
    issueNumbers.add(Number(match[1]));
  }

  for (const match of text.matchAll(issueUrlRegExp)) {
    issueNumbers.add(Number(match[1]));
  }

  return [...issueNumbers];
}

export function extractProfileUrls(text) {
  const urls = [];
  const profileUrlRegExp =
    /https:\/\/(?:share\.firefox\.dev|profiler\.firefox\.com)\/[^\s<>)\]]+/g;

  for (const match of text.matchAll(profileUrlRegExp)) {
    urls.push(match[0].replace(/[.,;:]+$/, ''));
  }

  return urls;
}

export function profileUrlToPath(profileUrl) {
  const url = new URL(profileUrl);

  if (url.hostname !== PROFILE_HOST) {
    return null;
  }

  const path = `${url.pathname}${url.search}${url.hash}`;
  return path === '/' ? null : path;
}

export async function resolveProfileUrlToPath(profileUrl, fetchImpl = fetch) {
  const url = new URL(profileUrl);

  if (url.hostname === PROFILE_HOST) {
    return profileUrlToPath(profileUrl);
  }

  if (url.hostname !== SHARE_HOST) {
    return null;
  }

  const response = await fetchImpl(profileUrl, { redirect: 'follow' });
  return profileUrlToPath(response.url);
}

export function normalizePath(path) {
  if (!path || path === '/') {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function buildPreviewLinks(prNumber, path) {
  const normalizedPath = normalizePath(path);
  const previewBaseUrl = `https://deploy-preview-${prNumber}--perf-html.netlify.app`;

  return `[Main](${MAIN_BASE_URL}${normalizedPath}) | [Deploy preview](${previewBaseUrl}${normalizedPath})`;
}

export function addPreviewLinksToBody(body, previewLinks) {
  const previewLinksBlock = `${START_MARKER}\n${previewLinks}\n${END_MARKER}`;
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return previewLinksBlock;
  }

  return `${previewLinksBlock}\n\n${trimmedBody}`;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'firefox-profiler-preview-links',
      'x-github-api-version': '2022-11-28',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}\n${message}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getIssueTexts({ owner, repo, issueNumber, token }) {
  const issue = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    token
  );
  const comments = await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    token
  );

  return [issue.body ?? '', ...comments.map((comment) => comment.body ?? '')];
}

async function findProfilePath({ owner, repo, pullRequest, token }) {
  const pullRequestText = `${pullRequest.title ?? ''}\n${pullRequest.body ?? ''}`;

  for (const profileUrl of extractProfileUrls(pullRequestText)) {
    const path = await resolveProfileUrlToPath(profileUrl);

    if (path) {
      return path;
    }
  }

  for (const issueNumber of extractIssueNumbers(pullRequestText)) {
    let issueTexts;

    try {
      issueTexts = await getIssueTexts({ owner, repo, issueNumber, token });
    } catch (error) {
      console.warn(`Could not read issue #${issueNumber}: ${error.message}`);
      continue;
    }

    for (const issueText of issueTexts) {
      for (const profileUrl of extractProfileUrls(issueText)) {
        const path = await resolveProfileUrlToPath(profileUrl);

        if (path) {
          return path;
        }
      }
    }
  }

  return '/';
}

export async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!eventPath || !repository || !token) {
    throw new Error(
      'GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required.'
    );
  }

  const payload = JSON.parse(await fs.readFile(eventPath, 'utf8'));
  const pullRequest = payload.pull_request;

  if (!pullRequest) {
    console.log('This event does not include a pull request. Nothing to do.');
    return;
  }

  const [owner, repo] = repository.split('/');
  const body = pullRequest.body ?? '';

  if (hasDeployPreviewLink(body)) {
    console.log('The pull request already has deploy preview links.');
    return;
  }

  const profilePath = await findProfilePath({
    owner,
    repo,
    pullRequest,
    token,
  });
  const previewLinks = buildPreviewLinks(pullRequest.number, profilePath);
  const updatedBody = addPreviewLinksToBody(body, previewLinks);

  await githubRequest(
    `/repos/${owner}/${repo}/pulls/${pullRequest.number}`,
    token,
    {
      body: JSON.stringify({ body: updatedBody }),
      method: 'PATCH',
    }
  );

  console.log(`Added preview links to pull request #${pullRequest.number}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
