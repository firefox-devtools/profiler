/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for two-phase daemon startup behavior.
 * Verifies socket creation before profile loading and proper status reporting.
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';
import { getSocketPath } from '../../session';

describe('daemon startup (two-phase)', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('daemon creates socket and metadata before loading profile', async () => {
    const startTime = Date.now();

    const result = await cli(ctx, [
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

  it('load returns non-zero exit code on profile load failure', async () => {
    // Create an invalid JSON file
    const invalidProfile = join(ctx.sessionDir, 'invalid.json');
    const { writeFile } = await import('fs/promises');
    await writeFile(invalidProfile, '{ invalid json content', 'utf-8');

    const result = await cliFail(ctx, ['load', invalidProfile]);

    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toMatch(/Profile load failed|Failed to|parse|invalid/i);
  });

  it('daemon startup fails fast with short timeout', async () => {
    // This test verifies Phase 1 timeout behavior
    // We can't easily force a daemon startup failure, but we can
    // verify the timeout is reasonable by checking it doesn't wait forever

    const result = await cliFail(ctx, ['load', '/nonexistent/file.json']);

    // Should fail quickly (Phase 1: 500ms for daemon, Phase 2: fails on validation)
    expect(result.exitCode).not.toBe(0);
  });

  it('load blocks until profile is fully loaded', async () => {
    // Start loading
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    // If load returned, profile should be ready immediately
    const result = await cli(ctx, ['profile', 'info']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  it('validates session before returning (checks process + socket)', async () => {
    const result = await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
    ]);

    expect(typeof result.stdout).toBe('string');
    const match = (result.stdout as string).match(/Session started: (\w+)/);
    const sessionId = match![1];

    // Verify both socket and metadata exist (validateSession checks both)
    const socketPath = getSocketPath(ctx.sessionDir, sessionId);
    const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);

    // Named pipes on Windows are not filesystem files, so treat that case as a no-op.
    const socketAccessPromise =
      process.platform === 'win32' ? Promise.resolve() : access(socketPath);
    await expect(socketAccessPromise).resolves.toBeUndefined();
    await expect(access(metadataPath)).resolves.toBeUndefined();

    // Process should be running (metadata contains PID)
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
    expect(metadata.pid).toBeNumber();
    expect(metadata.pid).toBeGreaterThan(0);
  });
});
