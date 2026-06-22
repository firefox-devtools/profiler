/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * CLI counter command tests.
 */

import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

import type {
  CounterListResult,
  CounterInfoResult,
  WithContext,
} from '../../protocol';

// processed-3.json has a single Memory counter (name "malloc", category "Memory").
const PROFILE_WITH_COUNTER = 'src/test/fixtures/upgrades/processed-3.json';
// processed-1.json has no counters.
const PROFILE_WITHOUT_COUNTER = 'src/test/fixtures/upgrades/processed-1.json';

describe('profiler-cli counter commands', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('counter list shows the memory counter', async () => {
    await cli(ctx, ['load', PROFILE_WITH_COUNTER]);

    const result = await cli(ctx, ['counter', 'list']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Counters (1)');
    expect(result.stdout).toContain('c-0');
    expect(result.stdout).toContain('Memory');
  });

  it('counter list --json returns structured data', async () => {
    await cli(ctx, ['load', PROFILE_WITH_COUNTER]);

    const result = await cli(ctx, ['counter', 'list', '--json']);
    const parsed = JSON.parse(result.stdout) as WithContext<CounterListResult>;

    expect(parsed.type).toBe('counter-list');
    expect(parsed.counters).toHaveLength(1);
    const counter = parsed.counters[0];
    expect(counter.counterHandle).toBe('c-0');
    expect(counter.label).toBe('Memory');
    expect(counter.category).toBe('Memory');
    expect(counter.unit).toBe('bytes');
    expect(counter.graphType).toBe('line-accumulated');
    expect(counter.mainThreadHandle).toMatch(/^t-\d+$/);

    // The Memory tooltip schema exposes a single range-aggregate row,
    // "memory range in graph" (source count-range), formatted in bytes.
    const rangeStat = counter.stats.find((s) => s.source === 'count-range');
    expect(rangeStat).toBeDefined();
    expect(rangeStat!.label).toContain('memory range');
    expect(rangeStat!.formattedValue).toMatch(/B$|KB$|MB$|GB$/);
  });

  it('counter info shows details for a counter', async () => {
    await cli(ctx, ['load', PROFILE_WITH_COUNTER]);

    const result = await cli(ctx, ['counter', 'info', 'c-0']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Counter c-0: Memory');
    expect(result.stdout).toContain('Category: Memory');
    expect(result.stdout).toContain('Unit: bytes');
    expect(result.stdout).toContain('Amount of allocated memory');
  });

  it('counter info --json includes detail fields', async () => {
    await cli(ctx, ['load', PROFILE_WITH_COUNTER]);

    const result = await cli(ctx, ['counter', 'info', 'c-0', '--json']);
    const parsed = JSON.parse(result.stdout) as WithContext<CounterInfoResult>;

    expect(parsed.type).toBe('counter-info');
    expect(parsed.counterHandle).toBe('c-0');
    expect(parsed.description).toBe('Amount of allocated memory');
    expect(parsed.sampleCount).toBeGreaterThan(0);
    expect(parsed.stats.some((s) => s.source === 'count-range')).toBe(true);
  });

  it('counter list reports when a profile has no counters', async () => {
    await cli(ctx, ['load', PROFILE_WITHOUT_COUNTER]);

    const result = await cli(ctx, ['counter', 'list']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No counters in this profile.');
  });

  it('counter info fails cleanly for an unknown handle', async () => {
    await cli(ctx, ['load', PROFILE_WITHOUT_COUNTER]);

    const result = await cliFail(ctx, ['counter', 'info', 'c-0']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Unknown counter c-0');
  });
});
