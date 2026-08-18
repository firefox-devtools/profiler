/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that daemon startup and communication failures are reported with
 * enough detail to act on. These are the paths a sandbox hits: a session
 * directory that cannot be written, a socket path the kernel refuses, or a
 * daemon that dies before it can answer.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

const PROFILE = 'src/test/fixtures/upgrades/processed-1.json';

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
// Unix domain sockets do not exist on Windows, and permission bits do not
// constrain root.
const skipUnix = process.platform === 'win32';
const skipUnixPermissions = skipUnix || isRoot;

/**
 * Run profiler-cli against an arbitrary session directory, bypassing the
 * per-test context (whose directory is deliberately healthy).
 */
function contextForSessionDir(sessionDir: string): CliTestContext {
  return {
    sessionDir,
    env: {
      PROFILER_CLI_SESSION_DIR: sessionDir,
      PROFILER_CLI_NO_SYMBOLICATE: '1',
    },
  };
}

function output(result: { stdout?: string; stderr?: string }): string {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

describe('unusable session directory', () => {
  let scratchDir: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), 'profiler-cli-fail-'));
  });

  afterEach(() => {
    chmodSync(scratchDir, 0o755);
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it('explains a session directory that cannot be written to', async () => {
    if (skipUnixPermissions) {
      return;
    }

    chmodSync(scratchDir, 0o555);

    const result = await cliFail(contextForSessionDir(scratchDir), [
      'load',
      PROFILE,
    ]);

    const text = output(result);
    expect(text).toContain('session directory');
    expect(text).toContain(scratchDir);
    expect(text).toContain('Permission denied');
    expect(text).toContain('PROFILER_CLI_SESSION_DIR');
    // The old message leaked implementation details and a misleading fix.
    expect(text).not.toContain('exited unexpectedly during startup');
  });

  it('explains a session directory that cannot be created', async () => {
    if (skipUnixPermissions) {
      return;
    }

    chmodSync(scratchDir, 0o555);
    const sessionDir = join(scratchDir, 'sub');

    const result = await cliFail(contextForSessionDir(sessionDir), [
      'load',
      PROFILE,
    ]);

    const text = output(result);
    expect(text).toContain('Cannot create');
    expect(text).toContain(sessionDir);
  });

  it('explains a session directory path that is a regular file', async () => {
    const sessionDir = join(scratchDir, 'file');
    writeFileSync(sessionDir, '');

    const result = await cliFail(contextForSessionDir(sessionDir), [
      'load',
      PROFILE,
    ]);

    expect(output(result)).toContain('exists but is not a directory');
  });

  it('does not silently create a session directory just to list sessions', async () => {
    const sessionDir = join(scratchDir, 'never-created');

    const result = await cli(contextForSessionDir(sessionDir), [
      'session',
      'list',
    ]);

    expect(result.stdout).toContain('Found 0 running sessions');
    expect(existsSync(sessionDir)).toBe(false);
  });
});

describe('socket path blocked by something else', () => {
  let scratchDir: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), 'profiler-cli-fail-'));
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it('names what is in the way rather than blaming the session directory', async () => {
    if (skipUnix) {
      return;
    }

    // A directory cannot be unlinked, so the daemon fails here, after the
    // client's session directory check has already passed. The reason can only
    // reach the client through the startup error file.
    mkdirSync(join(scratchDir, 'sess-a.sock'));

    const result = await cliFail(contextForSessionDir(scratchDir), [
      'load',
      PROFILE,
      '--session',
      'sess-a',
    ]);

    const text = output(result);
    expect(text).toContain('needs for its socket');
    expect(text).toContain('It is a directory, not a socket.');
    expect(text).toContain('--session');
    expect(text).not.toContain('session directory');
  });
});

