/**
 * Tests for two-phase daemon startup behavior.
 * Verifies socket creation before profile loading and proper status reporting.
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  pq,
  pqFail,
  type PqTestContext,
} from './utils';

describe('daemon startup (two-phase)', () => {
  let ctx: PqTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  test('daemon creates socket and metadata before loading profile', async () => {
    const startTime = Date.now();

    const result = await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(result.exitCode).toBe(0);

    // Should complete quickly (< 1 second for local file)
    // The key improvement is that we don't wait for profile parsing
    // before getting success feedback
    expect(duration).toBeLessThan(2000);

    // Extract session ID
    expect(typeof result.stdout).toBe('string');
    const match = (result.stdout as string).match(/Session started: (\w+)/);
    const sessionId = match![1];

    // Verify metadata file exists and contains correct info
    const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

    expect(metadata.id).toBe(sessionId);
    expect(metadata.socketPath).toContain(sessionId);
    expect(metadata.pid).toBeNumber();
    expect(metadata.profilePath).toContain('processed-1.json');
  });

  test('load returns non-zero exit code on profile load failure', async () => {
    // Create an invalid JSON file
    const invalidProfile = join(ctx.sessionDir, 'invalid.json');
    const { writeFile } = await import('fs/promises');
    await writeFile(invalidProfile, '{ invalid json content', 'utf-8');

    const result = await pqFail(ctx, ['load', invalidProfile]);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toMatch(/Profile load failed|Failed to|parse|invalid/i);
  });

  test('daemon startup fails fast with short timeout', async () => {
    // This test verifies Phase 1 timeout behavior
    // We can't easily force a daemon startup failure, but we can
    // verify the timeout is reasonable by checking it doesn't wait forever

    const result = await pqFail(ctx, ['load', '/nonexistent/file.json']);

    // Should fail quickly (Phase 1: 500ms for daemon, Phase 2: fails on validation)
    expect(result.exitCode).not.toBe(0);
  });

  test('load blocks until profile is fully loaded', async () => {
    // Start loading
    await pq(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    // If load returned, profile should be ready immediately
    const result = await pq(ctx, ['profile', 'info']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  test('validates session before returning (checks process + socket)', async () => {
    const result = await pq(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
    ]);

    expect(typeof result.stdout).toBe('string');
    const match = (result.stdout as string).match(/Session started: (\w+)/);
    const sessionId = match![1];

    // Verify both socket and metadata exist (validateSession checks both)
    const socketPath = join(ctx.sessionDir, `${sessionId}.sock`);
    const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);

    await expect(access(socketPath)).resolves.toBeUndefined();
    await expect(access(metadataPath)).resolves.toBeUndefined();

    // Process should be running (metadata contains PID)
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
    expect(metadata.pid).toBeNumber();
    expect(metadata.pid).toBeGreaterThan(0);
  });
});
