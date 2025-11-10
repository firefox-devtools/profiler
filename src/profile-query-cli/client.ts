/**
 * Client for communicating with the pq daemon.
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
  getSocketPath,
  loadSessionMetadata,
  validateSession,
} from './session';
import { BUILD_HASH } from './constants';

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
    throw new Error('No active session. Run "pq load <PATH>" first.');
  }

  // Validate the session
  if (!validateSession(sessionDir, resolvedSessionId)) {
    cleanupSession(sessionDir, resolvedSessionId);
    throw new Error(
      `Session ${resolvedSessionId} is not running or is invalid.`
    );
  }

  // Check build hash matches
  const metadata = loadSessionMetadata(sessionDir, resolvedSessionId);
  if (metadata && metadata.buildHash !== BUILD_HASH) {
    cleanupSession(sessionDir, resolvedSessionId);
    throw new Error(
      `Session ${resolvedSessionId} was built with a different version (daemon: ${metadata.buildHash}, client: ${BUILD_HASH}). The daemon has been stopped. Please run "pq load <PATH>" again.`
    );
  }

  const socketPath = sessionId
    ? getSocketPath(sessionDir, sessionId)
    : getCurrentSocketPath(sessionDir);

  if (!socketPath || !fs.existsSync(socketPath)) {
    throw new Error(`Socket not found for session ${resolvedSessionId}`);
  }

  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    let buffer = '';

    socket.on('connect', () => {
      // Send the message
      socket.write(JSON.stringify(message) + '\n');
    });

    socket.on('data', (data) => {
      buffer += data.toString();

      // Look for complete response (newline-delimited JSON)
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const line = buffer.substring(0, newlineIndex);
        try {
          const response = JSON.parse(line) as ServerResponse;
          socket.end();
          resolve(response);
        } catch (error) {
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

    socket.setTimeout(30000); // 30 second timeout
  });
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

/**
 * Start a new daemon for the given profile.
 * Uses a two-phase approach:
 * 1. Wait for daemon to be validated (short 500ms timeout)
 * 2. Wait for profile to load via status checks (longer 60s timeout)
 */
export async function startNewDaemon(
  sessionDir: string,
  profilePath: string,
  sessionId?: string
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

  // Get the path to the current script (pq.js)
  const scriptPath = process.argv[1];

  // Spawn the daemon process (detached from parent)
  const child = child_process.spawn(
    process.execPath, // node
    [scriptPath, '--daemon', absolutePath, '--session', targetSessionId],
    {
      detached: true,
      stdio: 'ignore', // Don't pipe stdin/stdout/stderr
      env: { ...process.env, PQ_SESSION_DIR: sessionDir }, // Pass sessionDir via env
    }
  );

  // Unref so parent can exit
  child.unref();

  // Phase 1: Wait for daemon to be validated (short timeout)
  const daemonStartMaxAttempts = 10; // 10 * 50ms = 500ms
  let attempts = 0;

  while (attempts < daemonStartMaxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;

    // Validate the session (checks metadata exists, process running, socket exists)
    if (validateSession(sessionDir, targetSessionId)) {
      // Daemon is validated and running
      break;
    }
  }

  // Check if daemon started successfully after polling
  if (!validateSession(sessionDir, targetSessionId)) {
    throw new Error(
      `Failed to start daemon: session not validated after ${daemonStartMaxAttempts * 50}ms`
    );
  }

  // Phase 2: Wait for profile to load by checking status (longer timeout)
  const profileLoadMaxAttempts = 600; // 600 * 100ms = 60 seconds
  attempts = 0;

  while (attempts < profileLoadMaxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;

    try {
      const response = await sendStatusMessage(sessionDir, targetSessionId);

      switch (response.type) {
        case 'ready':
          // Profile loaded successfully
          return targetSessionId;

        case 'loading':
          // Still loading, keep waiting
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
    `Profile load timeout after ${profileLoadMaxAttempts * 100}ms`
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
