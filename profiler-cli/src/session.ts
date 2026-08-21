/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Session management for profiler-cli daemon.
 * Handles session files, socket paths, and current session tracking.
 *
 * All functions take an explicit sessionDir parameter for testability
 * and to avoid global state. The CLI entry point reads PROFILER_CLI_SESSION_DIR
 * once and passes it through.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as crypto from 'crypto';
import type { SessionMetadata } from './protocol';
import { describeSessionDirFailure, getErrnoCode } from './diagnostics';

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

/** Names the owner of the sessions a process creates, and the ones it may stop. */
export const SESSION_OWNER_ENV_VAR = 'PROFILER_CLI_SESSION_OWNER';

/**
 * Identify the caller for session ownership purposes.
 *
 * The parent pid is the fallback because separate `profiler-cli` invocations
 * from one shell share a parent, giving them a common identity without any
 * setup.
 */
export function getSessionOwner(
  env: NodeJS.ProcessEnv = process.env,
  parentPid: number = process.ppid
): string {
  const configured = env[SESSION_OWNER_ENV_VAR];
  if (configured !== undefined && configured.trim() !== '') {
    return configured.trim();
  }
  return `pid:${parentPid}`;
}

/**
 * The owner recorded in a metadata file, or null when there is not a usable one.
 *
 * JSON has no `undefined`, so a `null` owner is a value these files really
 * hold; comparing it by equality against a string would match nobody and lock
 * the session away from every caller.
 */
export function readSessionOwner(
  metadata: Pick<SessionMetadata, 'owner'>
): string | null {
  const recorded = metadata.owner;
  if (typeof recorded !== 'string' || recorded.trim() === '') {
    return null;
  }
  return recorded.trim();
}

/** The pid a `pid:<n>` owner refers to, or null for any other owner form. */
function getOwnerPid(owner: string): number | null {
  const match = /^pid:(\d+)$/.exec(owner);
  if (match === null) {
    return null;
  }
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Whether a `pid:<n>` owner's process is *provably* gone.
 *
 * Only ESRCH proves it. EPERM means a process is there that we may not signal,
 * which a sandbox also returns for processes we do own, and success means
 * alive. Releasing a session on anything but ESRCH would hand it to other
 * callers whenever the answer was merely unavailable.
 */
function isOwnerProcessGone(owner: string): boolean {
  const pid = getOwnerPid(owner);
  if (pid === null) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return getErrnoCode(error) === 'ESRCH';
  }
}

/**
 * Whether `owner` may stop a session recorded with this metadata.
 *
 * A session with no usable owner is stoppable by anyone, as sessions written
 * before owner tracking are. So is one owned by a `pid:` that has exited: the
 * daemon is detached and outlives the shell that started it, so nobody could
 * ever present that pid again. Only `pid:` owners are released this way, so a
 * name from PROFILER_CLI_SESSION_OWNER keeps the guard for the session's life.
 */
export function ownsSession(
  metadata: Pick<SessionMetadata, 'owner'>,
  owner: string
): boolean {
  const recorded = readSessionOwner(metadata);
  if (recorded === null || recorded === owner) {
    return true;
  }
  return isOwnerProcessGone(recorded);
}

/**
 * Human-readable owner of a session, for listings and refusals.
 *
 * Says "unknown" for exactly the values ownsSession() treats as unowned, so a
 * session is never described as someone's while being stoppable by anyone.
 */
export function describeSessionOwner(
  metadata: Pick<SessionMetadata, 'owner'>
): string {
  return readSessionOwner(metadata) ?? 'unknown';
}

/** Format an elapsed duration compactly, for session ages in `session list`. */
export function formatSessionAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 'unknown';
  }
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Age of a session as of `now`, or null when its creation time is unusable. */
export function getSessionAge(
  metadata: Pick<SessionMetadata, 'createdAt'>,
  now: number = Date.now()
): string | null {
  const createdAt = new Date(metadata.createdAt).getTime();
  if (Number.isNaN(createdAt)) {
    return null;
  }
  return formatSessionAge(now - createdAt);
}

