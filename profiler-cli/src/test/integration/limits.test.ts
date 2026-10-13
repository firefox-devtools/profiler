/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for `--limit` and the other output limits.
 */

import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

import type {
  ThreadMarkersResult,
  ThreadNetworkResult,
  ThreadPageLoadResult,
  WithContext,
} from '../../protocol';

describe('profiler-cli output limits', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('max-lines=0 is rejected instead of silently falling back to the default', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cliFail(ctx, [
      'thread',
      'samples-top-down',
      '--max-lines',
      '0',
    ]);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('--max-lines must be a positive integer');
  });

  it('--limit 0 means "no limit" on every command that takes --limit', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    // `thread network` has always accepted 0; the others used to reject it.
    // They must now all agree, otherwise `--limit 0` stays a coin flip.
    for (const args of [
      ['thread', 'markers', '--list', '--limit', '0'],
      ['thread', 'markers', '--limit', '0'],
      ['thread', 'functions', '--limit', '0'],
      ['thread', 'network', '--limit', '0'],
      ['profile', 'logs', '--limit', '0'],
      ['thread', 'page-load', '--jank-limit', '0'],
    ]) {
      const result = await cli(ctx, args);
      const output = String(result.stdout || '') + String(result.stderr || '');
      expect({ args, exitCode: result.exitCode }).toEqual({
        args,
        exitCode: 0,
      });
      expect(output).not.toContain('must be a positive integer');
    }

    // "No limit" must actually mean everything, not an empty list: the fixture
    // thread has 3 markers.
    const all = await cli(ctx, [
      'thread',
      'markers',
      '--list',
      '--limit',
      '0',
      '--json',
    ]);
    const allResult = JSON.parse(
      all.stdout
    ) as WithContext<ThreadMarkersResult>;
    expect(allResult.flatMarkers).toHaveLength(allResult.filteredMarkerCount);
    expect(allResult.filteredMarkerCount).toBeGreaterThan(1);
  });

  // The `--limit 0` tests above use a fixture with one network request and no
  // jank, so they cannot tell "no limit" apart from "apply the default" — those
  // only diverge once there is more data than the default shows. This fixture
  // has 25 network requests and 24 jank periods on t-0, against defaults of 20
  // and 10 respectively, which is what makes the assertions below able to fail.
  const LIMIT_FIXTURE = 'profiler-cli/src/test/fixtures/limit-boundaries.json';

  it('network --limit 0 beats the built-in default of 20', async () => {
    await cli(ctx, ['load', LIMIT_FIXTURE]);

    const asJson = async (args: string[]) => {
      const result = await cli(ctx, args);
      expect(result.exitCode).toBe(0);
      return JSON.parse(result.stdout) as WithContext<ThreadNetworkResult>;
    };

    const base = ['thread', 'network', '--thread', 't-0', '--json'];

    const defaulted = await asJson(base);
    expect(defaulted.filteredRequestCount).toBe(25);
    expect(defaulted.requests).toHaveLength(20);

    const unlimited = await asJson([...base, '--limit', '0']);
    expect(unlimited.requests).toHaveLength(25);

    const windowed = await asJson([...base, '--limit', '5']);
    expect(windowed.requests).toHaveLength(5);

    // And the truncated default must point at the escape hatch.
    const text = await cli(ctx, ['thread', 'network', '--thread', 't-0']);
    expect(text.stdout).toContain('--limit 0');
  });

  it('page-load --jank-limit 0 beats the built-in default of 10', async () => {
    // This is the one sentinel that is genuinely load-bearing: `collectPageLoad`
    // does `options.jankLimit ?? 10`, so forwarding an explicit 0 as "unset"
    // silently reinstates the default. Without a fixture that has more than 10
    // jank periods, that regression is invisible.
    await cli(ctx, ['load', LIMIT_FIXTURE]);

    const asJson = async (args: string[]) => {
      const result = await cli(ctx, args);
      expect(result.exitCode).toBe(0);
      return JSON.parse(result.stdout) as WithContext<ThreadPageLoadResult>;
    };

    const base = ['thread', 'page-load', '--thread', 't-0', '--json'];

    const defaulted = await asJson(base);
    expect(defaulted.jankTotal).toBe(24);
    expect(defaulted.jankPeriods).toHaveLength(10);

    const unlimited = await asJson([...base, '--jank-limit', '0']);
    expect(unlimited.jankPeriods).toHaveLength(24);

    const windowed = await asJson([...base, '--jank-limit', '3']);
    expect(windowed.jankPeriods).toHaveLength(3);

    // The truncated default must say so and name the escape hatch.
    const text = await cli(ctx, ['thread', 'page-load', '--thread', 't-0']);
    expect(text.stdout).toContain('Showing 10 of 24 jank periods');
    expect(text.stdout).toContain('--jank-limit 0');
  });

  it('a negative or non-numeric --limit is still rejected', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    for (const value of ['-1', 'abc']) {
      const result = await cliFail(ctx, [
        'thread',
        'markers',
        '--list',
        '--limit',
        value,
      ]);
      expect(result.exitCode).not.toBe(0);
      const output = String(result.stdout || '') + String(result.stderr || '');
      expect(output).toContain(
        '--limit must be a non-negative integer (0 = no limit)'
      );
    }
  });

  it('a truncated marker list says so and points at --limit 0', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, [
      'thread',
      'markers',
      '--list',
      '--limit',
      '1',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('more markers omitted');
    expect(result.stdout).toContain('showing the first 1 of 3');
    expect(result.stdout).toContain('--limit 0');
  });

  it('profile markers requires a filter, but --limit opts into browsing', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    // An unfiltered sweep would dump arbitrary rows in profile order, which
    // answers no question; the error has to name the flags that do.
    const bare = await cliFail(ctx, ['profile', 'markers']);
    expect(bare.exitCode).not.toBe(0);
    const output = String(bare.stdout || '') + String(bare.stderr || '');
    expect(output).toContain('profile markers needs a filter');
    expect(output).toContain('--search');

    // A filter satisfies it...
    const filtered = await cli(ctx, ['profile', 'markers', '--search', 'a']);
    expect(filtered.exitCode).toBe(0);

    // ...and so does an explicit --limit, the opt-in to unfiltered browsing.
    const limited = await cli(ctx, ['profile', 'markers', '--limit', '5']);
    expect(limited.exitCode).toBe(0);
  });
});
