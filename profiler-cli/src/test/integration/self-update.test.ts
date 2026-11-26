/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `self-update` for a copy installed by "./mach bootstrap", against a fake
 * Taskcluster that serves the profiler-cli toolchain index and artifact.
 */

import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { zstdCompressSync } from 'zlib';
import { exec } from './utils';

const INDEX = 'gecko.cache.level-3.toolchains.v3.profiler-cli';
const BOOTSTRAP_HASH = 'bootstraphash';
const BOOTSTRAP_TASK = 'bootstrapTask';
const LATEST_TASK = 'latestTask';
const CURRENT_VERSION = JSON.parse(
  readFileSync('profiler-cli/package.json', 'utf8')
).version;

const skipTar = process.platform === 'win32';

function makeArtifact(stageDir: string, version: string): Buffer {
  const toolDir = join(stageDir, 'profiler-cli');
  mkdirSync(join(toolDir, 'dist'), { recursive: true });
  cpSync(
    'profiler-cli/dist/profiler-cli.js',
    join(toolDir, 'dist', 'profiler-cli.js')
  );
  cpSync(
    'profiler-cli/dist/mappings.wasm',
    join(toolDir, 'dist', 'mappings.wasm')
  );
  const packageJson = JSON.parse(
    readFileSync('profiler-cli/package.json', 'utf8')
  );
  writeFileSync(
    join(toolDir, 'package.json'),
    JSON.stringify({ ...packageJson, version })
  );
  const tar = execFileSync(
    'tar',
    ['--format=ustar', '-cf', '-', '-C', stageDir, 'profiler-cli'],
    {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  return zstdCompressSync(tar);
}

(skipTar ? describe.skip : describe)(
  'profiler-cli self-update (mach)',
  function () {
    let tmpDir: string;
    let stateDir: string;
    let toolDir: string;
    let server: Server;
    let rootUrl: string;
    let artifact: Buffer;
    let latestTask: string;
    let requests: string[];

    beforeEach(async function () {
      tmpDir = mkdtempSync(join(tmpdir(), 'pcli-self-update-'));
      stateDir = join(tmpDir, 'mozbuild');
      toolDir = join(stateDir, 'profiler-cli');
      mkdirSync(join(toolDir, 'dist'), { recursive: true });
      cpSync('profiler-cli/package.json', join(toolDir, 'package.json'));
      cpSync(
        'profiler-cli/dist/profiler-cli.js',
        join(toolDir, 'dist', 'profiler-cli.js')
      );
      cpSync(
        'profiler-cli/dist/mappings.wasm',
        join(toolDir, 'dist', 'mappings.wasm')
      );
      mkdirSync(join(stateDir, 'indices'));
      writeFileSync(join(stateDir, 'indices', 'profiler-cli'), BOOTSTRAP_HASH);

      artifact = makeArtifact(join(tmpDir, 'stage-new'), '99.0.0');
      latestTask = LATEST_TASK;
      requests = [];
      server = createServer((req, res) => {
        const url = req.url ?? '';
        requests.push(url);
        const indexTasks: Record<string, string> = {
          [`/api/index/v1/task/${INDEX}.latest`]: latestTask,
          [`/api/index/v1/task/${INDEX}.hash.${BOOTSTRAP_HASH}`]:
            BOOTSTRAP_TASK,
        };
        if (url in indexTasks) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ taskId: indexTasks[url] }));
        } else if (
          url ===
          `/api/queue/v1/task/${latestTask}/artifacts/public/build/profiler-cli.tar.zst`
        ) {
          // The real queue redirects to the artifact storage.
          res.writeHead(303, { location: '/storage/profiler-cli.tar.zst' });
          res.end();
        } else if (url === '/storage/profiler-cli.tar.zst') {
          res.writeHead(200);
          res.end(artifact);
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      );
      rootUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(async function () {
      await new Promise((resolve) => server.close(resolve));
      rmSync(tmpDir, { recursive: true, force: true });
    });

    function selfUpdate(...args: string[]) {
      return exec(
        process.execPath,
        [join(toolDir, 'dist', 'profiler-cli.js'), 'self-update', ...args],
        {
          env: {
            MOZBUILD_STATE_PATH: stateDir,
            PROFILER_CLI_TASKCLUSTER_ROOT_URL: rootUrl,
            PROFILER_CLI_SESSION_DIR: join(tmpDir, 'sessions'),
          },
          timeout: 30000,
        }
      );
    }

    function installedVersion(): string {
      return JSON.parse(readFileSync(join(toolDir, 'package.json'), 'utf8'))
        .version;
    }

    it('replaces the bootstrapped copy with the latest build', async function () {
      const result = await selfUpdate();
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `Updated profiler-cli to 99.0.0 from Taskcluster task ${LATEST_TASK}.`
      );
      expect(installedVersion()).toBe('99.0.0');
      expect(existsSync(join(toolDir, 'dist', 'mappings.wasm'))).toBe(true);
      expect(
        readFileSync(join(stateDir, 'indices', 'profiler-cli'), 'utf8')
      ).toBe(BOOTSTRAP_HASH);
      expect(existsSync(`${toolDir}.new`)).toBe(false);
      expect(existsSync(`${toolDir}.old`)).toBe(false);

      const secondRun = await selfUpdate();
      expect(secondRun.exitCode).toBe(0);
      expect(secondRun.stdout).toContain('already the latest build');
    });

    it('does nothing when bootstrap already installed the latest build', async function () {
      latestTask = BOOTSTRAP_TASK;
      const result = await selfUpdate();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('already the latest build');
      expect(requests.some((url) => url.includes('/api/queue/'))).toBe(false);
      expect(installedVersion()).toBe(CURRENT_VERSION);
    });

    it('refuses to downgrade unless forced', async function () {
      artifact = makeArtifact(join(tmpDir, 'stage-old'), '0.0.1');
      const result = await selfUpdate();
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('older than this one');
      expect(installedVersion()).toBe(CURRENT_VERSION);
      expect(existsSync(`${toolDir}.new`)).toBe(false);

      const forced = await selfUpdate('--force');
      expect(forced.exitCode).toBe(0);
      expect(installedVersion()).toBe('0.0.1');
    });
  }
);
