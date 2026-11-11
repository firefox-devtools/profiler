/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Daemon process for profiler-cli.
 * Loads a profile and listens for commands on a Unix socket (or named pipe on Windows).
 */

import * as net from 'net';
import * as fs from 'fs';
import type * as child_process from 'child_process';
import { ProfileQuerierNode } from '../../src/profile-query/node';
import type { LoadPhase } from '../../src/profile-query/loader';
import { ProfileVersionError } from 'firefox-profiler/profile-logic/errors';
import type {
  ClientCommand,
  ClientMessage,
  ServerResponse,
  SessionMetadata,
  PermalinkOutcome,
} from './protocol';
import {
  generateSessionId,
  getSocketPath,
  getLogPath,
  saveSessionMetadata,
  setCurrentSession,
  cleanupSession,
  ensureSessionDir,
  writeStartupError,
} from './session';
import {
  describeProfileVersionError,
  describeSessionDirFailure,
  describeSocketListenError,
  describeStaleSocketFailure,
  toErrorMessage,
} from './diagnostics';
import { executeClientCommand } from 'firefox-profiler/profile-query/cli/execute';
import { BUILD_HASH, PACKAGE_NAME } from './constants';
import { startSamplyServer } from './samply';
import { permalinkViewForCommand } from 'firefox-profiler/profile-query/cli/permalink-view';

/**
 * Exit code used when the daemon dies before it is able to serve requests. The
 * accompanying reason is written to the session's startup error file.
 */
const DAEMON_STARTUP_FAILURE_EXIT_CODE = 3;

/**
 * Build a user-facing message for a profile load failure. When the profile is
 * too new for this build, append instructions on how to update the CLI.
 */
function formatProfileLoadError(error: unknown): string {
  if (
    error instanceof ProfileVersionError ||
    (error instanceof Error && error.name === 'ProfileVersionError')
  ) {
    return describeProfileVersionError(
      error as ProfileVersionError,
      PACKAGE_NAME,
      process.argv[1]
    );
  }
  return error instanceof Error ? error.message : String(error);
}

export class Daemon {
  private querier: ProfileQuerierNode | null = null;
  private server: net.Server | null = null;
  private sessionDir: string;
  private sessionId: string;
  private socketPath: string;
  private logPath: string;
  private logStream: fs.WriteStream | null = null;
  private profilePath: string;
  private symbolServerUrl?: string;
  private withSamply: boolean;
  private samplyProcess: child_process.ChildProcess | null = null;
  private loadPhase: LoadPhase = 'fetching';
  private profileLoadError: string | null = null;
  private isListening: boolean = false;
  private hasPublishedMetadata: boolean = false;

  constructor(
    sessionDir: string,
    profilePath: string,
    sessionId?: string,
    symbolServerUrl?: string,
    withSamply: boolean = false
  ) {
    this.sessionDir = sessionDir;
    this.profilePath = profilePath;
    this.sessionId = sessionId || generateSessionId();
    this.symbolServerUrl = symbolServerUrl;
    this.withSamply = withSamply;
    this.socketPath = getSocketPath(sessionDir, this.sessionId);
    this.logPath = getLogPath(sessionDir, this.sessionId);

    // Redirect console to log file
    this.redirectConsole();

    // Handle shutdown signals
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    // A crash before the socket is up would otherwise leave the client with
    // nothing but an exit code to report.
    process.on('uncaughtException', (error) => {
      this.reportFatalError(
        `The daemon crashed with an uncaught exception.\nUnderlying error: ${toErrorMessage(error)}${error instanceof Error && error.stack ? `\n${error.stack}` : ''}`
      );
    });
  }

  private redirectConsole(): void {
    // The daemon is spawned with stdio: 'ignore', so forwarding to the
    // original console functions would just discard the output. Write
    // exclusively to the log stream.
    const write = (level: string, args: any[]) => {
      const message = args.map((arg) => String(arg)).join(' ');
      this.logStream?.write(
        `[${level}] ${new Date().toISOString()} ${message}\n`
      );
    };
    console.log = (...args: any[]) => write('LOG', args);
    console.error = (...args: any[]) => write('ERROR', args);
    console.warn = (...args: any[]) => write('WARN', args);
  }

