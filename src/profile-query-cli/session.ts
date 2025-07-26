/**
 * Session management for pq daemon.
 * Handles session files, socket paths, and current session tracking.
 *
 * All functions take an explicit sessionDir parameter for testability
 * and to avoid global state. The CLI entry point reads PQ_SESSION_DIR
 * once and passes it through.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SessionMetadata } from './protocol';

/**
 * Ensure the session directory exists.
 */
export function ensureSessionDir(sessionDir: string): void {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
}

/**
 * Generate a new session ID.
 */
export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Get the socket path for a session.
 */
export function getSocketPath(sessionDir: string, sessionId: string): string {
  return path.join(sessionDir, `${sessionId}.sock`);
}

/**
 * Get the log path for a session.
 */
export function getLogPath(sessionDir: string, sessionId: string): string {
  return path.join(sessionDir, `${sessionId}.log`);
}

/**
 * Get the metadata file path for a session.
 */
export function getMetadataPath(sessionDir: string, sessionId: string): string {
  return path.join(sessionDir, `${sessionId}.json`);
}

/**
 * Save session metadata to disk.
 */
export function saveSessionMetadata(
  sessionDir: string,
  metadata: SessionMetadata
): void {
  ensureSessionDir(sessionDir);
  const metadataPath = getMetadataPath(sessionDir, metadata.id);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Load session metadata from disk.
 */
export function loadSessionMetadata(
  sessionDir: string,
  sessionId: string
): SessionMetadata | null {
  const metadataPath = getMetadataPath(sessionDir, sessionId);
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(data) as SessionMetadata;
  } catch (_error) {
    return null;
  }
}

/**
 * Set the current session by writing to a text file.
 */
export function setCurrentSession(sessionDir: string, sessionId: string): void {
  ensureSessionDir(sessionDir);

  const currentSessionFile = path.join(sessionDir, 'current.txt');
  fs.writeFileSync(currentSessionFile, sessionId, 'utf-8');
}

/**
 * Get the current session ID by reading from a text file.
 */
export function getCurrentSessionId(sessionDir: string): string | null {
  const currentSessionFile = path.join(sessionDir, 'current.txt');

  if (!fs.existsSync(currentSessionFile)) {
    return null;
  }

  try {
    return fs.readFileSync(currentSessionFile, 'utf-8').trim();
  } catch (_error) {
    console.error(`Failed to read current session: ${_error}`);
    return null;
  }
}

/**
 * Get the socket path for the current session.
 */
export function getCurrentSocketPath(sessionDir: string): string | null {
  const sessionId = getCurrentSessionId(sessionDir);

  if (!sessionId) {
    return null;
  }

  return getSocketPath(sessionDir, sessionId);
}

/**
 * Check if a process is running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Clean up a session's files.
 */
export function cleanupSession(sessionDir: string, sessionId: string): void {
  const socketPath = getSocketPath(sessionDir, sessionId);
  const metadataPath = getMetadataPath(sessionDir, sessionId);
  const currentSessionFile = path.join(sessionDir, 'current.txt');
  // Note: We intentionally don't delete the log file for debugging purposes
  // const logPath = getLogPath(sessionDir, sessionId);

  // Remove socket file
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  // Remove metadata file
  if (fs.existsSync(metadataPath)) {
    fs.unlinkSync(metadataPath);
  }

  // Remove current session file if it points to this session
  const currentSessionId = getCurrentSessionId(sessionDir);
  if (currentSessionId === sessionId && fs.existsSync(currentSessionFile)) {
    fs.unlinkSync(currentSessionFile);
  }
}

/**
 * Validate that a session is healthy (process running, socket exists).
 * If not, clean up stale files.
 */
export function validateSession(
  sessionDir: string,
  sessionId: string
): SessionMetadata | null {
  const metadata = loadSessionMetadata(sessionDir, sessionId);
  if (!metadata) {
    return null;
  }

  // Check if process is still running
  if (!isProcessRunning(metadata.pid)) {
    // console.error(
    //   `Session ${sessionId} daemon process with PID ${metadata.pid} not found. Cleaning up.`
    // );
    return null;
  }

  // Check if socket exists
  if (!fs.existsSync(metadata.socketPath)) {
    // console.error(`Session ${sessionId} socket not found. Cleaning up.`);
    return null;
  }

  return metadata;
}

/**
 * List all session IDs.
 */
export function listSessions(sessionDir: string): string[] {
  ensureSessionDir(sessionDir);
  const files = fs.readdirSync(sessionDir);
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'));
}
