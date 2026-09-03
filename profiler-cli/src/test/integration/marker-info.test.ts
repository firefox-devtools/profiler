/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for `marker info` accepting several handles. These run
 * through the real command layer: the single-vs-multi routing, the `--json`
 * shape it selects, and the exit code are only observable from outside.
 */

import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

import type {
  MarkerInfoResult,
  MarkerInfoMultiResult,
  WithContext,
} from '../../protocol';

const FIXTURE = 'src/test/fixtures/upgrades/processed-1.json';

describe('marker info with several handles', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await cli(ctx, ['load', FIXTURE]);
    // Listing the markers is what mints the m-N handles. The fixture thread has
    // three markers, so this yields m-1, m-2 and m-3.
    await cli(ctx, ['thread', 'markers', '--list']);
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  async function markerInfoJson(args: string[]) {
    const result = await cli(ctx, ['marker', 'info', ...args, '--json']);
    return JSON.parse(result.stdout);
  }

  it('returns the single-marker shape for one handle', async () => {
    const parsed: WithContext<MarkerInfoResult> = await markerInfoJson(['m-1']);

    // This is the back-compat contract: one handle must not get the wrapper.
    expect(parsed.type).toBe('marker-info');
    expect(parsed.markerHandle).toBe('m-1');
    expect(parsed).not.toHaveProperty('markers');
  });

  it('returns the single-marker shape for the legacy --marker flag', async () => {
    const parsed: WithContext<MarkerInfoResult> = await markerInfoJson([
      '--marker',
      'm-1',
    ]);

    expect(parsed.type).toBe('marker-info');
    expect(parsed.markerHandle).toBe('m-1');
  });

  it.each([['m-1,'], [',m-1'], ['m-1..m-1'], ['m-1..1'], [' m-1']])(
    'returns the single-marker shape for %p, which means one marker',
    async (spec) => {
      const parsed: WithContext<MarkerInfoResult> = await markerInfoJson([
        spec,
      ]);

      expect(parsed.type).toBe('marker-info');
      expect(parsed.markerHandle).toBe('m-1');
    }
  );

  it('returns the multi shape for several handles', async () => {
    const parsed: WithContext<MarkerInfoMultiResult> = await markerInfoJson([
      'm-1',
      'm-2',
    ]);

    expect(parsed.type).toBe('marker-info-multi');
    expect(parsed.requested).toEqual(['m-1', 'm-2']);
    expect(parsed.markers.map((m) => m.markerHandle)).toEqual(['m-1', 'm-2']);
    expect(parsed.errors).toEqual([]);
  });

  it('returns the multi shape for a range', async () => {
    const parsed: WithContext<MarkerInfoMultiResult> = await markerInfoJson([
      'm-1..m-3',
    ]);

    expect(parsed.type).toBe('marker-info-multi');
    expect(parsed.requested).toEqual(['m-1', 'm-2', 'm-3']);
  });

  it('prints one record per handle in text mode', async () => {
    const result = await cli(ctx, ['marker', 'info', 'm-1', 'm-2']);

    expect(result.stdout).toContain('[1/2] Marker m-1:');
    expect(result.stdout).toContain('[2/2] Marker m-2:');
    expect(result.stdout).toContain('----------');
    // The session banner is printed once, not per record.
    const banners = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('[Thread:'));
    expect(banners).toHaveLength(1);
  });

  it('reports an unknown handle per handle, keeps the rest, and exits 1', async () => {
    const result = await cliFail(ctx, [
      'marker',
      'info',
      'm-1',
      'm-9999',
      'm-2',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('[1/3] Marker m-1:');
    expect(result.stdout).toContain(
      '[2/3] Marker m-9999: error: Unknown marker m-9999'
    );
    expect(result.stdout).toContain('[3/3] Marker m-2:');
    expect(result.stdout).toContain('1 of 3 requested markers was not found.');
  });

  it('fails the whole command on a malformed spec', async () => {
    const result = await cliFail(ctx, ['marker', 'info', 'm-1', 'bogus']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      'Invalid marker handle bogus'
    );
    // Nothing was printed for the valid handle.
    expect(result.stdout).not.toContain('Marker m-1:');
  });

  it('fails the whole command on a reversed range', async () => {
    const result = await cliFail(ctx, ['marker', 'info', 'm-3..m-1']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      'end m-1 is before start m-3'
    );
  });

  it('still requires a handle', async () => {
    const result = await cliFail(ctx, ['marker', 'info']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      'marker handle required for marker info'
    );
  });

  it('rejects an absurdly wide range instead of expanding it', async () => {
    const result = await cliFail(ctx, ['marker', 'info', 'm-1..m-999999']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('more than the maximum of');
  });

  it('tells the user that marker stack does not take ranges', async () => {
    const result = await cliFail(ctx, ['marker', 'stack', 'm-1..m-2']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      'marker stack takes a single handle'
    );
    // The old message read like a bad handle rather than unsupported syntax.
    expect(result.stdout + result.stderr).not.toContain('Unknown marker');
  });

  it('still accepts a single handle for marker stack', async () => {
    // m-2 is the fixture's Reflow marker, the one with a stack.
    const result = await cli(ctx, ['marker', 'stack', 'm-2']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('m-2');
  });
});