describe('unusable socket path', () => {
  it('rejects a socket path too long for sockaddr_un before spawning', async () => {
    if (skipUnix) {
      return;
    }

    const scratchDir = mkdtempSync(join(tmpdir(), 'profiler-cli-fail-'));
    const sessionDir = join(scratchDir, ...Array(12).fill('abcdefghij'));

    try {
      const result = await cliFail(contextForSessionDir(sessionDir), [
        'load',
        PROFILE,
      ]);

      const text = output(result);
      expect(text).toContain('byte limit');
      expect(text).toContain('PROFILER_CLI_SESSION_DIR');
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});

describe('unreachable daemon', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('reports the socket state when the daemon died without cleaning up', async () => {
    const loadResult = await cli(ctx, ['load', PROFILE]);
    const sessionId = (loadResult.stdout as string).match(
      /Session started: (\w+)/
    )![1];

    const metadata = JSON.parse(
      await readFile(join(ctx.sessionDir, `${sessionId}.json`), 'utf-8')
    );
    process.kill(metadata.pid, 'SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const result = await cliFail(ctx, ['profile', 'info']);

    const text = output(result);
    expect(text).toContain(`Session ${sessionId} is not reachable`);
    expect(text).toContain('profiler-cli load');
  });

  it('reports an unknown session id instead of a bare "invalid"', async () => {
    const result = await cliFail(ctx, [
      'profile',
      'info',
      '--session',
      'no-such-session',
    ]);

    const text = output(result);
    expect(text).toContain('Unknown session no-such-session');
    expect(text).toContain(ctx.sessionDir);
  });
});

describe('session denied by policy', () => {
  let ctx: CliTestContext;
  let sessionId: string;
  let socketPath: string;
  let daemonPid: number;

  // The whole fixture is a denied connect(), so it cannot even be set up where
  // permission bits do not apply.
  beforeEach(async () => {
    if (skipUnixPermissions) {
      return;
    }

    ctx = await createTestContext();
    const loadResult = await cli(ctx, ['load', PROFILE]);
    sessionId = (loadResult.stdout as string).match(
      /Session started: (\w+)/
    )![1];
    socketPath = join(ctx.sessionDir, `${sessionId}.sock`);
    daemonPid = JSON.parse(
      await readFile(join(ctx.sessionDir, `${sessionId}.json`), 'utf-8')
    ).pid;
    // Deny connect() to a daemon that is alive and well, which is what a
    // sandbox policy looks like from the client side.
    chmodSync(socketPath, 0o000);
  });

  afterEach(async () => {
    if (skipUnixPermissions) {
      return;
    }

    // A test may have stopped the daemon, which takes the socket with it.
    if (existsSync(socketPath)) {
      chmodSync(socketPath, 0o755);
    }
    await cleanupTestContext(ctx);
  });

  it('keeps a live session listed as unreachable instead of deleting it', async () => {
    if (skipUnixPermissions) {
      return;
    }

    const result = await cli(ctx, ['session', 'list']);

    const text = output(result);
    expect(text).toContain('Could not reach the following sessions');
    expect(text).toMatch(
      new RegExp(`${sessionId} \\[owner: [^,]+, daemon pid: ${daemonPid}\\]`)
    );
    expect(text).toContain('sandbox');
    // An unreachable daemon cannot be stopped through its own socket, so the
    // pid has to be enough to act on.
    expect(text).toContain('kill these by pid');
    expect(text).not.toContain('Cleaned up');

    // The daemon is still running, so its files have to survive: deleting the
    // socket would orphan it permanently.
    expect(existsSync(socketPath)).toBe(true);
    expect(existsSync(join(ctx.sessionDir, `${sessionId}.json`))).toBe(true);

    chmodSync(socketPath, 0o755);
    const recovered = await cli(ctx, ['profile', 'info']);
    expect(output(recovered)).toContain('This profile contains');
  });

  it('explains a denied session instead of reporting it as not found', async () => {
    if (skipUnixPermissions) {
      return;
    }

    const result = await cliFail(ctx, ['session', 'use', sessionId]);

    const text = output(result);
    expect(text).toContain('Not allowed to connect');
    expect(text).toContain('sandbox');
    expect(text).toContain(`kill ${daemonPid}`);
    expect(text).not.toContain('not found or not running');
    expect(existsSync(join(ctx.sessionDir, `${sessionId}.json`))).toBe(true);
  });

  it('does not claim to have stopped a daemon it cannot reach', async () => {
    if (skipUnixPermissions) {
      return;
    }

    const result = await cliFail(ctx, ['stop', sessionId]);

    const text = output(result);
    expect(text).toContain('may still be running');
    expect(text).toContain(`kill ${daemonPid}`);
    // The old message announced success while the daemon kept running.
    expect(text).not.toContain(`Session ${sessionId} stopped`);

    chmodSync(socketPath, 0o755);
    const stopped = await cli(ctx, ['stop', sessionId]);
    expect(output(stopped)).toContain(`Session ${sessionId} stopped`);
  });

  it('fails "stop --all" when one of the sessions cannot be stopped', async () => {
    if (skipUnixPermissions) {
      return;
    }

    const result = await cliFail(ctx, ['stop', '--all']);

    const text = output(result);
    expect(text).toContain('Could not stop 1 of 1 sessions');
    expect(text).not.toContain(`Session ${sessionId} stopped`);
    expect(existsSync(join(ctx.sessionDir, `${sessionId}.json`))).toBe(true);
  });

  it('refuses to reuse the session id rather than orphaning its daemon', async () => {
    if (skipUnixPermissions) {
      return;
    }

    const result = await cliFail(ctx, [
      'load',
      PROFILE,
      '--session',
      sessionId,
    ]);

    const text = output(result);
    expect(text).toContain('cannot be reached');
    expect(text).toContain(`kill ${daemonPid}`);
    expect(text).toContain('--session');

    // Taking over the id would have unlinked this socket and overwritten this
    // metadata, leaving the daemon running with nothing able to find it.
    expect(existsSync(socketPath)).toBe(true);
    const metadata = JSON.parse(
      await readFile(join(ctx.sessionDir, `${sessionId}.json`), 'utf-8')
    );
    expect(metadata.pid).toBe(daemonPid);

    chmodSync(socketPath, 0o755);
    const recovered = await cli(ctx, ['profile', 'info']);
    expect(output(recovered)).toContain('This profile contains');
  });
});
