/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utilities for CLI integration tests.
 */

import { spawn } from 'child_process';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const CLI_BIN = './profiler-cli/dist/profiler-cli.js';

/**
 * Simple command execution result.
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command and return stdout, stderr, and exit code.
 * Simple replacement for execa that works with Jest without ESM complications.
 */
function exec(
  command: string,
  args: string[],
  options: {
    env?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...options.env },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: NodeJS.Timeout | undefined;

    if (options.timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
      }, options.timeout);
    }

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      }
    });

    proc.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(err);
    });
  });
}

/**
 * Context for a profiler-cli test session.
 */
export interface CliTestContext {
  sessionDir: string;
  env: Record<string, string>;
}

/**
 * Create a test context with isolated session directory.
 * Each test should call this in beforeEach() for maximum isolation.
 */
export async function createTestContext(): Promise<CliTestContext> {
  const sessionDir = await mkdtemp(join(tmpdir(), 'profiler-cli-test-'));
  return {
    sessionDir,
    env: {
      PROFILER_CLI_SESSION_DIR: sessionDir,
      PROFILER_CLI_NO_SYMBOLICATE: '1',
    },
  };
}

/**
 * Kill all daemon processes tracked in the session directory.
 */
async function killSessionDaemons(sessionDir: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(sessionDir);
  } catch {
    return;
  }

  const metadataFiles = files.filter((f) => f.endsWith('.json'));
  await Promise.all(
    metadataFiles.map(async (file) => {
      try {
        const content = await readFile(join(sessionDir, file), 'utf-8');
        const metadata = JSON.parse(content) as { pid?: number };
        if (metadata.pid) {
          try {
            process.kill(metadata.pid, 'SIGTERM');
          } catch {
            // Process already gone.
          }
        }
      } catch {
        // Ignore unreadable/invalid files.
      }
    })
  );
}

/**
 * Clean up test context.
 * Each test should call this in afterEach() to remove temp directory.
 */
export async function cleanupTestContext(ctx: CliTestContext): Promise<void> {
  await killSessionDaemons(ctx.sessionDir);
  await rm(ctx.sessionDir, { recursive: true, force: true });
}

/**
 * Run a profiler-cli command.
 */
export async function runCli(
  ctx: CliTestContext,
  args: string[],
  options?: {
    reject?: boolean;
    timeout?: number;
  }
): Promise<CommandResult> {
  const result = await exec(process.execPath, [CLI_BIN, ...args], {
    env: ctx.env,
    timeout: options?.timeout ?? 30000,
  });

  // Throw if reject is true (default) and command failed
  if ((options?.reject ?? true) && result.exitCode !== 0) {
    const error = new Error(`Command failed with exit code ${result.exitCode}`);
    Object.assign(error, result);
    throw error;
  }

  return result;
}

/**
 * Run a profiler-cli command and expect it to succeed.
 */
export async function cli(
  ctx: CliTestContext,
  args: string[]
): Promise<CommandResult> {
  return runCli(ctx, args);
}

/**
 * Run a profiler-cli command and expect it to fail.
 */
export async function cliFail(
  ctx: CliTestContext,
  args: string[]
): Promise<CommandResult> {
  try {
    await runCli(ctx, args);
    throw new Error('Expected command to fail but it succeeded');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Expected command')) {
      throw error;
    }
    // Return the error as a result (which has stdout/stderr/exitCode attached)
    return error as CommandResult;
  }
}
