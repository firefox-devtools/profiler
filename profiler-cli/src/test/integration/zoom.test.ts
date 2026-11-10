/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createTestContext,
  cleanupTestContext,
  cli,
  type CliTestContext,
} from './utils';
import type {
  StatusResult,
  ThreadSamplesResult,
  WithContext,
} from '../../protocol';

describe('profiler-cli zoom', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    await cli(ctx, ['thread', 'select', 't-0']);
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('restores sample results and searches after zoom changes', async () => {
    async function query(search?: string) {
      const result = await cli(ctx, [
        'thread',
        'samples',
        '--include-idle',
        '--json',
        ...(search ? ['--search', search] : []),
      ]);
      return JSON.parse(result.stdout) as WithContext<ThreadSamplesResult>;
    }

    const baseline = await query();
    const baselineSearch = await query('Startup::XRE_Main');
    expect(baseline.context.currentViewRange).toBeNull();

    await cli(ctx, ['zoom', 'push', '0ms,5ms']);
    const outer = await query();
    const outerSearch = await query('Startup::XRE_Main');

    await cli(ctx, ['zoom', 'push', '0ms,2ms']);
    await query();
    await query('Startup::XRE_Main');
    await cli(ctx, ['zoom', 'pop']);
    expect(await query()).toEqual(outer);
    expect(await query('Startup::XRE_Main')).toEqual(outerSearch);

    await cli(ctx, ['zoom', 'push', '0ms,2ms']);
    await query();
    await cli(ctx, ['zoom', 'clear']);
    const status = await cli(ctx, ['status', '--json']);
    expect((JSON.parse(status.stdout) as StatusResult).viewRanges).toEqual([]);
    expect(await query()).toEqual(baseline);
    expect(await query('Startup::XRE_Main')).toEqual(baselineSearch);

    await cli(ctx, ['zoom', 'push', '0ms,2ms']);
    await cli(ctx, ['zoom', 'pop']);
    expect(await query()).toEqual(baseline);
    expect(await query('Startup::XRE_Main')).toEqual(baselineSearch);
  });
});