  /**
   * Record why the daemon cannot serve requests and exit.
   *
   * A client waits for this session's metadata to appear, and gives up on the
   * startup error file once it has, so the file is only worth writing before
   * that point, which includes the window after listen() succeeds but before
   * the metadata is saved. The message also goes to the log file and to the real
   * stderr, both best effort: an unwritable session directory is one of the
   * failures reported here, and the client spawns the daemon with its stdio
   * discarded.
   */
  private reportFatalError(message: string): never {
    this.stopSamply();
    if (!this.hasPublishedMetadata) {
      writeStartupError(this.sessionDir, this.sessionId, message);
    }

    const logLine = `[ERROR] ${new Date().toISOString()} Fatal daemon error: ${message}\n`;
    try {
      // Synchronous: process.exit() below would discard the buffered stream.
      fs.appendFileSync(this.logPath, logLine);
    } catch {
      // Nothing to do here. The startup error file is the channel that matters.
    }
    try {
      process.stderr.write(logLine);
    } catch {
      // stdio is 'ignore' when spawned by the client.
    }

    process.exit(DAEMON_STARTUP_FAILURE_EXIT_CODE);
  }

  async start(): Promise<void> {
    // Ensure session directory exists before anything tries to write into it.
    try {
      ensureSessionDir(this.sessionDir);
    } catch (error) {
      this.reportFatalError(
        describeSessionDirFailure(this.sessionDir, 'create', error)
      );
    }

    this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
    this.logStream.on('error', (error) => {
      // Losing the log is not fatal, but it must not take the daemon down with
      // an unhandled 'error' event.
      this.logStream = null;
      try {
        process.stderr.write(
          `Failed to write daemon log ${this.logPath}: ${toErrorMessage(error)}\n`
        );
      } catch {
        // stdio is 'ignore' when spawned by the client.
      }
    });

    console.log(`Starting daemon for session ${this.sessionId}`);
    console.log(`Profile path: ${this.profilePath}`);
    console.log(`Socket path: ${this.socketPath}`);
    console.log(`Log path: ${this.logPath}`);

    // Create Unix socket server BEFORE loading the profile
    this.server = net.createServer((socket) => this.handleConnection(socket));

    this.server.on('error', (error) => {
      // Before listen() succeeds this is fatal. Without a socket the daemon
      // is unreachable, so the client needs to know why.
      if (!this.isListening) {
        this.reportFatalError(
          describeSocketListenError(this.socketPath, error)
        );
      }
      console.error(`Server error: ${error}`);
      this.shutdown('error');
    });

    // Remove stale socket if it exists (Unix only, since named pipes on
    // Windows are not filesystem files). force: true so a socket that a
    // concurrent cleanup removed first counts as success rather than aborting
    // startup.
    if (process.platform !== 'win32') {
      try {
        fs.rmSync(this.socketPath, { force: true });
      } catch (error) {
        this.reportFatalError(
          describeStaleSocketFailure(this.socketPath, error)
        );
      }
    }

    this.server.listen(this.socketPath, () => {
      this.isListening = true;
      console.log(`Daemon listening on ${this.socketPath}`);

      // Save session metadata immediately
      const metadata: SessionMetadata = {
        id: this.sessionId,
        socketPath: this.socketPath,
        logPath: this.logPath,
        pid: process.pid,
        profilePath: this.profilePath,
        createdAt: new Date().toISOString(),
        buildHash: BUILD_HASH,
      };
      try {
        saveSessionMetadata(this.sessionDir, metadata);
        setCurrentSession(this.sessionDir, this.sessionId);
        this.hasPublishedMetadata = true;
      } catch (error) {
        this.reportFatalError(
          describeSessionDirFailure(this.sessionDir, 'write to', error)
        );
      }

      console.log('Daemon ready (socket listening)');

      // Start loading the profile in the background
      this.loadProfileAsync();
    });
  }

  private async loadProfileAsync(): Promise<void> {
    this.loadPhase = 'fetching';
    try {
      let loadInput = this.profilePath;
      if (this.withSamply) {
        console.log('Starting samply server...');
        const samply = startSamplyServer(this.profilePath);
        // Tracked before it is ready, so a shutdown while samply is still
        // starting up takes it down too.
        this.samplyProcess = samply.child;
        let samplyReady = false;
        samply.child.on('exit', (code, signal) => {
          // stopSamply clears samplyProcess before the exit fires, and a
          // startup failure is already reported through the ready rejection.
          // A clean exit after the URL was printed means samply handed the
          // server off to a background process.
          const unexpected =
            this.samplyProcess !== null && samplyReady && code !== 0;
          this.samplyProcess = null;
          if (unexpected) {
            console.warn(
              `samply exited (${signal !== null ? `signal ${signal}` : `exit code ${code}`}). Symbol lookups will fail from now on.`
            );
          }
        });
        console.log(`Using samply at ${samply.binaryPath}`);
        loadInput = await samply.ready;
        samplyReady = true;
        console.log(`samply server ready: ${loadInput}`);
      }

      console.log('Loading profile...');
      const skipSymbolication = process.env.PROFILER_CLI_NO_SYMBOLICATE === '1';
      this.querier = await ProfileQuerierNode.load(loadInput, {
        explicitSymbolServerUrl: this.symbolServerUrl,
        skipSymbolication,
        onPhaseChange: (phase) => {
          this.loadPhase = phase;
          if (phase === 'symbolicating') {
            console.log('Symbolicating profile...');
          }
        },
      });
      this.loadPhase = 'ready';
      console.log('Profile loaded successfully');
    } catch (error) {
      console.error(`Failed to load profile: ${error}`);
      this.profileLoadError = formatProfileLoadError(error);
      // The daemon stays up to report the error, but samply has nothing left
      // to serve.
      this.stopSamply();
    }
  }

