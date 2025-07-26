/**
 * Utilities for CLI integration tests.
 */

import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const PQ_BIN = './src/profile-query-cli/dist/pq.js';

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
      if (timeoutId) clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      }
    });

    proc.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Context for a pq test session.
 */
export interface PqTestContext {
  sessionDir: string;
  env: Record<string, string>;
}

/**
 * Create a test context with isolated session directory.
 * Each test should call this in beforeEach() for maximum isolation.
 */
export async function createTestContext(): Promise<PqTestContext> {
  const sessionDir = await mkdtemp(join(tmpdir(), 'pq-test-'));
  return {
    sessionDir,
    env: { PQ_SESSION_DIR: sessionDir },
  };
}

/**
 * Clean up test context.
 * Each test should call this in afterEach() to remove temp directory.
 */
export async function cleanupTestContext(ctx: PqTestContext): Promise<void> {
  await rm(ctx.sessionDir, { recursive: true, force: true });
}

/**
 * Run a pq command.
 */
export async function runPq(
  ctx: PqTestContext,
  args: string[],
  options?: {
    reject?: boolean;
    timeout?: number;
  }
): Promise<CommandResult> {
  const result = await exec(PQ_BIN, args, {
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
 * Run a pq command and expect it to succeed.
 */
export async function pq(
  ctx: PqTestContext,
  args: string[]
): Promise<CommandResult> {
  return runPq(ctx, args);
}

/**
 * Run a pq command and expect it to fail.
 */
export async function pqFail(
  ctx: PqTestContext,
  args: string[]
): Promise<CommandResult> {
  try {
    await runPq(ctx, args);
    throw new Error('Expected command to fail but it succeeded');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Expected command')) {
      throw error;
    }
    // Return the error as a result (which has stdout/stderr/exitCode attached)
    return error as CommandResult;
  }
}
