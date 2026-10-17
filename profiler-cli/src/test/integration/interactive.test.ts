/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the interactive prompt (`profiler-cli -i`), fed through stdin.
 */

import {
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

  it('rejects -i after the first argument', async () => {
    const result = await cliFail(ctx, ['status', '-i']);
    expect(result.stderr).toContain('must be the first argument');
  });
});
