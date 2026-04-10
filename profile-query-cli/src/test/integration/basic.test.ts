/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Basic CLI functionality tests.
 * Migrated from bin/pq-test bash script.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  pq,
  pqFail,
  type PqTestContext,
} from './utils';

describe('pq basic functionality', () => {
  let ctx: PqTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  test('load creates a session', async () => {
    const result = await pq(ctx, [
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
    expect(files).toContain(`${sessionId}.sock`);
    expect(files).toContain(`${sessionId}.json`);
    expect(files).toContain('current.txt');
  });

  test('profile info works after load', async () => {
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await pq(ctx, ['profile', 'info']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  test('stop cleans up session', async () => {
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    await pq(ctx, ['stop']);

    // Verify socket is removed (the main cleanup requirement)
    const files = await readdir(ctx.sessionDir);
    expect(files.filter((f) => f.endsWith('.sock'))).toHaveLength(0);
  });

  test('load fails for missing file', async () => {
    const result = await pqFail(ctx, ['load', '/nonexistent/file.json']);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('not found');
  });

  test('profile info fails without active session', async () => {
    const result = await pqFail(ctx, ['profile', 'info']);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('No active session');
  });

  test('multiple profile info calls work (daemon stays running)', async () => {
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    // First call
    const result1 = await pq(ctx, ['profile', 'info']);
    expect(result1.exitCode).toBe(0);

    // Second call - should still work (daemon running)
    const result2 = await pq(ctx, ['profile', 'info']);
    expect(result2.exitCode).toBe(0);
    expect(result2.stdout).toEqual(result1.stdout);
  });

  test('numeric zero marker filters are preserved instead of being ignored', async () => {
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const minDurationResult = await pq(ctx, [
      'thread',
      'markers',
      '--json',
      '--min-duration',
      '0',
    ]);
    expect(minDurationResult.stdout).toContain('"minDuration": 0');

    const maxDurationResult = await pq(ctx, [
      'thread',
      'markers',
      '--json',
      '--max-duration',
      '0',
    ]);
    expect(maxDurationResult.stdout).toContain('"maxDuration": 0');
  });

  test('numeric zero function filters are preserved instead of being ignored', async () => {
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await pq(ctx, [
      'thread',
      'functions',
      '--json',
      '--min-self',
      '0',
    ]);

    expect(result.stdout).toContain('"minSelf": 0');
  });

  test('max-lines=0 is rejected instead of silently falling back to the default', async () => {
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await pqFail(ctx, [
      'thread',
      'samples-top-down',
      '--max-lines',
      '0',
    ]);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('--max-lines must be a positive integer');
  });

  test('build hash mismatch stops the daemon before cleaning up the session', async () => {
    const loadResult = await pq(ctx, [
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

    const result = await pqFail(ctx, ['profile', 'info']);
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
