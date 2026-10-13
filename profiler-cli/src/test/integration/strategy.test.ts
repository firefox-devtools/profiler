/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for call tree summary strategies.
 */

import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

import type {
  StatusResult,
  StrategySelectResult,
  ThreadInfoResult,
  ThreadSamplesResult,
  WithContext,
} from '../../protocol';

/** A DHAT heap profile, i.e. native allocations with no timing samples. */
const ALLOCATION_PROFILE = 'src/test/fixtures/upgrades/dhat.json.gz';

describe('profiler-cli call tree summary strategies', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('an unknown --strategy is rejected with the list of valid ones', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cliFail(ctx, [
      'thread',
      'samples',
      '--strategy',
      'bogus',
    ]);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('--strategy must be one of:');
    expect(output).toContain('native-retained-allocations');
  });

  it('a strategy with no data in the thread is an error, not a fallback to timing', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cliFail(ctx, [
      'thread',
      'samples',
      '--strategy',
      'js-allocations',
    ]);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain("Strategy 'js-allocations' has no data");
    expect(output).toContain('Available: timing');
  });

  it('an allocation profile reports bytes and lists its available strategies', async () => {
    await cli(ctx, ['load', ALLOCATION_PROFILE]);

    const infoResult = await cli(ctx, ['thread', 'info', '--json']);
    const info = JSON.parse(infoResult.stdout) as WithContext<ThreadInfoResult>;
    expect(info.availableStrategies).toEqual([
      'native-allocations',
      'native-deallocations-sites',
    ]);

    const samplesResult = await cli(ctx, ['thread', 'samples', '--json']);
    const samples = JSON.parse(
      samplesResult.stdout
    ) as WithContext<ThreadSamplesResult>;
    expect(samples.weightType).toBe('bytes');
    // The thread has no timing samples, so the call tree falls forward to
    // native allocations even though the session setting is still timing.
    expect(samples.callTreeSummaryStrategy).toBe('native-allocations');
    expect(samples.context.callTreeSummaryStrategy).toBe('native-allocations');
  });

  it('an ephemeral --strategy does not persist into session state', async () => {
    await cli(ctx, ['load', ALLOCATION_PROFILE]);

    const samplesResult = await cli(ctx, [
      'thread',
      'samples',
      '--json',
      '--strategy',
      'native-deallocations-sites',
    ]);
    const samples = JSON.parse(
      samplesResult.stdout
    ) as WithContext<ThreadSamplesResult>;
    expect(samples.callTreeSummaryStrategy).toBe('native-deallocations-sites');

    const statusResult = await cli(ctx, ['status', '--json']);
    const status = JSON.parse(statusResult.stdout) as StatusResult;
    expect(status.callTreeSummaryStrategy).toBe('native-allocations');
  });

  it('the strategy command persists across commands', async () => {
    await cli(ctx, ['load', ALLOCATION_PROFILE]);

    const selectResult = await cli(ctx, [
      'strategy',
      'native-deallocations-sites',
      '--json',
    ]);
    const selected = JSON.parse(
      selectResult.stdout
    ) as WithContext<StrategySelectResult>;
    expect(selected.type).toBe('strategy-select');
    expect(selected.strategy).toBe('native-deallocations-sites');
    expect(selected.availableStrategies).toEqual([
      'native-allocations',
      'native-deallocations-sites',
    ]);

    const statusResult = await cli(ctx, ['status', '--json']);
    const status = JSON.parse(statusResult.stdout) as StatusResult;
    expect(status.callTreeSummaryStrategy).toBe('native-deallocations-sites');

    const samplesResult = await cli(ctx, ['thread', 'samples', '--json']);
    const samples = JSON.parse(
      samplesResult.stdout
    ) as WithContext<ThreadSamplesResult>;
    expect(samples.callTreeSummaryStrategy).toBe('native-deallocations-sites');
  });
});
