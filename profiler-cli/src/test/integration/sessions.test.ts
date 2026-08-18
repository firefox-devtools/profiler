/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Multi-session tests.
 */

import { access, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

describe('profiler-cli multiple concurrent sessions', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('can run multiple sessions with explicit IDs', async () => {
    const session1 = 'test-session-1';
    const session2 = 'test-session-2';

    // Start two sessions
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      session1,
    ]);
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      session2,
    ]);

    // Query session1 explicitly
    const result1 = await cli(ctx, ['profile', 'info', '--session', session1]);
    expect(result1.stdout).toContain('This profile contains');

    // Query current session (should be session2, the last loaded)
    const result2 = await cli(ctx, ['profile', 'info']);
    expect(result2.stdout).toContain('This profile contains');

    // Stop all sessions (mix of positional arg and --session flag)
    await cli(ctx, ['stop', session1]);
    await cli(ctx, ['stop', '--session', session2]);
  });

  it('session list shows running sessions and marks the current one', async () => {
    // Start two sessions
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      'session-a',
    ]);
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      'session-b',
    ]);

    // List sessions — session-b was loaded last, so it should be current
    const result = await cli(ctx, ['session', 'list']);

    expect(result.stdout).toContain('Found 2 running sessions');
    expect(result.stdout).toContain('session-a');
    expect(result.stdout).toContain('session-b');
    expect(result.stdout).toMatch(/\* session-b/);

    // Clean up
    await cli(ctx, ['stop', '--all']);
  });

  it('session use switches the current session', async () => {
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      'session-a',
    ]);
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      'session-b',
    ]);

    // session-b is current; switch to session-a
    const switchResult = await cli(ctx, ['session', 'use', 'session-a']);
    expect(switchResult.stdout).toContain('Switched to session session-a');

    // session list should now mark session-a as current
    const listResult = await cli(ctx, ['session', 'list']);
    expect(listResult.stdout).toMatch(/\* session-a/);

    await cli(ctx, ['stop', '--all']);
  });

  it('stop --all stops all sessions', async () => {
    // Start multiple sessions
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      'session-1',
    ]);
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      'session-2',
    ]);

    // Stop all
    await cli(ctx, ['stop', '--all']);

    // Verify no sessions
    const result = await cli(ctx, ['session', 'list']);
    expect(result.stdout).toContain('Found 0 running sessions');
  });

  it('session use with unknown id fails', async () => {
    const result = await cliFail(ctx, ['session', 'use', 'does-not-exist']);
    expect(result.exitCode).not.toBe(0);
    const output = String(result.stdout || '') + String(result.stderr || '');
    expect(output).toContain('does-not-exist');
  });

  it('session use causes unqualified commands to target the switched session', async () => {
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      'session-a',
    ]);
    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      'session-b',
    ]);

    // Switch to session-a (session-b is current)
    await cli(ctx, ['session', 'use', 'session-a']);

    // Unqualified stop should stop session-a
    await cli(ctx, ['stop']);

    // session-a is gone; session-b is still running
    await cliFail(ctx, ['profile', 'info', '--session', 'session-a']);
    const result = await cli(ctx, [
      'profile',
      'info',
      '--session',
      'session-b',
    ]);
    expect(result.exitCode).toBe(0);

    await cli(ctx, ['stop', '--all']);
  });

  it('reusing a live explicit session id fails without replacing the daemon', async () => {
    const sessionId = 'shared-session';

    await cli(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-1.json',
      '--session',
      sessionId,
    ]);

    const secondLoad = await cliFail(ctx, [
      'load',
      'src/test/fixtures/upgrades/processed-2.json',
      '--session',
      sessionId,
    ]);

    expect(secondLoad.exitCode).not.toBe(0);
    const output =
      String(secondLoad.stdout || '') + String(secondLoad.stderr || '');
    expect(output).toContain(`Session ${sessionId} is already running`);

    const result = await cli(ctx, ['profile', 'info', '--session', sessionId]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('This profile contains');
  });

  describe('session ownership', () => {
    // Session directories are shared by every process on the machine, so a
    // `stop` that reaches beyond the caller's own sessions destroys other
    // people's work. Two distinct owners in one directory is exactly the
    // situation those tests need to cover.
    const mine = { PROFILER_CLI_SESSION_OWNER: 'owner-mine' };
    const theirs = { PROFILER_CLI_SESSION_OWNER: 'owner-theirs' };

    async function loadOwned(
      env: Record<string, string>,
      sessionId: string,
      fixture = 'src/test/fixtures/upgrades/processed-1.json'
    ) {
      await cli(ctx, ['load', fixture, '--session', sessionId], { env });
    }

    it('records the owner and shows it with the age in session list', async () => {
      await loadOwned(mine, 'owned-by-me');

      const result = await cli(ctx, ['session', 'list'], { env: mine });

      expect(result.stdout).toContain('owner: owner-mine (yours)');
      expect(result.stdout).toMatch(/\(\d+s ago\)/);

      // The same session seen by a different owner is not marked as theirs.
      const asOther = await cli(ctx, ['session', 'list'], { env: theirs });
      expect(asOther.stdout).toContain('owner: owner-mine');
      expect(asOther.stdout).not.toContain('(yours)');

      await cli(ctx, ['stop', 'owned-by-me'], { env: mine });
    });

    it('refuses to stop a session owned by someone else', async () => {
      await loadOwned(theirs, 'not-mine');

      const result = await cliFail(ctx, ['stop', 'not-mine'], { env: mine });

      expect(result.exitCode).not.toBe(0);
      const output = String(result.stdout || '') + String(result.stderr || '');
      expect(output).toContain('belongs to owner-theirs');
      expect(output).toContain('not to you (owner-mine)');
      expect(output).toContain('--force');

      // The refusal has to leave the session alive, or it is no protection.
      const stillThere = await cli(ctx, [
        'profile',
        'info',
        '--session',
        'not-mine',
      ]);
      expect(stillThere.exitCode).toBe(0);

      await cli(ctx, ['stop', 'not-mine'], { env: theirs });
    });

    it('stops another owner’s session with --force', async () => {
      await loadOwned(theirs, 'not-mine');

      const result = await cli(ctx, ['stop', 'not-mine', '--force'], {
        env: mine,
      });
      expect(result.stdout).toContain('Session not-mine stopped');

      await cliFail(ctx, ['profile', 'info', '--session', 'not-mine']);
    });

    it('stops sessions with no recorded owner, as older builds left them', async () => {
      // A session written before owner tracking existed. Refusing these would
      // break every script that already relies on stopping them.
      const sessionId = 'legacy-session';
      const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);
      const socketPath = join(ctx.sessionDir, `${sessionId}.sock`);
      await writeFile(
        metadataPath,
        JSON.stringify({
          id: sessionId,
          socketPath,
          logPath: join(ctx.sessionDir, `${sessionId}.log`),
          pid: 999999,
          profilePath: '/tmp/does-not-exist.json',
          createdAt: '2026-04-11T00:00:00.000Z',
          buildHash: 'legacy-build',
        }),
        'utf-8'
      );

      const result = await cli(ctx, ['stop', sessionId], { env: mine });
      expect(result.stdout).toContain(`Session ${sessionId}`);
      expect(result.stdout).not.toContain('belongs to');
      await expect(access(metadataPath)).rejects.toThrow();
    });

    it('stops a session whose recorded owner is unusable', async () => {
      // JSON cannot hold undefined, so null is what a truncated or hand-edited
      // metadata file really contains. Such a session must not end up refused
      // to everyone, with a message naming an owner nobody can present.
      const sessionId = 'null-owner';
      const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);
      await writeFile(
        metadataPath,
        JSON.stringify({
          id: sessionId,
          socketPath: join(ctx.sessionDir, `${sessionId}.sock`),
          logPath: join(ctx.sessionDir, `${sessionId}.log`),
          pid: 999999,
          profilePath: '/tmp/does-not-exist.json',
          createdAt: '2026-04-11T00:00:00.000Z',
          buildHash: 'weird-build',
          owner: null,
        }),
        'utf-8'
      );

      const result = await cli(ctx, ['stop', sessionId], { env: mine });
      expect(result.stdout).not.toContain('belongs to');
      await expect(access(metadataPath)).rejects.toThrow();
    });

    it('lets anyone stop a session whose owning process has exited', async () => {
      // A pid owner outlives its process: the daemon is detached on purpose, so
      // the shell that ran `load` is usually gone well before the session is.
      // pid 999999 stands in for that exited shell.
      const sessionId = 'dead-owner';
      const metadataPath = join(ctx.sessionDir, `${sessionId}.json`);
      await writeFile(
        metadataPath,
        JSON.stringify({
          id: sessionId,
          socketPath: join(ctx.sessionDir, `${sessionId}.sock`),
          logPath: join(ctx.sessionDir, `${sessionId}.log`),
          pid: 999998,
          profilePath: '/tmp/does-not-exist.json',
          createdAt: '2026-04-11T00:00:00.000Z',
          buildHash: 'orphan-build',
          owner: 'pid:999999',
        }),
        'utf-8'
      );

      const result = await cli(ctx, ['stop', sessionId], { env: mine });
      expect(result.stdout).not.toContain('belongs to');
      await expect(access(metadataPath)).rejects.toThrow();
    });

    it('stop --all says so when every session belongs to someone else', async () => {
      await loadOwned(theirs, 'only-theirs');

      const result = await cli(ctx, ['stop', '--all'], { env: mine });

      // Exit 0 with nothing stopped is the one way this command can report a
      // clean machine while daemons are still running, so it has to say it.
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Stopped 0 sessions');
      expect(result.stdout).toContain('owned by someone else');
      expect(result.stdout).not.toContain('Stopping 1 session(s)');

      const survivor = await cli(ctx, [
        'profile',
        'info',
        '--session',
        'only-theirs',
      ]);
      expect(survivor.exitCode).toBe(0);

      await cli(ctx, ['stop', 'only-theirs'], { env: theirs });
    });

    it('stop --all says so when there is nothing running at all', async () => {
      const result = await cli(ctx, ['stop', '--all'], { env: mine });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No running sessions to stop.');
    });

    it('bare stop names the session it picked and who owns it', async () => {
      await loadOwned(mine, 'current-one');

      const result = await cli(ctx, ['stop'], { env: mine });

      // A stop with no id reads its target out of shared state, so it has to
      // say what that turned out to be before acting on it.
      expect(result.stdout).toContain(
        'Stopping session current-one, owner owner-mine'
      );
      expect(result.stdout).toMatch(/daemon pid \d+/);
      expect(result.stdout).toContain('Session current-one stopped');
    });

    it('bare stop refuses when the current session is someone else’s', async () => {
      // The hazard in one test: another owner's `load` moved the shared current
      // session pointer, so a bare `stop` now aims at their session.
      await loadOwned(theirs, 'theirs-current');

      const result = await cliFail(ctx, ['stop'], { env: mine });

      expect(result.exitCode).not.toBe(0);
      const output = String(result.stdout || '') + String(result.stderr || '');
      expect(output).toContain('belongs to owner-theirs');

      const stillThere = await cli(ctx, [
        'profile',
        'info',
        '--session',
        'theirs-current',
      ]);
      expect(stillThere.exitCode).toBe(0);

      await cli(ctx, ['stop', 'theirs-current'], { env: theirs });
    });

    it('stop --all lists what it stops and skips other owners', async () => {
      await loadOwned(mine, 'all-mine');
      await loadOwned(
        theirs,
        'all-theirs',
        'src/test/fixtures/upgrades/processed-2.json'
      );

      const result = await cli(ctx, ['stop', '--all'], { env: mine });

      expect(result.stdout).toContain('Stopping 1 session(s):');
      expect(result.stdout).toContain('all-mine, owner owner-mine');
      expect(result.stdout).toContain(
        'Skipping 1 session(s) owned by someone else (you are owner-mine)'
      );
      expect(result.stdout).toContain('all-theirs, owner owner-theirs');
      expect(result.stdout).toContain('Session all-mine stopped');

      // The other owner's session survives a stop --all that was not theirs.
      const survivor = await cli(ctx, [
        'profile',
        'info',
        '--session',
        'all-theirs',
      ]);
      expect(survivor.exitCode).toBe(0);

      await cli(ctx, ['stop', 'all-theirs'], { env: theirs });
    });

    it('stop --all --force stops every owner’s sessions', async () => {
      await loadOwned(mine, 'force-mine');
      await loadOwned(
        theirs,
        'force-theirs',
        'src/test/fixtures/upgrades/processed-2.json'
      );

      const result = await cli(ctx, ['stop', '--all', '--force'], {
        env: mine,
      });

      expect(result.stdout).toContain('Stopping 2 session(s):');
      expect(result.stdout).not.toContain('Skipping');

      const listed = await cli(ctx, ['session', 'list']);
      expect(listed.stdout).toContain('Found 0 running sessions');
    });

    it('session use warns when it redirects to another owner’s session', async () => {
      await loadOwned(mine, 'use-mine');
      await loadOwned(
        theirs,
        'use-theirs',
        'src/test/fixtures/upgrades/processed-2.json'
      );

      const result = await cli(ctx, ['session', 'use', 'use-theirs'], {
        env: mine,
      });

      expect(result.stdout).toContain('Switched to session use-theirs');
      expect(result.stdout).toContain('owned by owner-theirs, not you');
      expect(result.stdout).toContain('shared state');

      await cli(ctx, ['stop', 'use-mine'], { env: mine });
      await cli(ctx, ['stop', 'use-theirs'], { env: theirs });
    });
  });

  it('session list cleans up stale session metadata files', async () => {
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

    const result = await cli(ctx, ['session', 'list']);

    expect(result.stdout).toContain('Cleaned up 1 stale sessions.');
    expect(result.stdout).toContain('Found 0 running sessions');

    await expect(access(metadataPath)).rejects.toThrow();
    await expect(access(socketPath)).rejects.toThrow();
    await expect(access(currentPath)).rejects.toThrow();
  });
});
