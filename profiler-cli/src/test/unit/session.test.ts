/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for profiler-cli session management.
 *
 * These tests cover only the session.ts utility functions.
 * Integration tests that spawn daemons and test IPC are in bash scripts:
 * - bin/profiler-cli-test: Basic daemon lifecycle
 * - bin/profiler-cli-test-multi: Concurrent sessions
 */

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import {
  ensureSessionDir,
  generateSessionId,
  getSessionDirNamespace,
  getSocketPath,
  getLogPath,
  getMetadataPath,
  saveSessionMetadata,
  loadSessionMetadata,
  setCurrentSession,
  getCurrentSessionId,
  getCurrentSocketPath,
  isDaemonReachable,
  waitForSocketClose,
  cleanupSession,
  validateSession,
  listSessions,
  getLogSize,
  readLogTail,
  writeStartupError,
  takeStartupError,
  describeSessionOwner,
  formatSessionAge,
  getSessionAge,
  getSessionOwner,
  ownsSession,
  readSessionOwner,
  SESSION_OWNER_ENV_VAR,
} from '../../session';
import type { SessionMetadata } from '../../protocol';

const TEST_BUILD_HASH = 'test-build-hash';

describe('profiler-cli session management', function () {
  let testSessionDir: string;
  const platformDescriptor = Object.getOwnPropertyDescriptor(
    process,
    'platform'
  );

  beforeEach(function () {
    // Create a unique temp directory for each test
    testSessionDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'profiler-cli-test-')
    );
  });

  afterEach(function () {
    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor);
    }

    // Clean up test directory
    if (fs.existsSync(testSessionDir)) {
      fs.rmSync(testSessionDir, { recursive: true, force: true });
    }
  });

  describe('ensureSessionDir', function () {
    it('creates session directory if it does not exist', function () {
      const newDir = path.join(testSessionDir, 'subdir');
      expect(fs.existsSync(newDir)).toBe(false);

      ensureSessionDir(newDir);

      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.statSync(newDir).isDirectory()).toBe(true);
    });

    it('does not fail if directory already exists', function () {
      ensureSessionDir(testSessionDir);

      expect(() => ensureSessionDir(testSessionDir)).not.toThrow();
      expect(fs.existsSync(testSessionDir)).toBe(true);
    });
  });

  describe('generateSessionId', function () {
    it('returns a non-empty string', function () {
      const sessionId = generateSessionId();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('returns different IDs on successive calls', function () {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('path generation', function () {
    it('getSocketPath returns correct Unix path', function () {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      expect(socketPath).toBe(path.join(testSessionDir, 'test123.sock'));
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('namespaces Windows pipe paths by session directory', function () {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const firstSocketPath = getSocketPath(
        'C:\\profiler-cli\\alpha',
        'test123'
      );
      const secondSocketPath = getSocketPath(
        'C:\\profiler-cli\\beta',
        'test123'
      );
      const thirdSocketPath = getSocketPath(
        'C:\\PROFILER-CLI\\ALPHA',
        'test123'
      );

      expect(firstSocketPath).toMatch(
        /^\\\\\.\\pipe\\profiler-cli-[0-9a-f]{12}-test123$/
      );
      expect(secondSocketPath).toMatch(
        /^\\\\\.\\pipe\\profiler-cli-[0-9a-f]{12}-test123$/
      );
      expect(firstSocketPath).not.toBe(secondSocketPath);
      expect(firstSocketPath).toBe(thirdSocketPath);

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('generates a stable namespace from the session directory', function () {
      const firstNamespace = getSessionDirNamespace('C:\\profiler-cli\\alpha');
      const secondNamespace = getSessionDirNamespace('C:\\profiler-cli\\beta');
      const thirdNamespace = getSessionDirNamespace('C:\\PROFILER-CLI\\ALPHA');

      expect(firstNamespace).toMatch(/^[0-9a-f]{12}$/);
      expect(firstNamespace).not.toBe(secondNamespace);
      expect(firstNamespace).toBe(thirdNamespace);
    });

    it('getLogPath returns correct path', function () {
      const sessionId = 'test123';
      const logPath = getLogPath(testSessionDir, sessionId);
      expect(logPath).toBe(path.join(testSessionDir, 'test123.log'));
    });

    it('getMetadataPath returns correct path', function () {
      const sessionId = 'test123';
      const metadataPath = getMetadataPath(testSessionDir, sessionId);
      expect(metadataPath).toBe(path.join(testSessionDir, 'test123.json'));
    });
  });

  describe('metadata serialization', function () {
    it('saves and loads metadata correctly', function () {
      const metadata: SessionMetadata = {
        id: 'test123',
        socketPath: getSocketPath(testSessionDir, 'test123'),
        logPath: getLogPath(testSessionDir, 'test123'),
        pid: 12345,
        profilePath: '/path/to/profile.json',
        createdAt: '2025-10-31T10:00:00.000Z',
        buildHash: TEST_BUILD_HASH,
      };

      saveSessionMetadata(testSessionDir, metadata);

      const loaded = loadSessionMetadata(testSessionDir, 'test123');
      expect(loaded).toEqual(metadata);
    });

    it('returns null for non-existent session', function () {
      const loaded = loadSessionMetadata(testSessionDir, 'nonexistent');
      expect(loaded).toBeNull();
    });

    it('returns null for malformed JSON', function () {
      const metadataPath = getMetadataPath(testSessionDir, 'bad');
      fs.writeFileSync(metadataPath, 'not valid JSON {');

      const loaded = loadSessionMetadata(testSessionDir, 'bad');
      expect(loaded).toBeNull();
    });
  });

  describe('current session tracking', function () {
    it('sets and gets current session via symlink', function () {
      const sessionId = 'test123';
      setCurrentSession(testSessionDir, sessionId);

      const currentId = getCurrentSessionId(testSessionDir);
      expect(currentId).toBe(sessionId);
    });

    it('returns null when no current session exists', function () {
      const currentId = getCurrentSessionId(testSessionDir);
      expect(currentId).toBeNull();
    });

    it('replaces existing current session symlink', function () {
      // Create first session
      setCurrentSession(testSessionDir, 'session1');
      expect(getCurrentSessionId(testSessionDir)).toBe('session1');

      // Create second session
      setCurrentSession(testSessionDir, 'session2');
      expect(getCurrentSessionId(testSessionDir)).toBe('session2');
    });

    it('getCurrentSocketPath resolves to correct path', function () {
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      setCurrentSession(testSessionDir, sessionId);

      const currentPath = getCurrentSocketPath(testSessionDir);
      expect(currentPath).toBe(socketPath);
    });
  });

  describe('isDaemonReachable', function () {
    it('returns false when nothing is listening', async function () {
      const socketPath = getSocketPath(testSessionDir, 'test-socket');
      expect(await isDaemonReachable(socketPath)).toBe(false);
    });

    it('returns true when a server is listening', async function () {
      const socketPath = getSocketPath(testSessionDir, 'test-socket');
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      try {
        expect(await isDaemonReachable(socketPath)).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('waitForSocketClose', function () {
    it('returns true when the server closes', async function () {
      const socketPath = getSocketPath(testSessionDir, 'test-socket');
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      setTimeout(() => server.close(), 100);

      const closed = await waitForSocketClose(socketPath, 2000, 10);
      expect(closed).toBe(true);
    });

    it('times out if the server does not close', async function () {
      const socketPath = getSocketPath(testSessionDir, 'test-socket');
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      try {
        const closed = await waitForSocketClose(socketPath, 50, 10);
        expect(closed).toBe(false);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('cleanupSession', function () {
    it('removes socket and metadata files', function () {
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      const metadataPath = getMetadataPath(testSessionDir, sessionId);

      fs.writeFileSync(metadataPath, '{}');
      if (process.platform !== 'win32') {
        fs.writeFileSync(socketPath, '');
      }

      cleanupSession(testSessionDir, sessionId);

      expect(fs.existsSync(socketPath)).toBe(false);
      expect(fs.existsSync(metadataPath)).toBe(false);
    });

    it('preserves log file', function () {
      const sessionId = 'test123';
      const logPath = getLogPath(testSessionDir, sessionId);
      fs.writeFileSync(logPath, 'log data');

      cleanupSession(testSessionDir, sessionId);

      expect(fs.existsSync(logPath)).toBe(true);
    });

    it('removes current session symlink if it points to this session', function () {
      const sessionId = 'test123';
      setCurrentSession(testSessionDir, sessionId);

      cleanupSession(testSessionDir, sessionId);

      expect(getCurrentSessionId(testSessionDir)).toBeNull();
    });

    it('does not remove current session symlink if it points to different session', function () {
      // Set current session to session1
      setCurrentSession(testSessionDir, 'session1');

      // Clean up session2
      cleanupSession(testSessionDir, 'session2');

      // Current session should still be session1
      expect(getCurrentSessionId(testSessionDir)).toBe('session1');
    });
  });

  describe('validateSession', function () {
    it('returns null for non-existent session', async function () {
      expect(await validateSession(testSessionDir, 'nonexistent')).toBe(null);
    });

    it('returns null when nothing is listening on the socket', async function () {
      const sessionId = 'test123';
      const metadata: SessionMetadata = {
        id: sessionId,
        socketPath: getSocketPath(testSessionDir, sessionId),
        logPath: getLogPath(testSessionDir, sessionId),
        pid: process.pid,
        profilePath: '/path/to/profile.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      };

      saveSessionMetadata(testSessionDir, metadata);
      // Intentionally don't start a server

      expect(await validateSession(testSessionDir, sessionId)).toBe(null);
    });

    it('returns metadata for a valid session with an active socket', async function () {
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      const metadata: SessionMetadata = {
        id: sessionId,
        socketPath,
        logPath: getLogPath(testSessionDir, sessionId),
        pid: process.pid,
        profilePath: '/path/to/profile.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      };

      saveSessionMetadata(testSessionDir, metadata);

      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      try {
        expect(await validateSession(testSessionDir, sessionId)).not.toBe(null);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('daemon log and startup error', function () {
    it('returns null when there is no log', function () {
      expect(readLogTail(testSessionDir, 'no-log')).toBe(null);
      expect(getLogSize(testSessionDir, 'no-log')).toBe(0);
    });

    it('ignores everything before the given offset', function () {
      const logPath = getLogPath(testSessionDir, 'reused');
      fs.writeFileSync(logPath, 'from an earlier daemon\n');
      const offset = getLogSize(testSessionDir, 'reused');
      fs.appendFileSync(logPath, 'from this daemon\n');

      const tail = readLogTail(testSessionDir, 'reused', offset);
      expect(tail).toBe('from this daemon');
      expect(readLogTail(testSessionDir, 'reused')).toContain(
        'from an earlier daemon'
      );
    });

    it('reads back and consumes a startup error', function () {
      writeStartupError(testSessionDir, 'failed', 'could not bind\n');

      expect(takeStartupError(testSessionDir, 'failed')).toBe('could not bind');
      // Consumed, so a later failure cannot inherit this one's reason.
      expect(takeStartupError(testSessionDir, 'failed')).toBe(null);
    });

    it('does not make startup errors look like sessions', function () {
      writeStartupError(testSessionDir, 'failed', 'could not bind');
      expect(listSessions(testSessionDir)).toEqual([]);
    });
  });

  describe('session ownership', function () {
    it('prefers the configured owner over the parent pid', function () {
      expect(
        getSessionOwner({ [SESSION_OWNER_ENV_VAR]: 'agent-L' }, 4242)
      ).toBe('agent-L');
      // Surrounding whitespace from a shell export must not make two callers
      // that meant the same owner look like different ones.
      expect(
        getSessionOwner({ [SESSION_OWNER_ENV_VAR]: '  agent-L\n' }, 4242)
      ).toBe('agent-L');
    });

    it('falls back to the parent pid when no owner is configured', function () {
      expect(getSessionOwner({}, 4242)).toBe('pid:4242');
      // An empty value is a variable that was exported but never set, not a
      // request to be owned by "".
      expect(getSessionOwner({ [SESSION_OWNER_ENV_VAR]: '' }, 4242)).toBe(
        'pid:4242'
      );
    });

    it('recognises only the recorded owner', function () {
      expect(ownsSession({ owner: 'agent-L' }, 'agent-L')).toBe(true);
      expect(ownsSession({ owner: 'agent-L' }, 'agent-M')).toBe(false);
    });

    it('treats a session with no recorded owner as anyone’s', function () {
      // Sessions written by builds that predate owner tracking, which existing
      // scripts must still be able to stop.
      expect(ownsSession({}, 'agent-L')).toBe(true);
      expect(describeSessionOwner({})).toBe('unknown');
      expect(describeSessionOwner({ owner: 'agent-L' })).toBe('agent-L');
    });

    it('treats an unusable recorded owner as no owner at all', function () {
      // JSON has no undefined, so a null owner is a value a metadata file can
      // really hold. Comparing it by strict equality against a string would
      // match nobody and lock the session away from every caller, which is the
      // failure this ownership check exists to prevent, inverted.
      for (const owner of [null, '', '   ', 1234, {}, []] as any[]) {
        expect(readSessionOwner({ owner })).toBeNull();
        expect(ownsSession({ owner }, 'agent-L')).toBe(true);
        // Whatever is displayed must agree with what is enforced: a session
        // that anyone may stop must not claim to belong to someone.
        expect(describeSessionOwner({ owner })).toBe('unknown');
      }
    });

    it('normalises the recorded owner the way the environment one is', function () {
      expect(readSessionOwner({ owner: '  agent-L\n' })).toBe('agent-L');
      // Both sides of the comparison get trimmed, so a stray newline in a
      // metadata file cannot separate an owner from its own sessions.
      expect(ownsSession({ owner: '  agent-L\n' }, 'agent-L')).toBe(true);
    });

    it('releases a pid owner whose process is provably gone', function () {
      // The daemon is detached and outlives the shell that started it, so a
      // pid: owner refers to a dead process for most of a long session's life.
      // Refusing those forever would leave sessions nobody can ever reclaim.
      expect(ownsSession({ owner: 'pid:999999' }, 'pid:4242')).toBe(true);
      // Still refused to a different caller while that process is alive.
      expect(ownsSession({ owner: `pid:${process.pid}` }, 'pid:4242')).toBe(
        false
      );
    });

    it('never releases a named owner, however its processes fare', function () {
      // A name chosen via PROFILER_CLI_SESSION_OWNER is not tied to any
      // process, so there is no death that could release it. Callers following
      // the multi-agent convention keep the guard for their sessions' lifetime.
      expect(ownsSession({ owner: 'agent-theirs' }, 'agent-L')).toBe(false);
      // Owners that merely look pid-ish are names too, not pids to probe.
      expect(ownsSession({ owner: 'pid:notanumber' }, 'agent-L')).toBe(false);
      expect(ownsSession({ owner: 'pid:999999x' }, 'agent-L')).toBe(false);
      expect(ownsSession({ owner: 'pid:0' }, 'agent-L')).toBe(false);
      expect(ownsSession({ owner: 'pid:-1' }, 'agent-L')).toBe(false);
    });

    it('round-trips the owner through the metadata file', function () {
      const metadata: SessionMetadata = {
        id: 'owned',
        socketPath: getSocketPath(testSessionDir, 'owned'),
        logPath: getLogPath(testSessionDir, 'owned'),
        pid: 12345,
        profilePath: '/path/to/profile.json',
        createdAt: '2026-08-17T10:00:00.000Z',
        buildHash: TEST_BUILD_HASH,
        owner: 'agent-L',
      };

      saveSessionMetadata(testSessionDir, metadata);

      expect(loadSessionMetadata(testSessionDir, 'owned')?.owner).toBe(
        'agent-L'
      );
    });
  });

  describe('session age', function () {
    it('formats ages by the largest useful unit', function () {
      expect(formatSessionAge(0)).toBe('0s');
      expect(formatSessionAge(45_000)).toBe('45s');
      expect(formatSessionAge(90_000)).toBe('1m 30s');
      expect(formatSessionAge(3_900_000)).toBe('1h 5m');
      expect(formatSessionAge(100_000_000)).toBe('1d 3h');
    });

    it('reports an unusable duration as unknown rather than guessing', function () {
      expect(formatSessionAge(-1)).toBe('unknown');
      expect(formatSessionAge(NaN)).toBe('unknown');
    });

    it('measures the age from createdAt', function () {
      const now = Date.parse('2026-08-17T10:02:00.000Z');
      expect(
        getSessionAge({ createdAt: '2026-08-17T10:00:00.000Z' }, now)
      ).toBe('2m 0s');
    });

    it('returns null for an unparseable createdAt', function () {
      expect(getSessionAge({ createdAt: 'not a date' })).toBeNull();
    });
  });

  describe('listSessions', function () {
    it('returns empty array when no sessions exist', function () {
      const sessions = listSessions(testSessionDir);
      expect(sessions).toEqual([]);
    });

    it('lists all session IDs', function () {
      // Create multiple sessions
      saveSessionMetadata(testSessionDir, {
        id: 'session1',
        socketPath: getSocketPath(testSessionDir, 'session1'),
        logPath: getLogPath(testSessionDir, 'session1'),
        pid: 1,
        profilePath: '/test1.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      });

      saveSessionMetadata(testSessionDir, {
        id: 'session2',
        socketPath: getSocketPath(testSessionDir, 'session2'),
        logPath: getLogPath(testSessionDir, 'session2'),
        pid: 2,
        profilePath: '/test2.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      });

      const sessions = listSessions(testSessionDir);
      expect(sessions).toContain('session1');
      expect(sessions).toContain('session2');
      expect(sessions.length).toBe(2);
    });

    it('ignores non-JSON files', function () {
      // Create session metadata
      saveSessionMetadata(testSessionDir, {
        id: 'session1',
        socketPath: getSocketPath(testSessionDir, 'session1'),
        logPath: getLogPath(testSessionDir, 'session1'),
        pid: 1,
        profilePath: '/test.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      });

      // Create non-JSON files
      fs.writeFileSync(path.join(testSessionDir, 'session1.sock'), '');
      fs.writeFileSync(path.join(testSessionDir, 'session1.log'), '');
      fs.writeFileSync(path.join(testSessionDir, 'random.txt'), '');

      const sessions = listSessions(testSessionDir);
      expect(sessions).toEqual(['session1']);
    });
  });
});
