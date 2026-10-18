/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the interactive prompt (`profiler-cli -i`), fed through stdin.
 */

import { spawn } from 'child_process';
import {
  CLI_BIN,
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

const PROFILE = 'src/test/fixtures/upgrades/processed-1.json';

describe('profiler-cli interactive mode', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('runs one command per line and survives errors', async () => {
    const result = await cli(ctx, ['-i', 'load', PROFILE], {
      input: [
        'thread select t-99',
        'thread functions --min-self abc',
        'bogus',
        'thread info --no-such-flag',
        'zoom --help',
        'thread select t-0',
        '',
        'thread info',
        'exit',
        'profile info',
      ].join('\n'),
    });
    expect(result.stdout).toContain('Session started:');
    expect(result.stderr).toContain('Unknown thread t-99');
    expect(result.stderr).toContain('--min-self must be a number');
    expect(result.stderr).toContain("Unknown command 'bogus'");
    expect(result.stderr).toContain("unknown option '--no-such-flag'");
    expect(result.stdout).toContain('Manage zoom ranges');
    expect(result.stdout).toContain('Name: Parent Process');
    // Nothing after "exit" runs.
    expect(result.stdout).not.toContain('This profile contains');
  });

  it('stops the sessions it loaded when it exits', async () => {
    const result = await cli(ctx, ['-i', 'load', PROFILE], {
      input: 'status\n',
    });
    const sessionId = result.stdout.match(/Session started: (\S+)/)![1];
    expect(result.stdout).toContain(`Session ${sessionId} stopped`);
    const list = await cli(ctx, ['session', 'list']);
    expect(list.stdout).toContain('Found 0 running sessions');
  });

  it('leaves sessions running that it did not load', async () => {
    await cli(ctx, ['load', PROFILE, '--session', 'outside']);
    const result = await cli(ctx, ['-i'], { input: 'thread info\n' });
    expect(result.stdout).toContain('Name: Content Process');
    const list = await cli(ctx, ['session', 'list']);
    expect(list.stdout).toContain('outside');
  });

  it('keeps using its own session after another load elsewhere', async () => {
    await cli(ctx, ['load', PROFILE, '--session', 'other']);
    const result = await cli(
      ctx,
      ['-i', 'load', PROFILE, '--session', 'mine'],
      {
        input:
          'session use other\nthread select t-0\nsession use mine\nstatus\n',
      }
    );
    // "session use" switches the prompt's session, so t-0 was selected in
    // "other" and "mine" still has its default selection.
    expect(result.stdout).toContain('Selected thread: t-2');
    const other = await cli(ctx, ['status', '--session', 'other']);
    expect(other.stdout).toContain('Selected thread: t-0');
  });

  it('stops every session it loaded, but not those it already stopped', async () => {
    const result = await cli(ctx, ['-i', 'load', PROFILE, '--session', 'a'], {
      input: [
        `load ${PROFILE} --session b`,
        `load ${PROFILE} --session c`,
        'stop a',
        // A bare "stop" stops the pinned session, which is "c".
        'stop',
        'exit',
      ].join('\n'),
    });
    expect(result.stderr).toBe('');
    for (const id of ['a', 'b', 'c']) {
      expect(result.stdout.split(`Session ${id} stopped`)).toHaveLength(2);
    }
    const list = await cli(ctx, ['session', 'list']);
    expect(list.stdout).toContain('Found 0 running sessions');
  });

  it('forgets the sessions that "stop --all" stopped', async () => {
    await cli(ctx, ['load', PROFILE, '--session', 'outside']);
    const result = await cli(ctx, ['-i', 'load', PROFILE, '--session', 'a'], {
      input: 'stop --all\nexit\n',
    });
    expect(result.stderr).toBe('');
    expect(result.stdout.split('Session a stopped')).toHaveLength(2);
    expect(result.stdout).toContain('Session outside stopped');
  });

  it('stops the sessions it loaded when it gets SIGTERM', async () => {
    // On Windows, kill() terminates the process without running any signal
    // handler.
    if (process.platform === 'win32') {
      return;
    }

    const proc = spawn(process.execPath, [CLI_BIN, '-i', 'load', PROFILE], {
      env: { ...process.env, ...ctx.env },
    });
    // Keep stdin open, so that only the signal ends the prompt.
    let stdout = '';
    await new Promise<void>((resolve) => {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.includes('Selected thread')) {
          resolve();
        }
      });
    });
    const exitCode = new Promise((resolve) => proc.on('close', resolve));
    proc.kill('SIGTERM');
    expect(await exitCode).toBe(143);
    // The daemon gets SIGTERM and removes its session files asynchronously.
    let list;
    for (let i = 0; i < 50; i++) {
      list = await cli(ctx, ['session', 'list']);
      if (list.stdout.includes('Found 0 running sessions')) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(list!.stdout).toContain('Found 0 running sessions');
  });

  it('rejects -i after the first argument', async () => {
    const result = await cliFail(ctx, ['status', '-i']);
    expect(result.stderr).toContain('must be the first argument');
  });
});
