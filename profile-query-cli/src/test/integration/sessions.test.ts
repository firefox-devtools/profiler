/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Multi-session tests.
 * Migrated from bin/pq-test-multi bash script.
 */

import { access, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  pq,
  pqFail,
  type PqTestContext,
} from './utils';

describe('pq multiple concurrent sessions', () => {
  let ctx: PqTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('can run multiple sessions with explicit IDs', async () => {
    const session1 = 'test-session-1';
    const session2 = 'test-session-2';
    const session3 = 'test-session-3';

    // Start three sessions
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      session1,
    ]);
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      session2,
    ]);
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-3.json',
      '--session',
      session3,
    ]);

    // Query each session explicitly
    const result1 = await pq(ctx, ['profile', 'info', '--session', session1]);
    expect(result1.stdout).toContain('This profile contains');

    const result2 = await pq(ctx, ['profile', 'info', '--session', session2]);
    expect(result2.stdout).toContain('This profile contains');

    // Query current session (should be session3)
    const result3 = await pq(ctx, ['profile', 'info']);
    expect(result3.stdout).toContain('This profile contains');

    // Note: We don't assert that results differ, as different test profiles
    // might coincidentally have identical summaries.

    // Stop all sessions
    await pq(ctx, ['stop', '--session', session1]);
    await pq(ctx, ['stop', '--session', session2]);
    await pq(ctx, ['stop', '--session', session3]);
  });

  it('list-sessions shows running sessions', async () => {
    // Start two sessions
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      'session-a',
    ]);
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      'session-b',
    ]);

    // List sessions
    const result = await pq(ctx, ['list-sessions']);

    expect(result.stdout).toContain('Found 2 running sessions');
    expect(result.stdout).toContain('session-a');
    expect(result.stdout).toContain('session-b');

    // Clean up
    await pq(ctx, ['stop', '--all']);
  });

  it('stop --all stops all sessions', async () => {
    // Start multiple sessions
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      'session-1',
    ]);
    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      'session-2',
    ]);

    // Stop all
    await pq(ctx, ['stop', '--all']);

    // Verify no sessions
    const result = await pq(ctx, ['list-sessions']);
    expect(result.stdout).toContain('Found 0 running sessions');
  });

  it('reusing a live explicit session id fails without replacing the daemon', async () => {
    const sessionId = 'shared-session';

    await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      sessionId,
    ]);

    const secondLoad = await pqFail(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      sessionId,
    ]);

    expect(secondLoad.exitCode).not.toBe(0);
    const output =
      String(secondLoad.stdout || '') + String(secondLoad.stderr || '');
    expect(output).toContain(`Session ${sessionId} is already running`);

    const result = await pq(ctx, ['profile', 'info', '--session', sessionId]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  it('list-sessions cleans up stale session metadata files', async () => {
    const staleSessionId = 'stale-session';
    const metadataPath = join(ctx.sessionDir, `${staleSessionId}.json`);
    const socketPath = join(ctx.sessionDir, `${staleSessionId}.sock`);
    const currentPath = join(ctx.sessionDir, 'current.txt');

    if (process.platform !== 'win32') {
      // Named pipes on Windows are not filesystem files
      await writeFile(socketPath, '', 'utf-8');
    }
    await writeFile(currentPath, staleSessionId, 'utf-8');
    await writeFile(
      metadataPath,
      JSON.stringify({
        id: staleSessionId,
        socketPath,
        logPath: join(ctx.sessionDir, `${staleSessionId}.log`),
        pid: 999999,
        profilePath: '/tmp/does-not-exist.json',
        createdAt: '2026-04-11T00:00:00.000Z',
        buildHash: 'stale-build',
      }),
      'utf-8'
    );

    const result = await pq(ctx, ['list-sessions']);

    expect(result.stdout).toContain('Cleaned up 1 stale sessions.');
    expect(result.stdout).toContain('Found 0 running sessions');

    await expect(access(metadataPath)).rejects.toThrow();
    await expect(access(socketPath)).rejects.toThrow();
    await expect(access(currentPath)).rejects.toThrow();
  });
});
