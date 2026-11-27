import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { test } from 'node:test';

import {
  MARKER,
  findReportComment,
  parsePullRequestNumber,
  readSizes,
  shouldReport,
} from './post-bundle-size-report.mjs';

test('parsePullRequestNumber only reads a number', () => {
  assert.equal(parsePullRequestNumber('6083\n'), 6083);
  assert.equal(parsePullRequestNumber(''), null);
  assert.equal(parsePullRequestNumber('0'), null);
  assert.equal(parsePullRequestNumber('12/comments'), null);
  assert.equal(parsePullRequestNumber('12 13'), null);
});

test('findReportComment finds the comment of the workflow', () => {
  const report = {
    id: 3,
    user: { login: 'github-actions[bot]' },
    body: `${MARKER}\nreport`,
  };
  const comments = [
    { id: 1, user: { login: 'someone' }, body: `${MARKER}\nreport` },
    { id: 2, user: { login: 'github-actions[bot]' }, body: 'Another comment' },
    report,
  ];
  assert.equal(findReportComment(comments), report);
  assert.equal(findReportComment(comments.slice(0, 2)), null);
  assert.equal(findReportComment([]), null);
});

const assets = [{ name: 'index-*.js', files: 1, size: 1000, brotliSize: 300 }];
const sizes = { entries: [], assets };

test('shouldReport follows the size changes, the comment and the labels', () => {
  const same = { entries: [], assets };
  const smaller = { entries: [], assets: [{ ...assets[0], size: 900 }] };
  const none = { sizes, labels: [], hasComment: false };

  assert.equal(shouldReport({ ...none, baseline: smaller }), true);
  assert.equal(shouldReport({ ...none, baseline: same }), false);
  // Without the sizes of the base commit, the report shows the sizes alone.
  assert.equal(shouldReport({ ...none, baseline: null }), true);
  // The comment of an earlier push stays current.
  assert.equal(
    shouldReport({ ...none, baseline: same, hasComment: true }),
    true
  );
  assert.equal(
    shouldReport({ ...none, baseline: same, labels: ['perf'] }),
    true
  );
  assert.equal(
    shouldReport({
      sizes,
      baseline: smaller,
      labels: ['documentation', 'perf'],
      hasComment: true,
    }),
    false
  );
});

test('readSizes reads regular files with the expected shape', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-size-'));
  const write = async (name, content) => {
    await fs.writeFile(path.join(dir, name), content);
    return path.join(dir, name);
  };

  assert.deepEqual(
    await readSizes(await write('sizes.json', JSON.stringify(sizes))),
    { commit: undefined, ...sizes }
  );
  assert.equal(await readSizes(await write('text.json', 'not JSON')), null);
  assert.equal(
    await readSizes(
      await write(
        'markdown.json',
        JSON.stringify({ entries: [{ name: '[x](https://a.b)', size: 1 }] })
      )
    ),
    null
  );
  assert.equal(await readSizes(path.join(dir, 'missing.json')), null);
  await fs.symlink(path.join(dir, 'sizes.json'), path.join(dir, 'link.json'));
  assert.equal(await readSizes(path.join(dir, 'link.json')), null);

  await fs.rm(dir, { recursive: true });
});
