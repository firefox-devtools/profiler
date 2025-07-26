/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for profile-query CLI session management.
 *
 * These tests cover only the session.ts utility functions.
 * Integration tests that spawn daemons and test IPC are in bash scripts:
 * - bin/pq-test: Basic daemon lifecycle
 * - bin/pq-test-multi: Concurrent sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ensureSessionDir,
  generateSessionId,
  getSocketPath,
  getLogPath,
  getMetadataPath,
  saveSessionMetadata,
  loadSessionMetadata,
  setCurrentSession,
  getCurrentSessionId,
  getCurrentSocketPath,
  isProcessRunning,
  cleanupSession,
  validateSession,
  listSessions,
} from 'firefox-profiler/profile-query-cli/session';
import type { SessionMetadata } from 'firefox-profiler/profile-query-cli/protocol';

const TEST_BUILD_HASH = 'test-build-hash';

describe('profile-query-cli session management', function () {
  let testSessionDir: string;

  beforeEach(function () {
    // Create a unique temp directory for each test
    testSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-test-'));
  });

  afterEach(function () {
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
    it('getSocketPath returns correct path', function () {
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      expect(socketPath).toBe(path.join(testSessionDir, 'test123.sock'));
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
      const socketPath = getSocketPath(testSessionDir, sessionId);
      fs.writeFileSync(socketPath, '');

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
      const socket1 = getSocketPath(testSessionDir, 'session1');
      fs.writeFileSync(socket1, '');
      setCurrentSession(testSessionDir, 'session1');
      expect(getCurrentSessionId(testSessionDir)).toBe('session1');

      // Create second session
      const socket2 = getSocketPath(testSessionDir, 'session2');
      fs.writeFileSync(socket2, '');
      setCurrentSession(testSessionDir, 'session2');
      expect(getCurrentSessionId(testSessionDir)).toBe('session2');
    });

    it('getCurrentSocketPath resolves to correct path', function () {
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      fs.writeFileSync(socketPath, '');

      setCurrentSession(testSessionDir, sessionId);

      const currentPath = getCurrentSocketPath(testSessionDir);
      expect(currentPath).toBe(socketPath);
    });
  });

  describe('isProcessRunning', function () {
    it('returns true for current process', function () {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it('returns false for non-existent PID', function () {
      expect(isProcessRunning(999999)).toBe(false);
    });
  });

  describe('cleanupSession', function () {
    it('removes socket and metadata files', function () {
      const sessionId = 'test123';
      const socketPath = getSocketPath(testSessionDir, sessionId);
      const metadataPath = getMetadataPath(testSessionDir, sessionId);

      fs.writeFileSync(socketPath, '');
      fs.writeFileSync(metadataPath, '{}');

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
      const socketPath = getSocketPath(testSessionDir, sessionId);
      fs.writeFileSync(socketPath, '');
      setCurrentSession(testSessionDir, sessionId);

      cleanupSession(testSessionDir, sessionId);

      expect(getCurrentSessionId(testSessionDir)).toBeNull();
    });

    it('does not remove current session symlink if it points to different session', function () {
      // Set current session to session1
      const socket1 = getSocketPath(testSessionDir, 'session1');
      fs.writeFileSync(socket1, '');
      setCurrentSession(testSessionDir, 'session1');

      // Clean up session2
      cleanupSession(testSessionDir, 'session2');

      // Current session should still be session1
      expect(getCurrentSessionId(testSessionDir)).toBe('session1');
    });
  });

  describe('validateSession', function () {
    it('returns false for non-existent session', function () {
      expect(validateSession(testSessionDir, 'nonexistent')).toBe(null);
    });

    it('returns false for session with dead PID', function () {
      const sessionId = 'test123';
      const metadata: SessionMetadata = {
        id: sessionId,
        socketPath: getSocketPath(testSessionDir, sessionId),
        logPath: getLogPath(testSessionDir, sessionId),
        pid: 999999, // Non-existent PID
        profilePath: '/path/to/profile.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      };

      saveSessionMetadata(testSessionDir, metadata);
      fs.writeFileSync(metadata.socketPath, '');

      expect(validateSession(testSessionDir, sessionId)).toBe(null);
    });

    it('returns false for session with missing socket', function () {
      const sessionId = 'test123';
      const metadata: SessionMetadata = {
        id: sessionId,
        socketPath: getSocketPath(testSessionDir, sessionId),
        logPath: getLogPath(testSessionDir, sessionId),
        pid: process.pid, // Use current process PID (guaranteed to exist)
        profilePath: '/path/to/profile.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      };

      saveSessionMetadata(testSessionDir, metadata);
      // Intentionally don't create socket file

      expect(validateSession(testSessionDir, sessionId)).toBe(null);
    });

    it('returns true for valid session', function () {
      const sessionId = 'test123';
      const metadata: SessionMetadata = {
        id: sessionId,
        socketPath: getSocketPath(testSessionDir, sessionId),
        logPath: getLogPath(testSessionDir, sessionId),
        pid: process.pid, // Use current process PID
        profilePath: '/path/to/profile.json',
        createdAt: new Date().toISOString(),
        buildHash: TEST_BUILD_HASH,
      };

      saveSessionMetadata(testSessionDir, metadata);
      fs.writeFileSync(metadata.socketPath, '');

      expect(validateSession(testSessionDir, sessionId)).not.toBe(null);
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
