/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Human-readable diagnostics for the ways daemon startup can fail.
 *
 * The daemon is spawned detached with its stdio discarded, so without help the
 * client can only report an exit code. Most real-world failures come from
 * sandboxes: a home directory that cannot be written, or a policy that refuses
 * bind() on Unix domain sockets.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Advice shown whenever the failure looks like a sandbox restriction on the
 * session directory.
 */
export const SESSION_DIR_SANDBOX_HINT =
  'Sandboxes (agent sandboxes, containers, restricted CI runners) commonly deny access outside the workspace, including the home directory.';

/**
 * Advice shown whenever the failure looks like a sandbox restriction on Unix
 * domain sockets themselves rather than on the directory holding them.
 */
export const SOCKET_SANDBOX_HINT =
  'profiler-cli needs a Unix domain socket to talk to its daemon. If you are inside a sandbox, allow Unix domain sockets in the sandbox policy, point PROFILER_CLI_SESSION_DIR at a directory the sandbox can write to, or run profiler-cli outside the sandbox.';

/**
 * Length limit of `sun_path` in `struct sockaddr_un`, minus the NUL
 * terminator: 108 bytes on Linux, 104 on the BSDs (macOS included).
 */
const MAX_UNIX_SOCKET_PATH_BYTES = process.platform === 'linux' ? 107 : 103;

/**
 * Extract the errno string (`EACCES`, `EPERM`, …) from an unknown thrown value.
 */
export function getErrnoCode(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A session directory the caller is likely to be allowed to write to.
 */
function suggestedSessionDir(): string {
  return path.join(os.tmpdir(), 'profiler-cli');
}

/**
 * Tell the user where the current session directory came from and how to move
 * it somewhere usable.
 */
function sessionDirHint(): string {
  const origin = process.env.PROFILER_CLI_SESSION_DIR
    ? 'This directory comes from PROFILER_CLI_SESSION_DIR.'
    : 'This is the default session directory (PROFILER_CLI_SESSION_DIR is not set).';
  return (
    `${origin}\n` +
    `Point profiler-cli somewhere writable, for example:\n` +
    `  PROFILER_CLI_SESSION_DIR=${suggestedSessionDir()} profiler-cli load <PATH>\n` +
    `A directory inside your workspace also works, as long as the socket path stays short.`
  );
}

/**
 * Plain-language explanation of a filesystem errno, or null when the code has
 * no explanation worth adding on top of the raw message.
 */
function explainFsErrno(code: string | undefined): string | null {
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return `Permission denied. ${SESSION_DIR_SANDBOX_HINT}`;
    case 'EROFS':
      return 'The filesystem is read-only.';
    case 'ENOSPC':
      return 'No space left on the device.';
    case 'EDQUOT':
      return 'The disk quota for this user is exhausted.';
    case 'ENOTDIR':
      return 'A component of the path exists but is not a directory.';
    case 'EEXIST':
      return 'A file already exists at this path, so it cannot be used as a directory.';
    case 'ENOENT':
      return 'A parent directory is missing and could not be created.';
    case 'ENAMETOOLONG':
      return 'The path is too long.';
    default:
      return null;
  }
}

/**
 * Build the message for a failed filesystem operation on the session
 * directory. `verb` completes the sentence "Cannot <verb> the … directory".
 */
export function describeSessionDirFailure(
  sessionDir: string,
  verb: string,
  error: unknown
): string {
  const explanation = explainFsErrno(getErrnoCode(error));
  return [
    `Cannot ${verb} the profiler-cli session directory ${sessionDir}.`,
    ...(explanation ? [explanation] : []),
    `Underlying error: ${toErrorMessage(error)}`,
    sessionDirHint(),
  ].join('\n');
}

/**
 * Explain a failure to create the daemon's listening socket.
 */
export function describeSocketListenError(
  socketPath: string,
  error: unknown
): string {
  const detail = `Underlying error: ${toErrorMessage(error)}`;

  switch (getErrnoCode(error)) {
    case 'EACCES':
    case 'EPERM':
      return [
        `Not allowed to create the Unix domain socket at ${socketPath}.`,
        SOCKET_SANDBOX_HINT,
        detail,
      ].join('\n');
    case 'EADDRINUSE':
      return [
        `Another process is already listening on ${socketPath}.`,
        'Run "profiler-cli session list" to see running sessions, or "profiler-cli stop --all" to stop them.',
        detail,
      ].join('\n');
    case 'ENOENT':
      return [
        `The directory holding the socket ${socketPath} disappeared before the daemon could bind to it.`,
        detail,
      ].join('\n');
    case 'ENAMETOOLONG':
    case 'EINVAL':
      return [
        `The socket path ${socketPath} (${Buffer.byteLength(socketPath)} bytes) was rejected by the kernel. It is most likely too long for sockaddr_un (limit ${MAX_UNIX_SOCKET_PATH_BYTES} bytes).`,
        `Use a shorter session directory, for example:`,
        `  PROFILER_CLI_SESSION_DIR=${suggestedSessionDir()} profiler-cli load <PATH>`,
        detail,
      ].join('\n');
    default:
      return [`Failed to listen on ${socketPath}.`, detail].join('\n');
  }
}

/**
 * Say what is sitting at a path that was supposed to hold a socket, or null
 * when nothing can be learned about it.
 */
function describePathContents(targetPath: string): string | null {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(targetPath);
  } catch {
    return null;
  }

  if (stats.isSymbolicLink()) {
    return 'It is a symbolic link, not a socket.';
  }
  if (stats.isDirectory()) {
    return 'It is a directory, not a socket.';
  }
  if (stats.isFile()) {
    return 'It is a regular file, not a socket.';
  }
  if (stats.isSocket()) {
    return 'It is a socket left behind by an earlier daemon.';
  }
  return null;
}

/**
 * Explain a failure to clear the path the daemon binds its socket to.
 *
 * Deliberately not a `describeSessionDirFailure`: what is wrong is this one
 * path, not the directory holding it, and the way out is to clear it or use
 * another session id.
 */
export function describeStaleSocketFailure(
  socketPath: string,
  error: unknown
): string {
  const contents = describePathContents(socketPath);
  return [
    `Cannot clear the path the daemon needs for its socket: ${socketPath}`,
    ...(contents ? [contents] : []),
    'Remove it, or load the profile under a different session id with --session.',
    `Underlying error: ${toErrorMessage(error)}`,
  ].join('\n');
}

/**
 * How to get rid of a daemon that cannot be reached through its socket.
 * "profiler-cli stop" is no help there, because it asks the daemon to shut
 * itself down over that same socket, so the only way out is to signal the
 * process directly.
 */
export function describeManualKill(pid: number): string {
  const command =
    process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill ${pid}`;
  return `The daemon may still be running as pid ${pid}. "profiler-cli stop" needs the same socket, so run "${command}" if you no longer need it.`;
}

/**
 * Indent a block of text so it reads as quoted output inside a larger message.
 */
export function indentBlock(text: string, prefix: string = '  '): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}
