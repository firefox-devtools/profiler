/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Basic CLI functionality tests.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

describe('profiler-cli basic functionality', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('load creates a session', async () => {
    const result = await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Loading profile from');
    expect(result.stdout).toContain('Session started:');

    // Extract session ID
    expect(typeof result.stdout).toBe('string');
    const match = (result.stdout as string).match(/Session started: (\w+)/);
    expect(match).toBeTruthy();
    const sessionId = match![1];

    // Verify session files exist
    const files = await readdir(ctx.sessionDir);
    // Named pipes on Windows are not filesystem files, so no .sock file is created
    const expectedFiles = [
      `${sessionId}.json`,
      ...(process.platform !== 'win32' ? [`${sessionId}.sock`] : []),
    ];
    expect(files).toEqual(expect.arrayContaining(expectedFiles));
    expect(files).toContain('current.txt');
  });

  it('profile info works after load', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['profile', 'info']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  it('thread select works immediately after load', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['thread', 'select', 't-0']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Selected thread');
    expect(result.stdout).toContain('t-0');
  });

  it('stop cleans up session', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    await cli(ctx, ['stop']);

    // Verify socket is removed (the main cleanup requirement)
    const files = await readdir(ctx.sessionDir);
    expect(files.filter((f) => f.endsWith('.sock'))).toHaveLength(0);
  });

  it('load fails for missing file', async () => {
    const result = await cliFail(ctx, ['load', '/nonexistent/file.json']);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('not found');
  });

  it('profile info fails without active session', async () => {
    const result = await cliFail(ctx, ['profile', 'info']);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('No active session');
  });

  it('multiple profile info calls work (daemon stays running)', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    // First call
    const result1 = await cli(ctx, ['profile', 'info']);
    expect(result1.exitCode).toBe(0);

    // Second call - should still work (daemon running)
    const result2 = await cli(ctx, ['profile', 'info']);
    expect(result2.exitCode).toBe(0);
    expect(result2.stdout).toEqual(result1.stdout);
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
    const filterList = JSON.parse(filterListResult.stdout) as {
      type: string;
      threadHandle: string;
      filters: Array<{
        index: number;
        transforms: Array<{ type: string; funcIndex?: number }>;
        description: string;
      }>;
    };

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
    const status = JSON.parse(statusResult.stdout) as {
      type: string;
      filterStacks: Array<{
        threadHandle: string;
        filters: Array<{
          transforms: Array<{ type: string; funcIndex?: number }>;
        }>;
      }>;
    };

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
    ) as {
      threadHandle: string;
      filters: unknown[];
    };

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
    ) as {
      threadHandle: string;
      filters: Array<{
        transforms: Array<{ type: string; funcIndex?: number }>;
      }>;
    };

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
    const afterPop = JSON.parse(afterPopResult.stdout) as {
      filters: unknown[];
    };
    expect(afterPop.filters).toHaveLength(0);
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
    const samples = JSON.parse(samplesResult.stdout) as {
      type: string;
      ephemeralFilters?: Array<{ type: string; funcIndexes?: number[] }>;
      activeFilters?: unknown[];
    };

    expect(samples.type).toBe('thread-samples');
    expect(samples.ephemeralFilters).toEqual([
      { type: 'merge', funcIndexes: [1] },
    ]);
    expect(samples.activeFilters).toBeUndefined();

    const filterListResult = await cli(ctx, ['filter', 'list', '--json']);
    const filterList = JSON.parse(filterListResult.stdout) as {
      filters: unknown[];
    };
    expect(filterList.filters).toHaveLength(0);

    const statusResult = await cli(ctx, ['status', '--json']);
    const status = JSON.parse(statusResult.stdout) as {
      filterStacks: unknown[];
    };
    expect(status.filterStacks).toHaveLength(0);
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

  it('build hash mismatch stops the daemon before cleaning up the session', async () => {
    const loadResult = await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
    ]);

    expect(typeof loadResult.stdout).toBe('string');
    const match = loadResult.stdout.match(/Session started: (\w+)/);
    expect(match).toBeTruthy();
    const sessionId = match![1];

    const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8')) as {
      buildHash: string;
      pid: number;
    };

    await writeFile(
      metadataPath,
      JSON.stringify({ ...metadata, buildHash: 'intentionally-mismatched' })
    );

    const result = await cliFail(ctx, ['profile', 'info']);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('was built with a different version');
    expect(output).toContain('The daemon is no longer running');

    await expectDaemonToExit(metadata.pid);

    const files = await readdir(ctx.sessionDir);
    expect(files).not.toContain(`${sessionId}.json`);
    expect(files).not.toContain(`${sessionId}.sock`);
  });
});

async function expectDaemonToExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!isProcessRunning(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Daemon process ${pid} did not exit in time`);
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
