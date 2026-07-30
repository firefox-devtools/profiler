/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for `profiler-cli sourcemap sources`.
 *
 * Fixtures under fixtures/sourcemap/ are pre-generated and committed (see
 * fixtures/sourcemap-generator.ts) because they can't be built in this
 * node-env test process.
 */

import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  type CliTestContext,
} from './utils';

import type { SourceMapSourcesResult, WithContext } from '../../protocol';

const FIXTURES = join(__dirname, '..', 'fixtures', 'sourcemap');
const SINGLE_PROFILE = join(FIXTURES, 'single.json');

describe('profiler-cli sourcemap', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('lists eligible sources (text and --json)', async () => {
    await cli(ctx, ['load', SINGLE_PROFILE]);

    const text = await cli(ctx, ['sourcemap', 'sources']);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('bundle.js');
    expect(text.stdout).toContain('src-');

    const jsonResult = await cli(ctx, ['sourcemap', 'sources', '--json']);
    const list = JSON.parse(
      jsonResult.stdout
    ) as WithContext<SourceMapSourcesResult>;
    expect(list.type).toBe('sourcemap-sources');
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0].filename).toBe('bundle.js');
    expect(list.sources[0].sourceHandle).toMatch(/^src-\d+$/);
    expect(list.sources[0].sourceMap).toEqual({
      kind: 'url',
      url: 'https://example.com/bundle.js.map',
    });
  });
});
