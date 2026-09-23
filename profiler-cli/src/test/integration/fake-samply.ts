/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for installing the fake samply fixture where the daemon will find it.
 */

import { chmod, mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export const SAMPLY_BINARY =
  process.platform === 'win32' ? 'samply.exe' : 'samply';

/**
 * The fake samply is a shell script, which Windows cannot spawn as a binary,
 * and the tests drive it with Unix signals. Tests that run it skip on Windows.
 */
export const skipFakeSamply = process.platform === 'win32';

export const FAKE_SAMPLY_SCRIPT = join(
  __dirname,
  '..',
  'fixtures',
  'fake-samply.js'
);

export type FakeSamplyMode = 'serve' | 'exit' | 'hang';

export type FakeSamply = {
  /** Executable wrapper that runs the fixture with the current node. */
  binaryPath: string;
  pidFile: string;
  requestLog: string;
  /** Environment the fixture needs, to be merged into the daemon's env. */
  env: Record<string, string>;
};

/**
 * Write an executable `samply` wrapper into `dir` that runs the fixture with
 * the current node binary. The wrapper is needed because the daemon spawns
 * samply directly, without a shell or an interpreter.
 */
export async function installFakeSamply(
  dir: string,
  mode: FakeSamplyMode = 'serve'
): Promise<FakeSamply> {
  await mkdir(dir, { recursive: true });
  const binaryPath = join(dir, 'samply');
  await writeFile(
    binaryPath,
    `#!/bin/sh\nexec "${process.execPath}" "${FAKE_SAMPLY_SCRIPT}" "$@"\n`
  );
  await chmod(binaryPath, 0o755);

  const pidFile = join(dir, 'samply.pid');
  const requestLog = join(dir, 'samply-requests.log');
  return {
    binaryPath,
    pidFile,
    requestLog,
    env: {
      FAKE_SAMPLY_MODE: mode,
      FAKE_SAMPLY_PID_FILE: pidFile,
      FAKE_SAMPLY_REQUEST_LOG: requestLog,
    },
  };
}

/**
 * Remember the current values of `keys` in process.env and return a function
 * that puts them back. process.env is mutated in place rather than replaced,
 * because child_process reads the real process.env and under Jest a
 * reassignment only affects the sandbox copy.
 */
export function snapshotEnv(keys: readonly string[]): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  return () => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  };
}

/** A PATH that has node but no samply. */
export function pathWithoutSamply(): string {
  return dirname(process.execPath);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs: number = 5000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return predicate();
}
