/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Client for communicating with the profiler-cli daemon.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import type {
  ClientCommand,
  ClientMessage,
  ServerResponse,
  CommandResult,
} from './protocol';
import {
  cleanupSession,
  generateSessionId,
  getCurrentSessionId,
  getCurrentSocketPath,
  getLogPath,
  getLogSize,
  getSocketPath,
  getStartupErrorPath,
  isDaemonReachable,
  loadSessionMetadata,
  readLogTail,
  takeStartupError,
  validateSession,
  waitForSocketClose,
} from './session';
import {
  assertSocketPathUsable,
  describeManualKill,
  ensureSessionDirUsable,
  indentBlock,
} from './diagnostics';
import { BUILD_HASH } from './constants';

type BuildMismatchShutdownResult = 'stopped' | 'already-dead' | 'still-running';

async function sendMessageToSocket(
  socketPath: string,
  message: ClientMessage,
  timeoutMs: number = 30000
): Promise<ServerResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    let buffer = '';

    socket.on('connect', () => {
      socket.write(JSON.stringify(message) + '\n');
    });

    socket.on('data', (data) => {
      buffer += data.toString();

      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const line = buffer.substring(0, newlineIndex);
        try {
          const response = JSON.parse(line) as ServerResponse;
          socket.end();
          resolve(response);
        } catch (error) {
          socket.destroy();
          reject(new Error(`Failed to parse response: ${error}`));
        }
      }
    });

    socket.on('error', (error) => {
      reject(new Error(`Socket error: ${error.message}`));
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });

    socket.setTimeout(timeoutMs);
  });
}

async function attemptShutdownOnBuildMismatch(
  sessionDir: string,
  sessionId: string,
  socketPath: string
): Promise<BuildMismatchShutdownResult> {
  try {
    const response = await sendMessageToSocket(
      socketPath,
      { type: 'shutdown' },
      2000
    );

    if (response.type !== 'success') {
      console.error(
        `Failed to stop mismatched daemon for session ${sessionId}: unexpected response ${response.type}`
      );
      return (await isDaemonReachable(socketPath))
        ? 'still-running'
        : 'already-dead';
    }

    const exited = await waitForSocketClose(socketPath);
    if (!exited) {
      console.error(
        `Mismatched daemon for session ${sessionId} acknowledged shutdown but did not exit within timeout`
      );
      return 'still-running';
    }

    cleanupSession(sessionDir, sessionId);
    return 'stopped';
  } catch (error) {
    if (!(await isDaemonReachable(socketPath))) {
      cleanupSession(sessionDir, sessionId);
      return 'already-dead';
    }

    console.error(
      `Failed to stop mismatched daemon for session ${sessionId}: ${error}`
    );
    return 'still-running';
  }
}

/**
 * Send a message to the daemon and return the raw response.
 */
async function sendRawMessage(
  sessionDir: string,
  message: ClientMessage,
  sessionId?: string
): Promise<ServerResponse> {
  const resolvedSessionId = sessionId || getCurrentSessionId(sessionDir);

  if (!resolvedSessionId) {
    throw new Error('No active session. Run "profiler-cli load <PATH>" first.');
  }

  // Validate the session
  if (!(await validateSession(sessionDir, resolvedSessionId))) {
    cleanupSession(sessionDir, resolvedSessionId);
    throw new Error(
      `Session ${resolvedSessionId} is not running or is invalid.`
    );
  }

  // Check build hash matches
  const metadata = loadSessionMetadata(sessionDir, resolvedSessionId);
  if (metadata && metadata.buildHash !== BUILD_HASH) {
    const shutdownResult = await attemptShutdownOnBuildMismatch(
      sessionDir,
      resolvedSessionId,
      metadata.socketPath
    );

    const shutdownMessage =
      shutdownResult === 'stopped' || shutdownResult === 'already-dead'
        ? 'The daemon is no longer running.'
        : 'The daemon may still be running; stop it before reusing this session id.';

    throw new Error(
      `Session ${resolvedSessionId} was built with a different version (daemon: ${metadata.buildHash}, client: ${BUILD_HASH}). ${shutdownMessage} Please run "profiler-cli load <PATH>" again.`
    );
  }

  const socketPath = sessionId
    ? getSocketPath(sessionDir, sessionId)
    : getCurrentSocketPath(sessionDir);

  if (!socketPath) {
    throw new Error(`Socket not found for session ${resolvedSessionId}`);
  }

  return sendMessageToSocket(socketPath, message);
}

