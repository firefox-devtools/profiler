/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for how the samply binary is located.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findSamplyBinary, describeMissingSamply } from '../../samply';
import { snapshotEnv, SAMPLY_BINARY } from '../integration/fake-samply';

// Windows has no execute bit, so fs.access(X_OK) only checks existence there.
const skipExecBit = process.platform === 'win32';

describe('findSamplyBinary', () => {
  let tmp: string;
  const ENV_KEYS = ['PATH', 'PROFILER_CLI_SAMPLY_PATH', 'MOZBUILD_STATE_PATH'];
  let restoreEnv: () => void;

  function makeExecutable(filePath: string): string {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '#!/bin/sh\n');
    fs.chmodSync(filePath, 0o755);
    return filePath;
  }

  beforeEach(() => {
    restoreEnv = snapshotEnv(ENV_KEYS);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samply-lookup-'));
    delete process.env.PROFILER_CLI_SAMPLY_PATH;
    process.env.PATH = path.join(tmp, 'empty-path');
    process.env.MOZBUILD_STATE_PATH = path.join(tmp, 'empty-mozbuild');
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when nothing is installed', () => {
    expect(findSamplyBinary()).toBeNull();
  });

  it('finds samply on PATH, skipping directories that lack it', () => {
    const noSamply = path.join(tmp, 'bin-without');
    fs.mkdirSync(noSamply);
    const withSamply = makeExecutable(
      path.join(tmp, 'bin-with', SAMPLY_BINARY)
    );
    process.env.PATH = [noSamply, path.dirname(withSamply)].join(
      path.delimiter
    );

    expect(findSamplyBinary()).toBe(withSamply);
  });

  it('ignores a non-executable samply on PATH', () => {
    if (skipExecBit) {
      return;
    }
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, SAMPLY_BINARY), '');
    fs.chmodSync(path.join(binDir, SAMPLY_BINARY), 0o644);
    process.env.PATH = binDir;

    expect(findSamplyBinary()).toBeNull();
  });

  it('ignores a directory named samply on PATH', () => {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(path.join(binDir, SAMPLY_BINARY), { recursive: true });
    process.env.PATH = binDir;

    expect(findSamplyBinary()).toBeNull();
  });

  it('falls back to MOZBUILD_STATE_PATH', () => {
    const mozbuild = path.join(tmp, 'mozbuild');
    const samply = makeExecutable(path.join(mozbuild, 'samply', SAMPLY_BINARY));
    process.env.MOZBUILD_STATE_PATH = mozbuild;

    expect(findSamplyBinary()).toBe(samply);
  });

  it('prefers PATH over mozbuild', () => {
    const onPath = makeExecutable(path.join(tmp, 'bin', SAMPLY_BINARY));
    const mozbuild = path.join(tmp, 'mozbuild');
    makeExecutable(path.join(mozbuild, 'samply', SAMPLY_BINARY));
    process.env.PATH = path.dirname(onPath);
    process.env.MOZBUILD_STATE_PATH = mozbuild;

    expect(findSamplyBinary()).toBe(onPath);
  });

  it('prefers PROFILER_CLI_SAMPLY_PATH over everything', () => {
    const onPath = makeExecutable(path.join(tmp, 'bin', SAMPLY_BINARY));
    const explicit = makeExecutable(path.join(tmp, 'custom', 'my-samply'));
    process.env.PATH = path.dirname(onPath);
    process.env.PROFILER_CLI_SAMPLY_PATH = explicit;

    expect(findSamplyBinary()).toBe(explicit);
  });

  it('throws instead of falling back when PROFILER_CLI_SAMPLY_PATH is wrong', () => {
    const onPath = makeExecutable(path.join(tmp, 'bin', SAMPLY_BINARY));
    process.env.PATH = path.dirname(onPath);
    process.env.PROFILER_CLI_SAMPLY_PATH = path.join(tmp, 'does-not-exist');

    expect(() => findSamplyBinary()).toThrow(
      /PROFILER_CLI_SAMPLY_PATH is set to .*does-not-exist/
    );
  });

  it('describes the mozbuild location it looked in', () => {
    process.env.MOZBUILD_STATE_PATH = '/some/mozbuild';
    const message = describeMissingSamply();
    expect(message).toContain(path.join('/some/mozbuild', 'samply'));
    expect(message).toContain('PROFILER_CLI_SAMPLY_PATH');
    expect(message).toContain('./mach bootstrap');
  });
});
