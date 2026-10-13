/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for filters and sample breakdowns.
 */

import {
  createTestContext,
  cleanupTestContext,
  cli,
  type CliTestContext,
} from './utils';

import type {
  FilterStackResult,
  FunctionInfoResult,
  StatusResult,
  ThreadSamplesResult,
  WithContext,
} from '../../protocol';

describe('profiler-cli filters and sample breakdowns', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('numeric zero marker filters are preserved instead of being ignored', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const minDurationResult = await cli(ctx, [
      'thread',
      'markers',
      '--json',
      '--min-duration',
      '0',
    ]);
    expect(minDurationResult.stdout).toContain('"minDuration": 0');

    const maxDurationResult = await cli(ctx, [
      'thread',
      'markers',
      '--json',
      '--max-duration',
      '0',
    ]);
    expect(maxDurationResult.stdout).toContain('"maxDuration": 0');
  });

  it('numeric zero function filters are preserved instead of being ignored', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, [
      'thread',
      'functions',
      '--json',
      '--min-self',
      '0',
    ]);

    expect(result.stdout).toContain('"minSelf": 0');
  });

  it('sticky filters are isolated per thread and reported in status', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    await cli(ctx, ['thread', 'select', 't-0']);

    await cli(ctx, ['filter', 'push', '--merge', 'f-1,f-2']);

    const filterListResult = await cli(ctx, ['filter', 'list', '--json']);
    const filterList = JSON.parse(filterListResult.stdout) as FilterStackResult;

    expect(filterList.type).toBe('filter-stack');
    expect(filterList.threadHandle).toBe('t-0');
    // Multi-func push collapses into one entry backed by multiple transforms.
    expect(filterList.filters).toHaveLength(1);
    expect(filterList.filters[0].transforms).toEqual([
      { type: 'merge-function', funcIndex: 1 },
      { type: 'merge-function', funcIndex: 2 },
    ]);
    expect(filterList.filters[0].description).toBe('merge: f-1, f-2');

    const statusResult = await cli(ctx, ['status', '--json']);
    const status = JSON.parse(statusResult.stdout) as StatusResult;

    expect(status.type).toBe('status');
    expect(status.filterStacks).toHaveLength(1);
    expect(status.filterStacks[0]).toEqual(
      expect.objectContaining({
        threadHandle: 't-0',
        filters: [
          expect.objectContaining({
            transforms: [
              { type: 'merge-function', funcIndex: 1 },
              { type: 'merge-function', funcIndex: 2 },
            ],
          }),
        ],
      })
    );

    await cli(ctx, ['thread', 'select', 't-1']);

    const otherThreadFilterListResult = await cli(ctx, [
      'filter',
      'list',
      '--json',
    ]);
    const otherThreadFilterList = JSON.parse(
      otherThreadFilterListResult.stdout
    ) as FilterStackResult;

    expect(otherThreadFilterList.threadHandle).toBe('t-1');
    expect(otherThreadFilterList.filters).toHaveLength(0);

    const explicitThreadFilterListResult = await cli(ctx, [
      'filter',
      'list',
      '--thread',
      't-0',
      '--json',
    ]);
    const explicitThreadFilterList = JSON.parse(
      explicitThreadFilterListResult.stdout
    ) as FilterStackResult;

    expect(explicitThreadFilterList.threadHandle).toBe('t-0');
    expect(explicitThreadFilterList.filters).toHaveLength(1);
    expect(explicitThreadFilterList.filters[0].transforms).toEqual([
      { type: 'merge-function', funcIndex: 1 },
      { type: 'merge-function', funcIndex: 2 },
    ]);

    // One pop removes the whole entry (both underlying transforms).
    await cli(ctx, ['filter', 'pop', '--thread', 't-0']);
    const afterPopResult = await cli(ctx, [
      'filter',
      'list',
      '--thread',
      't-0',
      '--json',
    ]);
    const afterPop = JSON.parse(afterPopResult.stdout) as FilterStackResult;
    expect(afterPop.filters).toHaveLength(0);
  });

  it('filter push supports --during-marker with --search', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    await cli(ctx, ['thread', 'select', 't-0']);

    await cli(ctx, ['filter', 'push', '--during-marker', '--search', 'Reflow']);

    const filterListResult = await cli(ctx, ['filter', 'list', '--json']);
    const filterList = JSON.parse(filterListResult.stdout) as FilterStackResult;

    expect(filterList.filters).toHaveLength(1);
    expect(filterList.filters[0].transforms).toEqual([
      { type: 'filter-samples', filterType: 'marker-search', filter: 'Reflow' },
    ]);
    expect(filterList.filters[0].description).toBe(
      'during marker matching: "Reflow"'
    );
  });

  it('ephemeral sample filters do not persist into session state', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const samplesResult = await cli(ctx, [
      'thread',
      'samples',
      '--json',
      '--merge',
      'f-1',
    ]);
    const samples = JSON.parse(
      samplesResult.stdout
    ) as WithContext<ThreadSamplesResult>;

    expect(samples.type).toBe('thread-samples');
    expect(samples.ephemeralFilters).toEqual([
      { type: 'merge', funcIndexes: [1] },
    ]);
    expect(samples.activeFilters).toBeUndefined();

    const filterListResult = await cli(ctx, ['filter', 'list', '--json']);
    const filterList = JSON.parse(filterListResult.stdout) as FilterStackResult;
    expect(filterList.filters).toHaveLength(0);

    const statusResult = await cli(ctx, ['status', '--json']);
    const status = JSON.parse(statusResult.stdout) as StatusResult;
    expect(status.filterStacks).toHaveLength(0);
  });

  it('thread samples breaks the samples down by category', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const textResult = await cli(ctx, ['thread', 'samples']);
    expect(textResult.stdout).toContain('──── Categories (');

    const jsonResult = await cli(ctx, ['thread', 'samples', '--json']);
    const samples = JSON.parse(
      jsonResult.stdout
    ) as WithContext<ThreadSamplesResult>;
    const breakdown = samples.categoryBreakdown;

    expect(breakdown.categories.length).toBeGreaterThan(0);
    const summed = breakdown.categories.reduce(
      (accum, category) => accum + category.samples,
      0
    );
    expect(summed).toBe(breakdown.totalSamples);
  });

  it('function info reports running and self breakdowns', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['function', 'info', 'f-5', '--json']);
    const info = JSON.parse(result.stdout) as WithContext<FunctionInfoResult>;
    const breakdowns = info.categoryBreakdown;

    expect(breakdowns.threadHandle).toBe('t-2');
    expect(breakdowns.running.samples).toBeGreaterThan(0);
    expect(breakdowns.running.samples).toBeGreaterThanOrEqual(
      breakdowns.self.samples
    );
  });
});
