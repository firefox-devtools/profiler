/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for the failure diagnostics used by the daemon and its clients.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
  assertSocketPathUsable,
  describeSessionDirFailure,
  describeSocketConnectError,
  describeSocketListenError,
  describeStaleSocketFailure,
  ensureSessionDirUsable,
  getErrnoCode,
  indentBlock,
} from '../../diagnostics';

function errnoError(code: string, message: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(message);
  error.code = code;
  return error;
}

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
// Unix domain sockets do not exist on Windows, and permission bits do not
// constrain root.
const skipUnix = process.platform === 'win32';
const skipUnixPermissions = skipUnix || isRoot;

describe('profiler-cli diagnostics', function () {
  let tmpDir: string;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcli-diag-'));
  });

  afterEach(function () {
    fs.chmodSync(tmpDir, 0o755);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getErrnoCode', function () {
    it('extracts the code from an errno error', function () {
      expect(getErrnoCode(errnoError('EACCES', 'nope'))).toBe('EACCES');
    });

    it('returns undefined for values without a code', function () {
      expect(getErrnoCode(new Error('plain'))).toBeUndefined();
      expect(getErrnoCode('a string')).toBeUndefined();
      expect(getErrnoCode(undefined)).toBeUndefined();
    });
  });

  describe('ensureSessionDirUsable', function () {
    it('creates a missing session directory', function () {
      const sessionDir = path.join(tmpDir, 'nested', 'sessions');
      expect(() => ensureSessionDirUsable(sessionDir)).not.toThrow();
      expect(fs.existsSync(sessionDir)).toBe(true);
    });

    it('leaves no probe file behind', function () {
      ensureSessionDirUsable(tmpDir);
      expect(fs.readdirSync(tmpDir)).toEqual([]);
    });

    it('rejects a path that is a file', function () {
      const filePath = path.join(tmpDir, 'not-a-dir');
      fs.writeFileSync(filePath, '');
      expect(() => ensureSessionDirUsable(filePath)).toThrow(
        /exists but is not a directory/
      );
    });

    it('rejects an existing directory that cannot be written to', function () {
      if (skipUnixPermissions) {
        return;
      }

      fs.chmodSync(tmpDir, 0o555);
      expect(() => ensureSessionDirUsable(tmpDir)).toThrow(
        /Cannot write to the profiler-cli session directory/
      );
      expect(() => ensureSessionDirUsable(tmpDir)).toThrow(
        /PROFILER_CLI_SESSION_DIR/
      );
    });
  });

  describe('describeSessionDirFailure', function () {
    it('explains permission errors and points at the env var', function () {
      const message = describeSessionDirFailure(
        '/some/dir',
        'create',
        errnoError('EACCES', 'EACCES: permission denied')
      );
      expect(message).toContain('Cannot create');
      expect(message).toContain('/some/dir');
      expect(message).toContain('Permission denied');
      expect(message).toContain('PROFILER_CLI_SESSION_DIR');
    });

    it('always includes the underlying error', function () {
      const message = describeSessionDirFailure(
        '/some/dir',
        'read',
        errnoError('EWEIRD', 'something unusual happened')
      );
      expect(message).toContain('something unusual happened');
    });
  });

  describe('assertSocketPathUsable', function () {
    it('accepts a short path', function () {
      expect(() => assertSocketPathUsable('/tmp/p/abc.sock')).not.toThrow();
    });

    it('rejects a path that cannot fit in sockaddr_un', function () {
      if (skipUnix) {
        return;
      }

      const longPath = `/tmp/${'a'.repeat(200)}.sock`;
      expect(() => assertSocketPathUsable(longPath)).toThrow(
        /over this platform's \d+-byte limit/
      );
    });
  });

  describe('describeSocketListenError', function () {
    it('blames the sandbox on EPERM', function () {
      const message = describeSocketListenError(
        '/tmp/s.sock',
        errnoError('EPERM', 'listen EPERM')
      );
      expect(message).toContain('Not allowed to create the Unix domain socket');
      expect(message).toContain('sandbox');
    });

    it('suggests a shorter directory when the kernel rejects the path', function () {
      const message = describeSocketListenError(
        '/tmp/s.sock',
        errnoError('EINVAL', 'listen EINVAL')
      );
      expect(message).toContain('too long for sockaddr_un');
    });

    it('mentions the other sessions on EADDRINUSE', function () {
      const message = describeSocketListenError(
        '/tmp/s.sock',
        errnoError('EADDRINUSE', 'listen EADDRINUSE')
      );
      expect(message).toContain('profiler-cli session list');
    });
  });

  describe('describeStaleSocketFailure', function () {
    it('names what is in the way and does not blame the session directory', function () {
      const socketPath = path.join(tmpDir, 'sess.sock');
      fs.mkdirSync(socketPath);

      const message = describeStaleSocketFailure(
        socketPath,
        errnoError('ERR_FS_EISDIR', 'Path is a directory')
      );

      expect(message).toContain(socketPath);
      expect(message).toContain('It is a directory, not a socket.');
      expect(message).toContain('Path is a directory');
      // The client verifies the session directory before spawning the daemon,
      // so pointing at the directory here would contradict that check.
      expect(message).not.toContain('session directory');
      expect(message).not.toContain('PROFILER_CLI_SESSION_DIR');
    });

    it('recognizes a socket left behind by an earlier daemon', async function () {
      if (skipUnix) {
        return;
      }

      const socketPath = path.join(tmpDir, 'left-behind.sock');
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));
      try {
        expect(
          describeStaleSocketFailure(socketPath, errnoError('EPERM', 'nope'))
        ).toContain('socket left behind by an earlier daemon');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('still reports the error when the path is gone', function () {
      const message = describeStaleSocketFailure(
        path.join(tmpDir, 'missing.sock'),
        errnoError('EPERM', 'operation not permitted')
      );
      expect(message).toContain('operation not permitted');
    });
  });

  describe('describeSocketConnectError', function () {
    it('tells the user to reload when the socket is gone', function () {
      const message = describeSocketConnectError(
        '/tmp/s.sock',
        errnoError('ENOENT', 'connect ENOENT')
      );
      expect(message).toContain('profiler-cli load');
    });

    it('distinguishes a denied connection from a missing daemon', function () {
      const message = describeSocketConnectError(
        '/tmp/s.sock',
        errnoError('EPERM', 'connect EPERM')
      );
      expect(message).toContain('Not allowed to connect');
      expect(message).toContain('sandbox');
      expect(message).not.toContain('profiler-cli load');
    });
  });

  describe('indentBlock', function () {
    it('indents every line', function () {
      expect(indentBlock('a\nb')).toBe('  a\n  b');
    });
  });
});
