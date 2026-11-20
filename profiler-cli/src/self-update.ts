/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli self-update`: update through whichever installer owns this
 * copy. npm installs go through npm. Copies installed by "./mach bootstrap"
 * are replaced with the latest profiler-cli toolchain build from Firefox CI.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { zstdDecompressSync } from 'zlib';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { UntarFileStream } from 'firefox-profiler/utils/untar';
import { PACKAGE_NAME, VERSION } from './constants';
import {
  getMozbuildStatePath,
  isInstalledByMachBootstrap,
  isPathInside,
  realpathOrSelf,
} from './diagnostics';
import { listSessions } from './session';

/**
 * - mach: installed by "./mach bootstrap" into the mozbuild state directory
 * - npm-global: installed with "npm install -g"
 * - npx: running from the npx cache
 * - other-node-modules: a local dependency, or a global install made by
 *   another package manager or another Node version's npm
 * - source: built from a profiler checkout
 */
export type InstallKind =
  | 'mach'
  | 'npm-global'
  | 'npx'
  | 'other-node-modules'
  | 'source';

const TASKCLUSTER_ROOT_URL = 'https://firefox-ci-tc.services.mozilla.com';
const TOOLCHAIN_INDEX = 'gecko.cache.level-3.toolchains.v3.profiler-cli';
const TOOLCHAIN_ARTIFACT = 'public/build/profiler-cli.tar.zst';
// Written by self-update inside the tool directory, so that it disappears
// whenever "./mach bootstrap" reinstalls the toolchain.
const TASK_ID_MARKER = '.taskcluster-task-id';

/**
 * `getNpmGlobalRoot` is only called for scripts inside node_modules, since it
 * spawns npm.
 */
export function getInstallKind(
  scriptPath: string,
  getNpmGlobalRoot: () => string | null
): InstallKind {
  if (isInstalledByMachBootstrap(scriptPath)) {
    return 'mach';
  }
  // npm runs global installs through a symlink in its bin directory.
  const parts = realpathOrSelf(scriptPath).split(path.sep);
  if (!parts.includes('node_modules')) {
    return 'source';
  }
  if (parts.includes('_npx')) {
    return 'npx';
  }
  const npmGlobalRoot = getNpmGlobalRoot();
  if (
    npmGlobalRoot !== null &&
    isPathInside(path.join(npmGlobalRoot, PACKAGE_NAME), scriptPath)
  ) {
    return 'npm-global';
  }
  return 'other-node-modules';
}

export async function selfUpdate(
  sessionDir: string,
  options: { force: boolean }
): Promise<void> {
  const scriptPath = process.argv[1];
  const kind = getInstallKind(scriptPath, getNpmGlobalRoot);
  let updated;
  switch (kind) {
    case 'mach':
      updated = await updateMachInstall(options.force);
      break;
    case 'npm-global':
      updated = updateNpmInstall(options.force);
      break;
    case 'npx':
      console.log(
        `This profiler-cli is running through npx. Run "npx ${PACKAGE_NAME}@latest" to use the latest version.`
      );
      return;
    case 'other-node-modules':
      throw new Error(
        `This profiler-cli at ${scriptPath} was not installed by "npm install -g" or "./mach bootstrap", so it cannot update itself. Update it with the tool that installed it, or bump it in your package.json if it is a project dependency.`
      );
    case 'source':
      throw new Error(
        `This profiler-cli at ${scriptPath} was built from source. Pull the latest changes and run "yarn build-cli" to update it.`
      );
    default:
      throw assertExhaustiveCheck(kind);
  }

  if (updated && listSessions(sessionDir).length > 0) {
    console.log(
      'Running sessions still use the previous version. Restart them with "profiler-cli stop --all" and "profiler-cli load".'
    );
  }
}

function runNpm(args: string[], inheritStdio: boolean): string {
  const result = spawnSync('npm', args, {
    encoding: 'utf8',
    stdio: inheritStdio ? 'inherit' : 'pipe',
    // npm is npm.cmd on Windows, which can only be spawned through a shell.
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw new Error(`Could not run npm: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `"npm ${args.join(' ')}" failed with exit code ${result.status}.${result.stderr ? `\n${result.stderr.trim()}` : ''}`
    );
  }
  return (result.stdout ?? '').trim();
}

function getNpmGlobalRoot(): string | null {
  try {
    return runNpm(['root', '-g'], false);
  } catch {
    return null;
  }
}

function updateNpmInstall(force: boolean): boolean {
  const latestVersion = runNpm(['view', PACKAGE_NAME, 'version'], false);
  if (latestVersion === VERSION && !force) {
    console.log(`profiler-cli ${VERSION} is already the latest version.`);
    return false;
  }

  console.log(`Updating profiler-cli to ${latestVersion} with npm...`);
  runNpm(['install', '-g', `${PACKAGE_NAME}@${latestVersion}`], true);

  const installedVersion = readPackageVersion(
    path.join(runNpm(['root', '-g'], false), PACKAGE_NAME)
  );
  if (installedVersion !== latestVersion) {
    throw new Error(
      `npm finished, but profiler-cli ${installedVersion} is installed instead of ${latestVersion}.`
    );
  }
  console.log(`Updated profiler-cli to ${latestVersion}.`);
  return true;
}

