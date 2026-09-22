/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for `load --with-samply`, against the fake samply fixture: first
 * startSamplyServer in-process, then the real CLI and daemon end to end.
 */

import { readdirSync, readFileSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { startSamplyServer } from '../../samply';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';
import {
  installFakeSamply,
  isAlive,
  waitFor,
  pathWithoutSamply,
  skipFakeSamply,
  snapshotEnv,
  type FakeSamply,
  type FakeSamplyMode,
} from './fake-samply';

const PROFILE = 'src/test/fixtures/upgrades/processed-1.json';

const ENV_KEYS = [
  'PATH',
  'PROFILER_CLI_SAMPLY_PATH',
  'MOZBUILD_STATE_PATH',
  'FAKE_SAMPLY_MODE',
  'FAKE_SAMPLY_PID_FILE',
  'FAKE_SAMPLY_REQUEST_LOG',
];

const describeFakeSamply = skipFakeSamply ? describe.skip : describe;

describeFakeSamply('startSamplyServer', () => {
  let tmp: string;
  let restoreEnv: () => void;

  async function useFakeSamply(mode: FakeSamplyMode) {
    const fake = await installFakeSamply(join(tmp, 'bin'), mode);
    Object.assign(process.env, fake.env);
    process.env.PROFILER_CLI_SAMPLY_PATH = fake.binaryPath;
    return fake;
  }

  beforeEach(async () => {
    restoreEnv = snapshotEnv(ENV_KEYS);
    tmp = await mkdtemp(join(tmpdir(), 'samply-server-'));
    process.env.PATH = pathWithoutSamply();
    delete process.env.PROFILER_CLI_SAMPLY_PATH;
    process.env.MOZBUILD_STATE_PATH = join(tmp, 'no-mozbuild');
  });

  afterEach(async () => {
    restoreEnv();
    await rm(tmp, { recursive: true, force: true });
  });

  it('resolves with the profiler URL once the server is up', async () => {
    const fake = await useFakeSamply('serve');
    const server = startSamplyServer('/some/profile.json');
    try {
      expect(server.binaryPath).toBe(fake.binaryPath);
      expect(server.child.spawnargs.slice(1)).toEqual([
        'load',
        '--no-open',
        '/some/profile.json',
      ]);
      await expect(server.ready).resolves.toMatch(
        /^https:\/\/profiler\.firefox\.com\/from-url\/http%3A%2F%2F127\.0\.0\.1%3A\d+%2Ftok%2Fprofile\.json\/\?symbolServer=http%3A%2F%2F127\.0\.0\.1%3A\d+%2Ftok$/
      );
      expect(isAlive(server.child.pid!)).toBe(true);
    } finally {
      server.child.kill();
    }
    expect(await waitFor(() => !isAlive(server.child.pid!))).toBe(true);
  });

  it('rejects with samply output when it exits early', async () => {
    await useFakeSamply('exit');
    const server = startSamplyServer('/some/profile.json');
    await expect(server.ready).rejects.toThrow(
      /samply exited before its server was ready \(exit code 1\)\.\nsamply output:\nCould not parse the input file as JSON/
    );
  });

  it('rejects and kills samply when it never prints a URL', async () => {
    const fake = await useFakeSamply('hang');
    const server = startSamplyServer('/some/profile.json', 500);
    await expect(server.ready).rejects.toThrow(
      /did not print a profiler URL within 500ms\.\nsamply output:\nLocal server listening/
    );
    const pid = parseInt(await readFile(fake.pidFile, 'utf-8'), 10);
    expect(pid).toBe(server.child.pid);
    expect(await waitFor(() => !isAlive(pid))).toBe(true);
  });

  it('throws synchronously when no samply can be found', () => {
    expect(() => startSamplyServer('/some/profile.json')).toThrow(
      /samply was not found in PATH or in .*no-mozbuild/
    );
  });
});

describeFakeSamply('load --with-samply', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    ctx.env.PATH = pathWithoutSamply();
    ctx.env.MOZBUILD_STATE_PATH = join(ctx.sessionDir, 'no-mozbuild');
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  /** Put the fake samply on the daemon's PATH. */
  async function fakeSamplyOnPath(
    mode: FakeSamplyMode = 'serve'
  ): Promise<FakeSamply> {
    const binDir = join(ctx.sessionDir, 'bin');
    const fake = await installFakeSamply(binDir, mode);
    Object.assign(ctx.env, fake.env);
    ctx.env.PATH = [binDir, ctx.env.PATH].join(delimiter);
    return fake;
  }

  async function loadWithSamply(): Promise<{
    sessionId: string;
    daemonPid: number;
  }> {
    const result = await cli(ctx, ['load', PROFILE, '--with-samply']);
    const sessionId = result.stdout.match(/Session started: (\w+)/)![1];
    const metadata = JSON.parse(
      await readFile(join(ctx.sessionDir, `${sessionId}.json`), 'utf-8')
    );
    return { sessionId, daemonPid: metadata.pid };
  }

  async function readSamplyPid(fake: FakeSamply): Promise<number> {
    return parseInt(await readFile(fake.pidFile, 'utf-8'), 10);
  }

  async function readDaemonLog(sessionId: string): Promise<string> {
    return readFile(join(ctx.sessionDir, `${sessionId}.log`), 'utf-8');
  }

  it('fetches the profile through samply and uses its symbol server', async () => {
    const fake = await fakeSamplyOnPath();
    const { sessionId } = await loadWithSamply();

    // The profile went over HTTP from samply, not from disk.
    const requests = await readFile(fake.requestLog, 'utf-8');
    expect(requests).toContain('GET /tok/profile.json');

    const log = await readDaemonLog(sessionId);
    expect(log).toContain(`Using samply at ${fake.binaryPath}`);
    expect(log).toMatch(
      /Loading profile from https:\/\/profiler\.firefox\.com\/from-url\/.*symbolServer=http%3A%2F%2F127\.0\.0\.1%3A\d+%2Ftok/
    );

    const info = await cli(ctx, ['profile', 'info']);
    expect(info.stdout).toContain('This profile contains 3 threads');
  });

  it('records the original file path as the session profile path', async () => {
    await fakeSamplyOnPath();
    const { sessionId } = await loadWithSamply();
    const metadata = JSON.parse(
      await readFile(join(ctx.sessionDir, `${sessionId}.json`), 'utf-8')
    );
    expect(metadata.profilePath).toBe(join(process.cwd(), PROFILE));
  });

  it('keeps samply alive for the session and stops it on "stop"', async () => {
    const fake = await fakeSamplyOnPath();
    const { sessionId } = await loadWithSamply();
    const samplyPid = await readSamplyPid(fake);

    // Still there after the load command's client process has exited.
    await cli(ctx, ['status']);
    expect(isAlive(samplyPid)).toBe(true);

    await cli(ctx, ['stop', sessionId]);
    expect(await waitFor(() => !isAlive(samplyPid))).toBe(true);
  });

  it('stops samply when the daemon is terminated by a signal', async () => {
    const fake = await fakeSamplyOnPath();
    const { daemonPid } = await loadWithSamply();
    const samplyPid = await readSamplyPid(fake);

    process.kill(daemonPid, 'SIGTERM');
    expect(await waitFor(() => !isAlive(daemonPid))).toBe(true);
    expect(await waitFor(() => !isAlive(samplyPid))).toBe(true);
  });

  it('survives samply dying mid-session and logs it', async () => {
    const fake = await fakeSamplyOnPath();
    const { sessionId } = await loadWithSamply();
    const samplyPid = await readSamplyPid(fake);

    process.kill(samplyPid, 'SIGKILL');
    expect(await waitFor(() => !isAlive(samplyPid))).toBe(true);

    const status = await cli(ctx, ['status']);
    expect(status.stdout).toContain('Selected thread');

    const logged = await waitFor(() =>
      readFileSync(join(ctx.sessionDir, `${sessionId}.log`), 'utf-8').includes(
        'samply exited (signal SIGKILL)'
      )
    );
    expect(logged).toBe(true);
  });

  it('falls back to the mozbuild samply when PATH has none', async () => {
    const mozbuild = join(ctx.sessionDir, 'mozbuild');
    const fake = await installFakeSamply(join(mozbuild, 'samply'));
    Object.assign(ctx.env, fake.env);
    ctx.env.MOZBUILD_STATE_PATH = mozbuild;

    const { sessionId } = await loadWithSamply();
    expect(await readDaemonLog(sessionId)).toContain(
      `Using samply at ${fake.binaryPath}`
    );
  });

  it('reports a missing samply binary', async () => {
    const result = await cliFail(ctx, ['load', PROFILE, '--with-samply']);
    expect(result.stderr).toContain('samply was not found in PATH or in');
    expect(result.stderr).toContain('./mach bootstrap');
  });

  it('reports samply failing to start, with its output', async () => {
    await fakeSamplyOnPath('exit');

    const result = await cliFail(ctx, ['load', PROFILE, '--with-samply']);
    expect(result.stderr).toContain(
      'samply exited before its server was ready (exit code 1)'
    );
    expect(result.stderr).toContain('Could not parse the input file as JSON');

    // The startup failure is the whole story, so the mid-session warning
    // must not be logged on top of it.
    const logs = readdirSync(ctx.sessionDir).filter((f) => f.endsWith('.log'));
    expect(logs).toHaveLength(1);
    const log = await readFile(join(ctx.sessionDir, logs[0]), 'utf-8');
    expect(log).toContain('samply exited before its server was ready');
    expect(log).not.toContain('Symbol lookups will fail');
  });

  it('stops samply when the profile fails to load', async () => {
    const fake = await fakeSamplyOnPath();
    const badProfile = join(ctx.sessionDir, 'not-a-profile.json');
    await writeFile(badProfile, 'this is not json');

    const result = await cliFail(ctx, ['load', badProfile, '--with-samply']);
    expect(result.stderr).toContain('Profile load failed');
    const samplyPid = await readSamplyPid(fake);
    expect(await waitFor(() => !isAlive(samplyPid))).toBe(true);
  });

  it('stops a samply that is still starting when the daemon is stopped', async () => {
    const fake = await fakeSamplyOnPath('hang');
    // The daemon gives samply 15s, so the client gives up first and the
    // daemon is left waiting on samply.
    ctx.env.PROFILER_CLI_LOAD_TIMEOUT_MS = '2000';

    const result = await cliFail(ctx, ['load', PROFILE, '--with-samply']);
    expect(result.stderr).toMatch(/Profile load timeout after 2000ms/);
    const samplyPid = await readSamplyPid(fake);
    expect(isAlive(samplyPid)).toBe(true);

    await cli(ctx, ['stop']);
    expect(await waitFor(() => !isAlive(samplyPid))).toBe(true);
  });

  it('rejects URLs and --symbol-server without starting anything', async () => {
    const fake = await fakeSamplyOnPath();

    const urlResult = await cliFail(ctx, [
      'load',
      'https://example.com/profile.json',
      '--with-samply',
    ]);
    expect(urlResult.stderr).toContain('needs a local profile file');

    const symbolServerResult = await cliFail(ctx, [
      'load',
      PROFILE,
      '--with-samply',
      '--symbol-server',
      'http://127.0.0.1:1',
    ]);
    expect(symbolServerResult.stderr).toContain('cannot be combined');

    await expect(readFile(fake.pidFile)).rejects.toThrow();
  });
});