/**
 * Get a stable namespace for a session directory.
 */
export function getSessionDirNamespace(sessionDir: string): string {
  const resolvedSessionDir = path.resolve(sessionDir).toLowerCase();
  return crypto
    .createHash('sha256')
    .update(resolvedSessionDir)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Get the socket path for a session.
 * On Windows, returns a named pipe path. On Unix, returns a .sock file path.
 */
export function getSocketPath(sessionDir: string, sessionId: string): string {
  if (process.platform === 'win32') {
    const sessionDirNamespace = getSessionDirNamespace(sessionDir);
    return `\\\\.\\pipe\\profiler-cli-${sessionDirNamespace}-${sessionId}`;
  }
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
 * Get the path of the startup failure record for a session.
 *
 * The daemon is spawned detached with its stdio discarded, so this file is how
 * it tells the client why it could not start. The extension deliberately isn't
 * `.json`, which `listSessions` uses to enumerate sessions.
 */
export function getStartupErrorPath(
  sessionDir: string,
  sessionId: string
): string {
  return path.join(sessionDir, `${sessionId}.error`);
}

/**
 * Record why the daemon failed to start, for the client to pick up.
 */
export function writeStartupError(
  sessionDir: string,
  sessionId: string,
  message: string
): void {
  try {
    fs.writeFileSync(getStartupErrorPath(sessionDir, sessionId), message);
  } catch {
    // The session directory being unwritable is itself one of the failures
    // this file reports, so there is nothing useful to do here.
  }
}

/**
 * Read and delete the startup failure record for a session, if there is one.
 */
export function takeStartupError(
  sessionDir: string,
  sessionId: string
): string | null {
  const errorPath = getStartupErrorPath(sessionDir, sessionId);
  try {
    const message = fs.readFileSync(errorPath, 'utf-8').trim();
    fs.rmSync(errorPath, { force: true });
    return message || null;
  } catch {
    return null;
  }
}

/**
 * Current size of a session's daemon log, or 0 if it has none.
 *
 * Daemons append to the log of the session id they are given, and the log is
 * kept on purpose across sessions, so callers that only care about one daemon's
 * output record the size before starting it and read from there.
 */
export function getLogSize(sessionDir: string, sessionId: string): number {
  try {
    return fs.statSync(getLogPath(sessionDir, sessionId)).size;
  } catch {
    return 0;
  }
}

/**
 * Read the last `maxLines` lines of a session's daemon log, if it has one,
 * ignoring everything before `fromByte`.
 */
export function readLogTail(
  sessionDir: string,
  sessionId: string,
  fromByte: number = 0,
  maxLines: number = 15
): string | null {
  try {
    const contents = fs
      .readFileSync(getLogPath(sessionDir, sessionId))
      .subarray(fromByte)
      .toString('utf-8')
      .trimEnd();
    if (!contents) {
      return null;
    }
    return contents.split('\n').slice(-maxLines).join('\n');
  } catch {
    return null;
  }
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

  try {
    return fs.readFileSync(currentSessionFile, 'utf-8').trim();
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw new Error(describeSessionDirFailure(sessionDir, 'read', error));
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
 * Attempt a socket connection to a daemon. Resolves with null when the daemon
 * answers, or with the connection error when it does not.
 *
 * Callers use the errno to tell "there is no daemon" (ENOENT, ECONNREFUSED)
 * apart from "this process is not allowed to reach the daemon" (EACCES,
 * EPERM), which are very different problems with the same symptom.
 * Works for both Unix domain sockets and Windows named pipes.
 */
export async function probeDaemonSocket(
  socketPath: string
): Promise<NodeJS.ErrnoException | null> {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve(error);
    });
    socket.on('timeout', () => {
      socket.destroy();
      const error: NodeJS.ErrnoException = new Error(
        `connect ETIMEDOUT ${socketPath}`
      );
      error.code = 'ETIMEDOUT';
      resolve(error);
    });
  });
}

/**
 * Check if a daemon is reachable by attempting a socket connection.
 */
