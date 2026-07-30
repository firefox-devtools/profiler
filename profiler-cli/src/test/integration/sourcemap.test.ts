/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for `profiler-cli sourcemap {sources,apply}`.
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
  cliFail,
  type CliTestContext,
} from './utils';

import type {
  SourceMapSourcesResult,
  ApplySourceMapResult,
  WithContext,
} from '../../protocol';

type AmbiguousResult = Extract<
  ApplySourceMapResult,
  { type: 'sourcemap-ambiguous' }
>;
type ErrorResult = Extract<ApplySourceMapResult, { type: 'sourcemap-error' }>;

const FIXTURES = join(__dirname, '..', 'fixtures', 'sourcemap');
const SINGLE_PROFILE = join(FIXTURES, 'single.json');
const TWO_PROFILE = join(FIXTURES, 'two.json');
const NO_MAP_PROFILE = join(FIXTURES, 'no-map.json');
const GOOD_MAP = join(FIXTURES, 'bundle.js.map');
const MYSTERY_MAP = join(FIXTURES, 'mystery.map');
const GARBAGE_MAP = join(FIXTURES, 'garbage.map');

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

  it('applies a matching map and de-minifies the function name', async () => {
    await cli(ctx, ['load', SINGLE_PROFILE]);

    const applyResult = await cli(ctx, [
      'sourcemap',
      'apply',
      GOOD_MAP,
      '--json',
    ]);
    const applied = JSON.parse(
      applyResult.stdout
    ) as WithContext<ApplySourceMapResult>;
    expect(applied.type).toBe('sourcemap-applied');

    await cli(ctx, ['thread', 'select', 't-0']);
    const samples = await cli(ctx, ['thread', 'samples']);
    expect(samples.stdout).toContain('greet');
    expect(samples.stdout).not.toContain('Ajs');
  });

  it('reports a map that matches nothing, then applies to the chosen --to', async () => {
    await cli(ctx, ['load', TWO_PROFILE]);

    const listResult = await cli(ctx, ['sourcemap', 'sources', '--json']);
    const list = JSON.parse(
      listResult.stdout
    ) as WithContext<SourceMapSourcesResult>;
    const handleForA = list.sources.find(
      (s) => s.filename === 'bundle-a.js'
    )!.sourceHandle;

    const ambiguous = await cliFail(ctx, [
      'sourcemap',
      'apply',
      MYSTERY_MAP,
      '--json',
    ]);
    expect(ambiguous.exitCode).not.toBe(0);
    const ambiguousResult = JSON.parse(
      ambiguous.stdout
    ) as WithContext<ApplySourceMapResult>;
    expect(ambiguousResult.type).toBe('sourcemap-ambiguous');
    // mystery.map matches neither bundle by name, so all eligible sources are
    // offered rather than being reported as several matches.
    expect((ambiguousResult as AmbiguousResult).reason).toBe('no-matches');
    expect((ambiguousResult as AmbiguousResult).candidates).toHaveLength(2);

    const ambiguousText = await cliFail(ctx, [
      'sourcemap',
      'apply',
      MYSTERY_MAP,
    ]);
    expect(ambiguousText.stdout).toContain('does not match any source');

    const applyResult = await cli(ctx, [
      'sourcemap',
      'apply',
      MYSTERY_MAP,
      '--to',
      handleForA,
      '--json',
    ]);
    const applied = JSON.parse(
      applyResult.stdout
    ) as WithContext<ApplySourceMapResult>;
    expect(applied.type).toBe('sourcemap-applied');
  });

  it('rejects --to for a source that carries no source map URL', async () => {
    await cli(ctx, ['load', NO_MAP_PROFILE]);

    // Without --to this is a `no-eligible-sources` error, so --to must not be a
    // way around that guard.
    const result = await cliFail(ctx, [
      'sourcemap',
      'apply',
      GOOD_MAP,
      '--to',
      'src-0',
    ]);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('has no source map URL');
  });

  it('rejects --to for an original source added by a previous apply', async () => {
    await cli(ctx, ['load', SINGLE_PROFILE]);
    await cli(ctx, ['sourcemap', 'apply', GOOD_MAP]);

    // Applying appends the map's original sources to the source table. They are
    // valid src-N handles but are not bundles, so they can't be --to targets.
    const listResult = await cli(ctx, ['sourcemap', 'sources', '--json']);
    const list = JSON.parse(
      listResult.stdout
    ) as WithContext<SourceMapSourcesResult>;
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0].sourceHandle).toBe('src-0');

    const result = await cliFail(ctx, [
      'sourcemap',
      'apply',
      GOOD_MAP,
      '--to',
      'src-1',
    ]);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('has no source map URL');
    // The error points at the handles that would work.
    expect(output).toContain('src-0 (bundle.js)');
  });

  it('rejects an out-of-range --to handle', async () => {
    await cli(ctx, ['load', SINGLE_PROFILE]);

    const result = await cliFail(ctx, [
      'sourcemap',
      'apply',
      GOOD_MAP,
      '--to',
      'src-99',
    ]);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('Unknown source src-99');
  });

  it('fails with invalid-source-map for a garbage file', async () => {
    await cli(ctx, ['load', SINGLE_PROFILE]);

    const result = await cliFail(ctx, [
      'sourcemap',
      'apply',
      GARBAGE_MAP,
      '--json',
    ]);
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(
      result.stdout
    ) as WithContext<ApplySourceMapResult>;
    expect(parsed.type).toBe('sourcemap-error');
    expect((parsed as ErrorResult).error).toBe('invalid-source-map');
  });

  it('fails with no-eligible-sources when nothing carries a source map URL', async () => {
    await cli(ctx, ['load', NO_MAP_PROFILE]);

    const listResult = await cli(ctx, ['sourcemap', 'sources', '--json']);
    const list = JSON.parse(
      listResult.stdout
    ) as WithContext<SourceMapSourcesResult>;
    expect(list.sources).toHaveLength(0);

    const result = await cliFail(ctx, [
      'sourcemap',
      'apply',
      GOOD_MAP,
      '--json',
    ]);
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(
      result.stdout
    ) as WithContext<ApplySourceMapResult>;
    expect(parsed.type).toBe('sourcemap-error');
    expect((parsed as ErrorResult).error).toBe('no-eligible-sources');
  });

  it('errors for a missing map file before contacting the daemon', async () => {
    await cli(ctx, ['load', SINGLE_PROFILE]);

    const result = await cliFail(ctx, [
      'sourcemap',
      'apply',
      join(FIXTURES, 'does-not-exist.map'),
    ]);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('not found');
  });
});
