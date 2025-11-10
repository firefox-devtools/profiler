/**
 * Daemon process for pq.
 * Loads a profile and listens for commands on a Unix socket.
 */

import * as net from 'net';
import * as fs from 'fs';
import { ProfileQuerier } from '../profile-query';
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
  private loadingProfile: boolean = false;
  private profileLoadError: Error | null = null;

  constructor(sessionDir: string, profilePath: string, sessionId?: string) {
    this.sessionDir = sessionDir;
    this.profilePath = profilePath;
    this.sessionId = sessionId || generateSessionId();
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
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.log = (...args: any[]) => {
      const message = args.map((arg) => String(arg)).join(' ');
      this.logStream.write(`[LOG] ${new Date().toISOString()} ${message}\n`);
      originalConsoleLog(...args);
    };

    console.error = (...args: any[]) => {
      const message = args.map((arg) => String(arg)).join(' ');
      this.logStream.write(`[ERROR] ${new Date().toISOString()} ${message}\n`);
      originalConsoleError(...args);
    };

    console.warn = (...args: any[]) => {
      const message = args.map((arg) => String(arg)).join(' ');
      this.logStream.write(`[WARN] ${new Date().toISOString()} ${message}\n`);
      originalConsoleWarn(...args);
    };
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

      // Remove stale socket if it exists
      if (fs.existsSync(this.socketPath)) {
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
    this.loadingProfile = true;
    try {
      console.log('Loading profile...');
      this.querier = await ProfileQuerier.load(this.profilePath);
      console.log('Profile loaded successfully');
      this.loadingProfile = false;
    } catch (error) {
      console.error(`Failed to load profile: ${error}`);
      this.profileLoadError =
        error instanceof Error ? error : new Error(String(error));
      this.loadingProfile = false;
    }
  }

  private handleConnection(socket: net.Socket): void {
    console.log('Client connected');

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Process complete lines
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);

        if (line.trim()) {
          this.handleMessage(line, socket);
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

  private handleMessage(line: string, socket: net.Socket): void {
    try {
      const message = JSON.parse(line) as ClientMessage;
      console.log(`Received message: ${message.type}`);

      this.processMessage(message)
        .then((response) => {
          socket.write(JSON.stringify(response) + '\n');
        })
        .catch((error) => {
          const errorResponse: ServerResponse = {
            type: 'error',
            error: String(error),
          };
          socket.write(JSON.stringify(errorResponse) + '\n');
        });
    } catch (error) {
      console.error(`Failed to parse message: ${error}`);
      const errorResponse: ServerResponse = {
        type: 'error',
        error: `Failed to parse message: ${error}`,
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
        if (this.loadingProfile) {
          return { type: 'loading' };
        }
        if (this.querier) {
          return { type: 'ready' };
        }
        // Shouldn't happen, but handle gracefully
        return {
          type: 'error',
          error: 'Profile not loaded',
        };
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
        if (this.loadingProfile) {
          return {
            type: 'error',
            error: 'Profile still loading, try again shortly',
          };
        }
        if (!this.querier) {
          return {
            type: 'error',
            error: 'Profile not loaded',
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
            return this.querier!.profileInfo();
          case 'threads':
            throw new Error('unimplemented');
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
            return this.querier!.threadSamples(command.thread);
          case 'samples-top-down':
            return this.querier!.threadSamplesTopDown(
              command.thread,
              command.callTreeOptions
            );
          case 'samples-bottom-up':
            return this.querier!.threadSamplesBottomUp(
              command.thread,
              command.callTreeOptions
            );
          case 'markers':
            return this.querier!.threadMarkers(
              command.thread,
              command.markerFilters
            );
          case 'functions':
            return this.querier!.threadFunctions(
              command.thread,
              command.functionFilters
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
  sessionId?: string
): Promise<void> {
  const daemon = new Daemon(sessionDir, profilePath, sessionId);
  await daemon.start();
}
