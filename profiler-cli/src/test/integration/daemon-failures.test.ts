/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that daemon startup and communication failures are reported with
 * enough detail to act on.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cliFail, type CliTestContext } from './utils';

const PROFILE = 'src/test/fixtures/upgrades/processed-1.json';

// Unix domain sockets do not exist on Windows.
const skipUnix = process.platform === 'win32';

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

    // A directory cannot be unlinked, so the daemon dies clearing the socket
    // path. The reason can only reach the client through the startup error
    // file, since the daemon is spawned with its stdio discarded.
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
