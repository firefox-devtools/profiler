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

import type {
  ProfileMetaResult,
  SessionMetadata,
  ThreadListResult,
  WithContext,
} from '../../protocol';

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

  it('permalink refuses a profile loaded from a local file', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cliFail(ctx, ['permalink']);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('Publishing from profiler-cli is not supported');
  });

  it('profile info works after load', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['profile', 'info']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  it('profile meta works after load', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['profile', 'meta']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Recording:');
    expect(result.stdout).toContain('Sampling interval:');
  });

  it('profile meta --json returns typed structured output', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['profile', 'meta', '--json']);

    expect(result.exitCode).toBe(0);
    const meta = JSON.parse(result.stdout) as WithContext<ProfileMetaResult>;
    expect(meta.type).toBe('profile-meta');
    expect(typeof meta.product).toBe('string');
    expect(typeof meta.interval).toBe('number');
  });

  it('thread select works immediately after load', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cli(ctx, ['thread', 'select', 't-0']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Selected thread');
    expect(result.stdout).toContain('t-0');
  });

  it('thread list prints a flat table', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const list = await cli(ctx, ['thread', 'list']);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain('HANDLE');
    expect(list.stdout).toContain('MARKERS');
    expect(list.stdout).toContain('t-0');

    const json = await cli(ctx, ['thread', 'list', '--json']);
    const result = JSON.parse(json.stdout) as WithContext<ThreadListResult>;
    expect(result.type).toBe('thread-list');
    expect(result.threads.length).toBe(result.totalThreadCount);
    expect(result.sort).toBe('cpu');
    expect(result.threads[0].threadHandle).toBe('t-0');
    expect(typeof result.threads[0].markerCount).toBe('number');
  });

  it('thread list rejects an unknown --sort', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const result = await cliFail(ctx, ['thread', 'list', '--sort', 'bogus']);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('--sort must be one of');
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
    const metadata = JSON.parse(
      await readFile(metadataPath, 'utf-8')
    ) as SessionMetadata;

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
