/**
 * Basic CLI functionality tests.
 * Migrated from bin/pq-test bash script.
 */

import { readdir } from 'fs/promises';
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
});
