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
  describeSessionDirFailure,
  describeSocketListenError,
  describeStaleSocketFailure,
  getErrnoCode,
} from '../../diagnostics';

function errnoError(code: string, message: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(message);
  error.code = code;
  return error;
}

// Unix domain sockets do not exist on Windows.
const skipUnix = process.platform === 'win32';

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
      // The directory holding the socket is not the problem here, so pointing
      // at it would send the user off in the wrong direction.
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
});
