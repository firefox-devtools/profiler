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
import { tmpdir } from 'os';
import { join } from 'path';
import { cli, cliFail, type CliTestContext } from './utils';

const PROFILE = 'src/test/fixtures/upgrades/processed-1.json';

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
// Unix domain sockets do not exist on Windows, and permission bits do not
// constrain root.
const skipUnix = process.platform === 'win32';
const skipUnixPermissions = skipUnix || isRoot;

/**
 * Run profiler-cli against an arbitrary session directory.
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