/**
 * Send a message to the daemon and return the result.
 * Only works for messages that return success responses.
 * Result can be either a string (legacy) or a structured CommandResult.
 */
export async function sendMessage(
  sessionDir: string,
  message: ClientMessage,
  sessionId?: string
): Promise<string | CommandResult> {
  const response = await sendRawMessage(sessionDir, message, sessionId);

  if (response.type === 'success') {
    return response.result;
  } else if (response.type === 'error') {
    throw new Error(response.error);
  } else {
    throw new Error(`Unexpected response type: ${response.type}`);
  }
}

/**
 * Send a status check to the daemon and return the response.
 */
async function sendStatusMessage(
  sessionDir: string,
  sessionId?: string
): Promise<ServerResponse> {
  return sendRawMessage(sessionDir, { type: 'status' }, sessionId);
}

/**
 * Send a command to the daemon.
 * Result can be either a string (legacy) or a structured CommandResult.
 */
export async function sendCommand(
  sessionDir: string,
  command: ClientCommand,
  sessionId?: string
): Promise<string | CommandResult> {
  return sendMessage(sessionDir, { type: 'command', command }, sessionId);
}

function hasProxyEnvVar(): boolean {
  return Boolean(
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.https_proxy
  );
}

type DaemonEarlyExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

/**
 * What is needed to dig a failure reason out of a session directory.
 * `logStartByte` is where the log stood before this daemon was spawned, so that
 * a session id reused after an earlier failure cannot pass off that earlier
 * daemon's output as this one's.
 */
type DaemonFailureContext = {
  sessionDir: string;
  sessionId: string;
  logStartByte: number;
};

/**
 * What the client knows about the daemon at the point it gives up on it.
 */
type DaemonCondition =
  // The process is gone. `foregroundCommand` reproduces the spawn with stdio
  // attached, which is the only way to see output from a daemon that died
  // without writing anything.
  | { kind: 'exited'; foregroundCommand: string }
  // The process is alive but has not published its session metadata yet.
  | { kind: 'still-starting'; pid: number | undefined };

/**
 * Describe the daemon's condition, to go under a headline that has already
 * stated what went wrong. `silent` says the daemon left neither a startup error
 * nor a log, so this is all the message will have to go on.
 */
function describeDaemonCondition(
  condition: DaemonCondition,
  silent: boolean
): string[] {
  if (condition.kind === 'still-starting') {
    return [
      'It has not exited, so it is most likely still starting, and retrying often works.',
      ...(condition.pid ? [describeManualKill(condition.pid)] : []),
    ];
  }

  if (!silent) {
    // Whatever it managed to log says more about how far it got than a guess.
    return [];
  }

  return [
    'It died before it could report a reason, so either the runtime failed to start or something outside the process killed it (out of memory, or a sandbox shutting it down).',
    `Run it in the foreground to see what the runtime prints: ${condition.foregroundCommand}`,
  ];
}

/**
 * Turn a daemon that never came up into an actionable message.
 *
 * The daemon runs detached with its stdio discarded, so the reason has to be
 * recovered from the session directory: first the startup error file the daemon
 * writes on the way out, then the tail of its log, and failing both, whatever
 * its condition allows us to say.
 */
function formatDaemonFailure(
  context: DaemonFailureContext,
  headline: string,
  condition: DaemonCondition
): string {
  const { sessionDir, sessionId, logStartByte } = context;

  const startupError = takeStartupError(sessionDir, sessionId);
  if (startupError) {
    // The daemon said why itself, which beats anything inferred here.
    return [`${headline}:`, indentBlock(startupError)].join('\n');
  }

  const logPath = getLogPath(sessionDir, sessionId);
  const logTail = readLogTail(sessionDir, sessionId, logStartByte);
  if (logTail) {
    return [
      `${headline}.`,
      ...describeDaemonCondition(condition, false),
      `Last lines of ${logPath}:`,
      indentBlock(logTail),
    ].join('\n');
  }

  return [
    `${headline}, without writing anything to ${logPath}.`,
    ...describeDaemonCondition(condition, true),
  ].join('\n');
}

function describeDaemonExit(earlyExit: DaemonEarlyExit): string {
  return earlyExit.signal !== null
    ? `killed by signal ${earlyExit.signal}`
    : `exit code ${earlyExit.code}`;
}