export async function isDaemonReachable(socketPath: string): Promise<boolean> {
  return (await probeDaemonSocket(socketPath)) === null;
}

/**
 * Wait for a daemon's socket to become unreachable (i.e. for the daemon to stop).
 */
export async function waitForSocketClose(
  socketPath: string,
  timeoutMs: number = 5000,
  pollIntervalMs: number = 50
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await isDaemonReachable(socketPath))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return !(await isDaemonReachable(socketPath));
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

  // Remove socket file (Unix only — named pipes on Windows are not filesystem files)
  // Use force: true to silently ignore ENOENT — client and daemon may both call
  // cleanupSession concurrently during version-mismatch shutdown, so the file
  // may already be gone by the time the second caller tries to unlink it.
  if (process.platform !== 'win32') {
    try {
      fs.rmSync(socketPath, { force: true });
    } catch {
      // Something that is not a socket sits at the socket path (a directory,
      // say). Removing the metadata below is what actually retires the
      // session, so it must not be blocked by junk we cannot unlink.
    }
  }

  // Remove metadata file
  fs.rmSync(metadataPath, { force: true });

  // Remove any startup failure record left behind by a previous daemon that
  // reused this session id.
  fs.rmSync(getStartupErrorPath(sessionDir, sessionId), { force: true });

  // Remove current session file if it points to this session
  const currentSessionId = getCurrentSessionId(sessionDir);
  if (currentSessionId === sessionId) {
    fs.rmSync(currentSessionFile, { force: true });
  }
}

/**
 * Errnos that prove no daemon is listening on a socket path: nothing is there
 * (ENOENT), something is there but has no listener (ECONNREFUSED), or what is
 * there is not a socket at all and so cannot have one (ENOTSOCK).
 *
 * Every other failure, such as EACCES from a sandbox policy or ETIMEDOUT from
 * a busy daemon, leaves open the possibility that the daemon is alive and well.
 */
function isDaemonProvablyGone(error: NodeJS.ErrnoException): boolean {
  const code = getErrnoCode(error);
  return code === 'ENOENT' || code === 'ECONNREFUSED' || code === 'ENOTSOCK';
}

/**
 * Why a session could not be reached, and whether its files were removed.
 */
export type UnreachableSession = {
  error: NodeJS.ErrnoException;
  cleanedUp: boolean;
};

/**
 * Probe a session that failed validation, and clean up after it only when its
 * daemon is provably gone. Resolves with null when the daemon answers after
 * all, meaning the failed validation was a blip.
 *
 * A dead daemon and a sandbox that forbids connect() are indistinguishable to
 * `validateSession`, but only the first justifies deleting the session files:
 * discarding a healthy session because this process may not talk to it orphans
 * a running daemon and destroys the socket it was reachable through.
 */
export async function cleanupIfDaemonGone(
  sessionDir: string,
  sessionId: string,
  socketPath: string
): Promise<UnreachableSession | null> {
  const error = await probeDaemonSocket(socketPath);
  if (!error) {
    return null;
  }

  const cleanedUp = isDaemonProvablyGone(error);
  if (cleanedUp) {
    cleanupSession(sessionDir, sessionId);
  }

  return { error, cleanedUp };
}

/**
 * Validate that a session is healthy (daemon reachable via socket).
 * If not, clean up stale files.
 */
export async function validateSession(
  sessionDir: string,
  sessionId: string
): Promise<SessionMetadata | null> {
  const metadata = loadSessionMetadata(sessionDir, sessionId);
  if (!metadata) {
    return null;
  }

  if (!(await isDaemonReachable(metadata.socketPath))) {
    return null;
  }

  return metadata;
}

/**
 * List all session IDs.
 */
export function listSessions(sessionDir: string): string[] {
  let files: string[];
  try {
    files = fs.readdirSync(sessionDir);
  } catch (error) {
    // A missing session directory simply means there are no sessions, so there
    // is no reason to create it just to list nothing.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new Error(describeSessionDirFailure(sessionDir, 'read', error));
  }

  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'));
}
