/**
 * Multi-session tests.
 * Migrated from bin/pq-test-multi bash script.
 */

import {
  createTestContext,
  cleanupTestContext,
  pq,
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

  test('can run multiple sessions with explicit IDs', async () => {
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

  test('list-sessions shows running sessions', async () => {
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

  test('stop --all stops all sessions', async () => {
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
});
