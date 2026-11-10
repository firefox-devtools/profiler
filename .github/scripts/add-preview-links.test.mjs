import assert from 'assert/strict';
import { test } from 'node:test';

import {
  END_MARKER,
  START_MARKER,
  addPreviewLinksToBody,
  buildPreviewLinks,
  extractIssueNumbers,
  extractProfileUrls,
  hasDeployPreviewLink,
  normalizePath,
  profileUrlToPath,
  resolveProfileUrlToPath,
} from './add-preview-links.mjs';

test('hasDeployPreviewLink detects generated and manual preview links', () => {
  assert.equal(hasDeployPreviewLink('No preview links here.'), false);
  assert.equal(
    hasDeployPreviewLink(
      '[Deploy preview](https://deploy-preview-6083--perf-html.netlify.app/)'
    ),
    true
  );
  assert.equal(
    hasDeployPreviewLink(`${START_MARKER}\nlinks\n${END_MARKER}`),
    true
  );
});

test('extractIssueNumbers finds markdown references and issue URLs', () => {
  const text = [
    'Fixes #5598.',
    'See https://github.com/firefox-devtools/profiler/issues/6083.',
    'Follow-up to https://github.com/firefox-devtools/profiler/pull/6017.',
    'Duplicate #5598.',
  ].join(' ');

  assert.deepEqual(extractIssueNumbers(text), [5598, 6083, 6017]);
});

test('extractProfileUrls finds profiler, share, and preview URLs', () => {
  assert.deepEqual(
    extractProfileUrls('Profile: https://share.firefox.dev/466MJwC.'),
    ['https://share.firefox.dev/466MJwC']
  );
  assert.deepEqual(
    extractProfileUrls(
      '[Profile](https://profiler.firefox.com/public/abc/calltree/?thread=1&v=16)'
    ),
    ['https://profiler.firefox.com/public/abc/calltree/?thread=1&v=16']
  );
  const previewLinks = [
    '[Main](https://main--perf-html.netlify.app/public/abc/)',
    '[Deploy preview](https://deploy-preview-6017--perf-html.netlify.app/public/abc/)',
  ].join(' | ');

  assert.deepEqual(extractProfileUrls(previewLinks), [
    'https://main--perf-html.netlify.app/public/abc/',
    'https://deploy-preview-6017--perf-html.netlify.app/public/abc/',
  ]);
});

test('profileUrlToPath keeps the profiler path, query, and hash', () => {
  assert.equal(
    profileUrlToPath(
      'https://profiler.firefox.com/public/abc/flame-graph/?thread=1&v=16#hash'
    ),
    '/public/abc/flame-graph/?thread=1&v=16#hash'
  );
  assert.equal(profileUrlToPath('https://profiler.firefox.com/'), null);
  assert.equal(
    profileUrlToPath('https://main--perf-html.netlify.app/public/abc/'),
    '/public/abc/'
  );
  assert.equal(
    profileUrlToPath(
      'https://deploy-preview-6017--perf-html.netlify.app/public/abc/'
    ),
    '/public/abc/'
  );
});

test('resolveProfileUrlToPath follows share.firefox.dev redirects', async () => {
  const fetchImpl = async () => ({
    url: 'https://profiler.firefox.com/public/abc/marker-table/?thread=0&v=16',
  });

  assert.equal(
    await resolveProfileUrlToPath(
      'https://share.firefox.dev/466MJwC',
      fetchImpl
    ),
    '/public/abc/marker-table/?thread=0&v=16'
  );
});

test('resolveProfileUrlToPath handles main and deploy preview links', async () => {
  assert.equal(
    await resolveProfileUrlToPath(
      'https://main--perf-html.netlify.app/public/abc/?v=16'
    ),
    '/public/abc/?v=16'
  );
  assert.equal(
    await resolveProfileUrlToPath(
      'https://deploy-preview-6017--perf-html.netlify.app/public/abc/?v=16'
    ),
    '/public/abc/?v=16'
  );
});

test('resolveProfileUrlToPath ignores broken share.firefox.dev links', async () => {
  const unresolvedFetchImpl = async () => ({
    url: 'https://share.firefox.dev/nonsense',
  });
  const failingFetchImpl = async () => {
    throw new Error('Network error');
  };

  assert.equal(
    await resolveProfileUrlToPath(
      'https://share.firefox.dev/nonsense',
      unresolvedFetchImpl
    ),
    null
  );

  const originalWarn = console.warn;

  try {
    console.warn = () => {};
    assert.equal(
      await resolveProfileUrlToPath(
        'https://share.firefox.dev/nonsense',
        failingFetchImpl
      ),
      null
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('buildPreviewLinks uses the main branch and deploy preview hosts', () => {
  const path = '/public/abc/marker-table/?thread=0&v=16';
  const mainUrl = `https://main--perf-html.netlify.app${path}`;
  const previewUrl = `https://deploy-preview-6083--perf-html.netlify.app${path}`;

  assert.equal(normalizePath('public/abc'), '/public/abc');
  assert.equal(
    buildPreviewLinks(6083, path),
    `[Main](${mainUrl}) | [Deploy preview](${previewUrl})`
  );
});

test('addPreviewLinksToBody prepends a marked block', () => {
  assert.equal(
    addPreviewLinksToBody(
      'Fixes #5598.',
      '[Main](main) | [Deploy preview](preview)'
    ),
    [
      START_MARKER,
      '[Main](main) | [Deploy preview](preview)',
      END_MARKER,
      '',
      'Fixes #5598.',
    ].join('\n')
  );
});
