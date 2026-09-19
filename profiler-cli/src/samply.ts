/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Runs `samply load` as a child process so that a profile recorded with
 * `samply record --save-only` can be analyzed with samply's symbol server,
 * which gives symbolication and assembly for local binaries.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type SamplyServer = {
  binaryPath: string;
  child: child_process.ChildProcess;
  /**
   * Resolves with the profiler.firefox.com URL samply prints, including
   * ?symbolServer=, once its local server is up. Rejects, after killing
   * samply, if it exits or stays silent for too long.
   */
  ready: Promise<string>;
};

const PROFILER_URL_PATTERN = /https:\/\/profiler\.firefox\.com\/from-url\/\S+/;

const SAMPLY_BINARY = process.platform === 'win32' ? 'samply.exe' : 'samply';

function isExecutableFile(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Where `./mach` keeps its downloaded tools. Firefox's bootstrap installs
 * samply there, so it is a good fallback when samply is not on PATH.
 */
function getMozbuildStatePath(): string {
  return (
    process.env.MOZBUILD_STATE_PATH || path.join(os.homedir(), '.mozbuild')
  );
}

/**
 * Resolve the samply binary: PROFILER_CLI_SAMPLY_PATH if set, then PATH, then
 * the mozbuild state directory. Returns null when none of them has it. An
 * explicit env var that points at nothing is an error rather than a fallback.
 */
export function findSamplyBinary(): string | null {
  const explicitPath = process.env.PROFILER_CLI_SAMPLY_PATH;
  if (explicitPath) {
    if (!isExecutableFile(explicitPath)) {
      throw new Error(
        `PROFILER_CLI_SAMPLY_PATH is set to ${explicitPath}, but that is not an executable file.`
      );
    }
    return explicitPath;
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathDirs) {
    if (dir && isExecutableFile(path.join(dir, SAMPLY_BINARY))) {
      return path.join(dir, SAMPLY_BINARY);
    }
  }

  const mozbuildSamply = path.join(
    getMozbuildStatePath(),
    'samply',
    SAMPLY_BINARY
  );
  if (isExecutableFile(mozbuildSamply)) {
    return mozbuildSamply;
  }

  return null;
}

export function describeMissingSamply(): string {
  return [
    `samply was not found in PATH or in ${path.join(getMozbuildStatePath(), 'samply')}.`,
    'Install it with "cargo install samply", run "./mach bootstrap" in a Firefox checkout, or point PROFILER_CLI_SAMPLY_PATH at the binary. See https://github.com/mstange/samply.',
  ].join('\n');
}

/**
 * Start `samply load --no-open <path>` and wait until it prints the profiler
 * URL, which means its local server is up.
 */
export function startSamplyServer(
  profilePath: string,
  timeoutMs: number = 15_000
): SamplyServer {
  const samplyBinary = findSamplyBinary();
  if (samplyBinary === null) {
    throw new Error(describeMissingSamply());
  }

  // env is passed explicitly so that a caller's process.env is honored even
  // where process.env is a sandboxed copy, as under Jest.
  const child = child_process.spawn(
    samplyBinary,
    ['load', '--no-open', profilePath],
    { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }
  );

  const ready = new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const fail = (message: string) => {
      settle(() => {
        child.kill();
        reject(new Error(message));
      });
    };

    const outputTail = () => {
      const output = (stdout + stderr).trim();
      return output ? `\nsamply output:\n${output}` : '';
    };

    const timer = setTimeout(() => {
      fail(
        `samply did not print a profiler URL within ${timeoutMs}ms.${outputTail()}`
      );
    }, timeoutMs);

    const checkForUrl = () => {
      const match = (stdout + stderr).match(PROFILER_URL_PATTERN);
      if (match) {
        settle(() => resolve(match[0]));
      }
    };

    child.stdout!.on('data', (data) => {
      stdout += data.toString();
      checkForUrl();
    });

    child.stderr!.on('data', (data) => {
      stderr += data.toString();
      checkForUrl();
    });

    child.on('error', (error) => {
      fail(`Failed to start samply (${samplyBinary}): ${error.message}`);
    });

    child.on('exit', (code, signal) => {
      const how = signal !== null ? `signal ${signal}` : `exit code ${code}`;
      fail(
        `samply exited before its server was ready (${how}).${outputTail()}`
      );
    });
  });

  return { binaryPath: samplyBinary, child, ready };
}