async function updateMachInstall(force: boolean): Promise<boolean> {
  const stateDir = getMozbuildStatePath();
  const toolDir = path.join(stateDir, 'profiler-cli');

  const latestTaskId = await findIndexedTaskId(`${TOOLCHAIN_INDEX}.latest`);
  if (latestTaskId === null) {
    throw new Error(
      `Could not find a profiler-cli build in the Taskcluster index at ${TOOLCHAIN_INDEX}.latest.`
    );
  }
  const currentTaskId = await findCurrentTaskId(stateDir, toolDir);
  if (currentTaskId === latestTaskId && !force) {
    console.log(
      `profiler-cli ${VERSION} is already the latest build from Firefox CI.`
    );
    return false;
  }

  console.log(
    `Downloading the latest profiler-cli build from Firefox CI (task ${latestTaskId})...`
  );
  const artifactUrl = `${getTaskclusterRootUrl()}/api/queue/v1/task/${latestTaskId}/artifacts/${TOOLCHAIN_ARTIFACT}`;
  const archive = await fetchBytes(artifactUrl);

  const newDir = `${toolDir}.new`;
  fs.rmSync(newDir, { recursive: true, force: true });
  try {
    extractTar(zstdDecompressSync(archive), newDir, 'profiler-cli');
    if (!fs.existsSync(path.join(newDir, 'dist', 'profiler-cli.js'))) {
      throw new Error(
        'The downloaded profiler-cli build does not contain dist/profiler-cli.js.'
      );
    }
    const newVersion = readPackageVersion(newDir);
    if (compareVersions(newVersion, VERSION) < 0 && !force) {
      throw new Error(
        `The latest profiler-cli build from Firefox CI is version ${newVersion}, which is older than this one (${VERSION}). Run with --force to install it anyway.`
      );
    }
    fs.writeFileSync(path.join(newDir, TASK_ID_MARKER), latestTaskId + '\n');
    replaceDirectory(toolDir, newDir);
    console.log(
      `Updated profiler-cli to ${newVersion} from Taskcluster task ${latestTaskId}.`
    );
  } finally {
    fs.rmSync(newDir, { recursive: true, force: true });
  }
  return true;
}

function getTaskclusterRootUrl(): string {
  return (
    process.env.PROFILER_CLI_TASKCLUSTER_ROOT_URL || TASKCLUSTER_ROOT_URL
  ).replace(/\/+$/, '');
}

async function fetchOrExplain(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? `: ${error.cause.message}`
        : '';
    throw new Error(`Could not reach ${url}${cause}`);
  }
}

async function findIndexedTaskId(indexPath: string): Promise<string | null> {
  const url = `${getTaskclusterRootUrl()}/api/index/v1/task/${indexPath}`;
  const response = await fetchOrExplain(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }
  const { taskId } = (await response.json()) as { taskId: string };
  return taskId;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetchOrExplain(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The task that built the installed copy: the marker that self-update writes,
 * or the task indexed under the hash that "./mach bootstrap" recorded.
 */
async function findCurrentTaskId(
  stateDir: string,
  toolDir: string
): Promise<string | null> {
  const marker = readTrimmedFile(path.join(toolDir, TASK_ID_MARKER));
  if (marker) {
    return marker;
  }
  const hash = readTrimmedFile(path.join(stateDir, 'indices', 'profiler-cli'));
  if (!hash) {
    return null;
  }
  return findIndexedTaskId(`${TOOLCHAIN_INDEX}.hash.${hash}`);
}

function readTrimmedFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function readPackageVersion(packageDir: string): string {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')
  );
  return packageJson.version;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((part) => parseInt(part, 10) || 0);
  const partsB = b.split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * Swap `newDir` in place of `toolDir`. The launchers in the mozbuild bin
 * directory point into `toolDir`, so they keep working.
 */
function replaceDirectory(toolDir: string, newDir: string): void {
  const oldDir = `${toolDir}.old`;
  fs.rmSync(oldDir, { recursive: true, force: true });
  fs.renameSync(toolDir, oldDir);
  try {
    fs.renameSync(newDir, toolDir);
  } catch (error) {
    fs.renameSync(oldDir, toolDir);
    throw error;
  }
  fs.rmSync(oldDir, { recursive: true, force: true });
}

// Tar typeflags of regular files: '' is used by old archives and '7' is a
// contiguous file.
const FILE_TYPES = new Set(['0', '', '7']);
const DIRECTORY_TYPE = '5';

/**
 * Extract an uncompressed tar archive into `destDir`. Every entry must be a
 * file or directory below `rootName/`, which is stripped. Links are rejected
 * because they are how most extraction exploits escape the target directory.
 * Nothing is written unless every entry passes these checks.
 */
export function extractTar(
  archive: Uint8Array,
  destDir: string,
  rootName: string
): void {
  const files: Array<{ parts: string[]; buffer: Uint8Array | null }> = [];
  const unexpectedEntries: string[] = [];
  // UntarFileStream reads the whole ArrayBuffer, and `archive` can be a view
  // into a larger one, e.g. a pooled Buffer.
  const stream = new UntarFileStream(
    archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength
    )
  );
  for (let entry = stream.next(); entry !== null; entry = stream.next()) {
    const isDirectory = entry.type === DIRECTORY_TYPE;
    // path.join treats backslashes as separators on Windows.
    const [root, ...parts] = entry.name.replace(/\/+$/, '').split(/[\\/]/);
    const isExpected =
      root === rootName &&
      (isDirectory || (FILE_TYPES.has(entry.type) && parts.length > 0)) &&
      parts.every((part) => part !== '' && part !== '.' && part !== '..');
    if (!isExpected) {
      unexpectedEntries.push(entry.name);
      continue;
    }
    files.push({ parts, buffer: isDirectory ? null : entry.buffer });
  }
  if (unexpectedEntries.length > 0) {
    throw new Error(
      `Unexpected entries in the profiler-cli archive: ${unexpectedEntries.join(', ')}`
    );
  }

  fs.mkdirSync(destDir, { recursive: true });
  for (const { parts, buffer } of files) {
    const target = path.join(destDir, ...parts);
    if (buffer === null) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
    }
  }
}
