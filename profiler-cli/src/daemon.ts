/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Daemon process for profiler-cli.
 * Loads a profile and listens for commands on a Unix socket (or named pipe on Windows).
 */

import * as net from 'net';
import * as fs from 'fs';
import { ProfileQuerier } from '../../src/profile-query';
import type { LoadPhase } from '../../src/profile-query/loader';
import type {
  ClientCommand,
  ClientMessage,
  ServerResponse,
  SessionMetadata,
  CommandResult,
} from './protocol';
import {
  generateSessionId,
  getSocketPath,
  getLogPath,
  saveSessionMetadata,
  setCurrentSession,
  cleanupSession,
  ensureSessionDir,
} from './session';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { BUILD_HASH } from './constants';

export class Daemon {
  private querier: ProfileQuerier | null = null;
  private server: net.Server | null = null;
  private sessionDir: string;
  private sessionId: string;
  private socketPath: string;
  private logPath: string;
  private logStream: fs.WriteStream;
  private profilePath: string;
  private symbolServerUrl?: string;
  private loadPhase: LoadPhase = 'fetching';
  private profileLoadError: Error | null = null;

  constructor(
    sessionDir: string,
    profilePath: string,
    sessionId?: string,
    symbolServerUrl?: string
  ) {
    this.sessionDir = sessionDir;
    this.profilePath = profilePath;
    this.sessionId = sessionId || generateSessionId();
    this.symbolServerUrl = symbolServerUrl;
    this.socketPath = getSocketPath(sessionDir, this.sessionId);
    this.logPath = getLogPath(sessionDir, this.sessionId);
    this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });

    // Redirect console to log file
    this.redirectConsole();

    // Handle shutdown signals
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
  }

  private redirectConsole(): void {
    // The daemon is spawned with stdio: 'ignore', so forwarding to the
    // original console functions would just discard the output. Write
    // exclusively to the log stream.
    const write = (level: string, args: any[]) => {
      const message = args.map((arg) => String(arg)).join(' ');
      this.logStream.write(
        `[${level}] ${new Date().toISOString()} ${message}\n`
      );
    };
    console.log = (...args: any[]) => write('LOG', args);
    console.error = (...args: any[]) => write('ERROR', args);
    console.warn = (...args: any[]) => write('WARN', args);
  }

  async start(): Promise<void> {
    try {
      console.log(`Starting daemon for session ${this.sessionId}`);
      console.log(`Profile path: ${this.profilePath}`);
      console.log(`Socket path: ${this.socketPath}`);
      console.log(`Log path: ${this.logPath}`);

      // Ensure session directory exists
      ensureSessionDir(this.sessionDir);

      // Create Unix socket server BEFORE loading the profile
      this.server = net.createServer((socket) => this.handleConnection(socket));

      // Remove stale socket if it exists (Unix only — named pipes on Windows are not filesystem files)
      if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }

      this.server.listen(this.socketPath, () => {
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
        saveSessionMetadata(this.sessionDir, metadata);
        setCurrentSession(this.sessionDir, this.sessionId);

        console.log('Daemon ready (socket listening)');

        // Start loading the profile in the background
        this.loadProfileAsync();
      });

      this.server.on('error', (error) => {
        console.error(`Server error: ${error}`);
        this.shutdown('error');
      });
    } catch (error) {
      console.error(`Failed to start daemon: ${error}`);
      process.exit(1);
    }
  }

  private async loadProfileAsync(): Promise<void> {
    this.loadPhase = 'fetching';
    try {
      console.log('Loading profile...');
      const skipSymbolication = process.env.PROFILER_CLI_NO_SYMBOLICATE === '1';
      this.querier = await ProfileQuerier.load(this.profilePath, {
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
      this.profileLoadError =
        error instanceof Error ? error : new Error(String(error));
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
            error: `Profile load failed: ${this.profileLoadError.message}`,
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
            error: `Profile load failed: ${this.profileLoadError.message}`,
          };
        }
        if (this.loadPhase !== 'ready' || !this.querier) {
          return {
            type: 'error',
            error: 'Profile still loading, try again shortly',
          };
        }

        const result = await this.processCommand(message.command);
        return {
          type: 'success',
          result,
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

  private async processCommand(
    command: ClientCommand
  ): Promise<string | CommandResult> {
    switch (command.command) {
      case 'profile':
        switch (command.subcommand) {
          case 'info':
            return this.querier!.profileInfo(command.all, command.search);
          case 'threads':
            throw new Error('unimplemented');
          case 'logs':
            return this.querier!.profileLogs(command.logFilters);
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'thread':
        switch (command.subcommand) {
          case 'info':
            return this.querier!.threadInfo(command.thread);
          case 'select':
            if (!command.thread) {
              throw new Error('thread handle required for thread select');
            }
            return this.querier!.threadSelect(command.thread);
          case 'samples':
            return this.querier!.threadSamples(
              command.thread,
              command.includeIdle,
              command.search,
              command.sampleFilters
            );
          case 'samples-top-down':
            return this.querier!.threadSamplesTopDown(
              command.thread,
              command.callTreeOptions,
              command.includeIdle,
              command.search,
              command.sampleFilters
            );
          case 'samples-bottom-up':
            return this.querier!.threadSamplesBottomUp(
              command.thread,
              command.callTreeOptions,
              command.includeIdle,
              command.search,
              command.sampleFilters
            );
          case 'markers':
            return this.querier!.threadMarkers(
              command.thread,
              command.markerFilters
            );
          case 'functions':
            return this.querier!.threadFunctions(
              command.thread,
              command.functionFilters,
              command.includeIdle,
              command.sampleFilters
            );
          case 'network':
            return this.querier!.threadNetwork(
              command.thread,
              command.networkFilters
            );
          case 'page-load':
            return this.querier!.threadPageLoad(
              command.thread,
              command.pageLoadOptions
            );
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'marker':
        switch (command.subcommand) {
          case 'info':
            if (!command.marker) {
              throw new Error('marker handle required for marker info');
            }
            return this.querier!.markerInfo(command.marker);
          case 'stack':
            if (!command.marker) {
              throw new Error('marker handle required for marker stack');
            }
            return this.querier!.markerStack(command.marker);
          case 'select':
            throw new Error('unimplemented');
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'sample':
        switch (command.subcommand) {
          case 'info':
            throw new Error('unimplemented');
          case 'select':
            throw new Error('unimplemented');
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'function':
        switch (command.subcommand) {
          case 'info':
            if (!command.function) {
              throw new Error('function handle required for function info');
            }
            return this.querier!.functionInfo(command.function);
          case 'expand':
            if (!command.function) {
              throw new Error('function handle required for function expand');
            }
            return this.querier!.functionExpand(command.function);
          case 'select':
            throw new Error('unimplemented');
          case 'annotate':
            if (!command.function) {
              throw new Error('function handle required for function annotate');
            }
            return this.querier!.functionAnnotate(
              command.function,
              command.annotateMode ?? 'src',
              command.symbolServerUrl ?? 'http://localhost:3000',
              command.annotateContext ?? '2'
            );
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'zoom':
        switch (command.subcommand) {
          case 'push':
            if (!command.range) {
              throw new Error('range parameter is required for zoom push');
            }
            return this.querier!.pushViewRange(command.range);
          case 'pop':
            return this.querier!.popViewRange();
          case 'clear':
            return this.querier!.clearViewRange();
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'filter':
        switch (command.subcommand) {
          case 'push':
            if (!command.spec) {
              throw new Error('spec is required for filter push');
            }
            return this.querier!.filterPush(command.spec, command.thread);
          case 'pop':
            return this.querier!.filterPop(command.count ?? 1, command.thread);
          case 'list':
            return this.querier!.filterList(command.thread);
          case 'clear':
            return this.querier!.filterClear(command.thread);
          default:
            throw assertExhaustiveCheck(command);
        }
      case 'status':
        return this.querier!.getStatus();
      default:
        throw assertExhaustiveCheck(command);
    }
  }

  private shutdown(reason: string): void {
    console.log(`Shutting down daemon (reason: ${reason})`);

    if (this.server) {
      this.server.close();
    }

    cleanupSession(this.sessionDir, this.sessionId);

    if (this.logStream) {
      this.logStream.end();
    }

    console.log('Daemon stopped');
    process.exit(0);
  }
}

/**
 * Start the daemon (called from CLI).
 */
export async function startDaemon(
  sessionDir: string,
  profilePath: string,
  sessionId?: string,
  symbolServerUrl?: string
): Promise<void> {
  const daemon = new Daemon(
    sessionDir,
    profilePath,
    sessionId,
    symbolServerUrl
  );
  await daemon.start();
}