  private handleConnection(socket: net.Socket): void {
    console.log('Client connected');

    let buffer = '';
    // Serialize commands on this connection so concurrent messages cannot
    // race on shared Redux state (e.g. _withEphemeralFilters).
    let inFlight: Promise<void> = Promise.resolve();

    socket.on('data', (data) => {
      buffer += data.toString();

      // Process complete lines
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);

        if (line.trim()) {
          inFlight = inFlight.then(() => this.handleMessage(line, socket));
        }
      }
    });

    socket.on('error', (error) => {
      console.error(`Socket error: ${error}`);
    });

    socket.on('end', () => {
      console.log('Client disconnected');
    });
  }

  private async handleMessage(line: string, socket: net.Socket): Promise<void> {
    try {
      const message = JSON.parse(line) as ClientMessage;
      console.log(`Received message: ${message.type}`);
      const response = await this.processMessage(message);
      socket.write(JSON.stringify(response) + '\n');
    } catch (error) {
      const errorResponse: ServerResponse = {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      socket.write(JSON.stringify(errorResponse) + '\n');
    }
  }

  private async processMessage(
    message: ClientMessage
  ): Promise<ServerResponse> {
    switch (message.type) {
      case 'status': {
        // Return current daemon state
        if (this.profileLoadError) {
          return {
            type: 'error',
            error: `Profile load failed: ${this.profileLoadError}`,
          };
        }
        switch (this.loadPhase) {
          case 'fetching':
          case 'processing':
            return { type: 'loading' };
          case 'symbolicating':
            return { type: 'symbolicating' };
          case 'ready':
            if (this.querier) {
              return { type: 'ready' };
            }
            return { type: 'error', error: 'Profile not loaded' };
          default:
            return { type: 'error', error: 'Profile not loaded' };
        }
      }

      case 'shutdown': {
        console.log('Shutdown command received');
        // Send response before shutting down
        const response: ServerResponse = {
          type: 'success',
          result: 'Shutting down',
        };
        setImmediate(() => this.shutdown('command'));
        return response;
      }

      case 'command': {
        // Commands require profile to be loaded
        if (this.profileLoadError) {
          return {
            type: 'error',
            error: `Profile load failed: ${this.profileLoadError}`,
          };
        }
        if (this.loadPhase !== 'ready' || !this.querier) {
          return {
            type: 'error',
            error: 'Profile still loading, try again shortly',
          };
        }

        const result = await executeClientCommand(
          this.querier,
          message.command,
          this.querier
        );
        if (!message.permalink) {
          return { type: 'success', result };
        }
        return {
          type: 'success',
          result,
          permalink: await this.buildPermalink(
            message.command,
            message.permalink === 'short'
          ),
        };
      }

      default: {
        return {
          type: 'error',
          error: `Unknown message type: ${(message as any).type}`,
        };
      }
    }
  }

  private async buildPermalink(
    command: ClientCommand,
    short: boolean
  ): Promise<PermalinkOutcome> {
    if (!this.querier) {
      throw new Error('Profile not loaded');
    }
    try {
      return await this.querier.permalink(
        permalinkViewForCommand(command),
        short
      );
    } catch (error) {
      return { error: toErrorMessage(error) };
    }
  }

  private shutdown(reason: string): void {
    console.log(`Shutting down daemon (reason: ${reason})`);

    if (this.server) {
      this.server.close();
    }

    this.stopSamply();

    cleanupSession(this.sessionDir, this.sessionId);

    if (this.logStream) {
      this.logStream.end();
    }

    console.log('Daemon stopped');
    process.exit(0);
  }

  private stopSamply(): void {
    if (this.samplyProcess) {
      this.samplyProcess.kill();
      this.samplyProcess = null;
    }
  }
}

/**
 * Start the daemon (called from CLI).
 */
export async function startDaemon(
  sessionDir: string,
  profilePath: string,
  sessionId?: string,
  symbolServerUrl?: string,
  withSamply: boolean = false
): Promise<void> {
  const daemon = new Daemon(
    sessionDir,
    profilePath,
    sessionId,
    symbolServerUrl,
    withSamply
  );
  await daemon.start();
}
