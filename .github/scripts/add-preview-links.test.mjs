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
  assert.deepEqual(
    extractIssueNumbers(
      'Fixes #5598 and see https://github.com/firefox-devtools/profiler/issues/6083. Duplicate #5598.'
    ),
    [5598, 6083]
  );
});

test('extractProfileUrls finds profiler and share URLs', () => {
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
});

test('profileUrlToPath keeps the profiler path, query, and hash', () => {
  assert.equal(
    profileUrlToPath(
      'https://profiler.firefox.com/public/abc/flame-graph/?thread=1&v=16#hash'
    ),
    '/public/abc/flame-graph/?thread=1&v=16#hash'
  );
  assert.equal(profileUrlToPath('https://profiler.firefox.com/'), null);
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

test('buildPreviewLinks uses the main branch and deploy preview hosts', () => {
  assert.equal(normalizePath('public/abc'), '/public/abc');
  assert.equal(
    buildPreviewLinks(6083, '/public/abc/marker-table/?thread=0&v=16'),
    '[Main](https://main--perf-html.netlify.app/public/abc/marker-table/?thread=0&v=16) | [Deploy preview](https://deploy-preview-6083--perf-html.netlify.app/public/abc/marker-table/?thread=0&v=16)'
  );
});

test('addPreviewLinksToBody prepends a marked block', () => {
  assert.equal(
    addPreviewLinksToBody(
      'Fixes #5598.',
      '[Main](main) | [Deploy preview](preview)'
    ),
    `${START_MARKER}\n[Main](main) | [Deploy preview](preview)\n${END_MARKER}\n\nFixes #5598.`
  );
});