/**
 * Start a new daemon for the given profile.
 * Uses a two-phase approach:
 * 1. Wait for daemon to be validated (short 500ms timeout)
 * 2. Wait for profile to load via status checks (longer 60s timeout)
 */
export async function startNewDaemon(
  sessionDir: string,
  profilePath: string,
  sessionId?: string,
  symbolServerUrl?: string
): Promise<string> {
  // Check if this is a URL
  const isUrl =
    profilePath.startsWith('http://') || profilePath.startsWith('https://');

  // Resolve the absolute path (only for file paths, not URLs)
  const absolutePath = isUrl ? profilePath : path.resolve(profilePath);

  // Check if file exists (skip this check for URLs)
  if (!isUrl && !fs.existsSync(absolutePath)) {
    throw new Error(`Profile file not found: ${absolutePath}`);
  }

  // Generate a session ID upfront if not provided, so we know exactly which
  // session to wait for (avoids race condition with existing sessions)
  const targetSessionId = sessionId || generateSessionId();

  // Before ensureSessionDirUsable(), so a path the kernel will never accept is
  // rejected without first creating a directory tree for it.
  assertSocketPathUsable(getSocketPath(sessionDir, targetSessionId));

  // The daemon cannot report an unusable session directory, because it needs
  // that directory to reach us at all, so check it here, while there is still
  // a terminal to print to.
  ensureSessionDirUsable(sessionDir);

  // A record left by an earlier daemon on this session id would be mistaken
  // for this one's. The log cannot be deleted the same way, since it is kept
  // on purpose for debugging, so note where it ends instead.
  fs.rmSync(getStartupErrorPath(sessionDir, targetSessionId), { force: true });
  const failureContext: DaemonFailureContext = {
    sessionDir,
    sessionId: targetSessionId,
    logStartByte: getLogSize(sessionDir, targetSessionId),
  };

  if (sessionId) {
    const existingSession = await validateSession(sessionDir, targetSessionId);
    if (existingSession) {
      throw new Error(
        `Session ${targetSessionId} is already running. Stop it first or choose a different session id.`
      );
    }

    if (loadSessionMetadata(sessionDir, targetSessionId)) {
      cleanupSession(sessionDir, targetSessionId);
    }
  }

  // Get the path to the current script (profiler-cli.js)
  const scriptPath = process.argv[1];

  // --use-env-proxy was added in Node.js 24. On older runtimes node would
  // exit immediately with "bad option", taking the daemon down with it.
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const supportsUseEnvProxy = nodeMajor >= 24;

  if (!supportsUseEnvProxy && hasProxyEnvVar()) {
    console.warn(
      `Warning: Node.js ${process.versions.node} detected. HTTP_PROXY/HTTPS_PROXY env vars will not be honored when fetching profiles or symbols. Upgrade to Node.js >= 24 for proxy support.`
    );
  }

  const daemonArgs = [
    // Make fetch respect HTTP_PROXY/HTTPS_PROXY/NO_PROXY. This is the default
    // in a lot of tools like curl, python, go etc.
    ...(supportsUseEnvProxy ? ['--use-env-proxy'] : []),
    scriptPath,
    '--daemon',
    absolutePath,
    '--session',
    targetSessionId,
  ];
  if (symbolServerUrl) {
    daemonArgs.push('--symbol-server', symbolServerUrl);
  }

  // Spawn the daemon process (detached from parent)
  const child = child_process.spawn(
    process.execPath, // node
    daemonArgs,
    {
      detached: true,
      stdio: 'ignore', // Don't pipe stdin/stdout/stderr
      env: { ...process.env, PROFILER_CLI_SESSION_DIR: sessionDir }, // Pass sessionDir via env
    }
  );

  // Unref so parent can exit
  child.unref();

  // Observe early daemon death so spawn-time failures surface immediately
  // instead of as a generic 500ms validation timeout.
  const daemonStartupState: {
    earlyExit: DaemonEarlyExit | null;
    spawnError: Error | null;
  } = { earlyExit: null, spawnError: null };
  child.once('exit', (code, signal) => {
    daemonStartupState.earlyExit = { code, signal };
  });
  child.once('error', (err) => {
    daemonStartupState.spawnError = err;
  });

  const foregroundCommand = `${process.execPath} ${scriptPath} --daemon ${absolutePath} --session ${targetSessionId}`;

  const daemonExitedError = (earlyExit: DaemonEarlyExit, what: string) =>
    new Error(
      formatDaemonFailure(
        failureContext,
        `The profiler-cli daemon ${what} (${describeDaemonExit(earlyExit)})`,
        { kind: 'exited', foregroundCommand }
      )
    );

  // Phase 1: Wait for daemon to be validated (short timeout)
  const daemonStartMaxAttempts = 10; // 10 * 50ms = 500ms
  let attempts = 0;

  while (attempts < daemonStartMaxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;

    if (daemonStartupState.spawnError) {
      throw new Error(
        [
          `Failed to spawn the profiler-cli daemon (${process.execPath}).`,
          `Underlying error: ${daemonStartupState.spawnError.message}`,
          'Sandboxes and process-limited environments can refuse to start detached child processes.',
        ].join('\n')
      );
    }
    if (daemonStartupState.earlyExit) {
      throw daemonExitedError(
        daemonStartupState.earlyExit,
        'exited during startup'
      );
    }

    // Validate the session (checks metadata exists, process running, socket exists)
    if (await validateSession(sessionDir, targetSessionId)) {
      // Daemon is validated and running
      break;
    }
  }

  // Check if daemon started successfully after polling
  if (!(await validateSession(sessionDir, targetSessionId))) {
    if (daemonStartupState.earlyExit) {
      throw daemonExitedError(
        daemonStartupState.earlyExit,
        'exited during startup'
      );
    }

    // It has not exited and has not published its metadata, so it is still
    // starting. Saying it died here would be wrong, and would send the user
    // looking for an environment problem that the checks above have ruled out.
    throw new Error(
      formatDaemonFailure(
        failureContext,
        `The profiler-cli daemon did not become ready within ${daemonStartMaxAttempts * 50}ms`,
        { kind: 'still-starting', pid: child.pid }
      )
    );
  }

  // Phase 2: Wait for profile to load by checking status (longer timeout).
  // Override with PROFILER_CLI_LOAD_TIMEOUT_MS env var for large profiles.
  const loadTimeoutMs = process.env.PROFILER_CLI_LOAD_TIMEOUT_MS
    ? parseInt(process.env.PROFILER_CLI_LOAD_TIMEOUT_MS, 10)
    : 60_000;
  const profileLoadMaxAttempts = Math.ceil(loadTimeoutMs / 100);
  attempts = 0;
  let printedSymbolicating = false;

  while (attempts < profileLoadMaxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;

    // A daemon that dies while loading (out of memory, killed by the sandbox)
    // would otherwise keep us polling a dead socket until the load timeout.
    if (daemonStartupState.earlyExit) {
      throw daemonExitedError(
        daemonStartupState.earlyExit,
        'died while loading the profile'
      );
    }

    try {
      const response = await sendStatusMessage(sessionDir, targetSessionId);

      switch (response.type) {
        case 'ready':
          // Profile loaded successfully
          return targetSessionId;

        case 'loading':
          // Still loading, keep waiting
          continue;

        case 'symbolicating':
          if (!printedSymbolicating) {
            console.log('Symbolicating...');
            printedSymbolicating = true;
          }
          continue;

        case 'error':
          // Profile load failed, fail immediately
          throw new Error(response.error);

        default:
          // Unexpected response type
          throw new Error(
            `Unexpected response type: ${(response as any).type}`
          );
      }
    } catch (error) {
      // Socket connection errors - daemon might still be setting up
      // Keep retrying unless it's an explicit error response
      if (
        error instanceof Error &&
        error.message.startsWith('Profile load failed')
      ) {
        throw error;
      }
      continue;
    }
  }

  // If we got here, profile load timed out
  throw new Error(
    `Profile load timeout after ${loadTimeoutMs}ms (set PROFILER_CLI_LOAD_TIMEOUT_MS to override)`
  );
}

/**
 * Stop a running daemon.
 */
export async function stopDaemon(
  sessionDir: string,
  sessionId?: string
): Promise<void> {
  const resolvedSessionId = sessionId || getCurrentSessionId(sessionDir);

  if (!resolvedSessionId) {
    throw new Error('No active session to stop.');
  }

  // Send shutdown command
  try {
    await sendMessage(sessionDir, { type: 'shutdown' }, resolvedSessionId);
  } catch (error) {
    // If the daemon is already dead, that's fine
    console.error(`Note: ${error}`);
  }

  // Wait a bit for cleanup
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log(`Session ${resolvedSessionId} stopped`);
}
