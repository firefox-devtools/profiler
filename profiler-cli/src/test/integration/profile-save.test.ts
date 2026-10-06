/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for `profile save`.
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { gunzipSync } from 'zlib';
import {
  createTestContext,
  cleanupTestContext,
  cli,
  cliFail,
  type CliTestContext,
} from './utils';

import type { ProfileSaveResult, WithContext } from '../../protocol';

describe('profiler-cli profile save', () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it('profile save writes plain JSON that can be loaded again', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    const outPath = join(ctx.sessionDir, 'saved.json');

    const result = await cli(ctx, ['profile', 'save', outPath]);
    expect(result.stdout).toContain(`Saved profile to ${outPath}`);
    expect(result.stdout).toContain('JSON');

    const saved = JSON.parse(await readFile(outPath, 'utf-8'));
    expect(saved.meta.preprocessedProfileVersion).toBeGreaterThan(0);

    await cli(ctx, ['load', outPath, '--session', 'reload']);
    const meta = await cli(ctx, ['profile', 'meta', '--session', 'reload']);
    expect(meta.stdout).toContain('Recording:');
  });

  it('profile save writes gzipped JSON for .json.gz', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    const outPath = join(ctx.sessionDir, 'saved.json.gz');

    const result = await cli(ctx, ['profile', 'save', outPath, '--json']);
    const parsed = JSON.parse(result.stdout) as WithContext<ProfileSaveResult>;
    expect(parsed.type).toBe('profile-save');
    expect(parsed.format).toBe('json-gz');
    expect(parsed.path).toBe(outPath);
    expect(parsed.bytes).toBe((await stat(outPath)).size);

    const saved = JSON.parse(gunzipSync(await readFile(outPath)).toString());
    expect(saved.meta.preprocessedProfileVersion).toBeGreaterThan(0);
  });

  it('profile save writes JSON slabs for .jslb and reloads it', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    const outPath = join(ctx.sessionDir, 'saved.jslb');

    const result = await cli(ctx, ['profile', 'save', outPath, '--json']);
    const parsed = JSON.parse(result.stdout) as WithContext<ProfileSaveResult>;
    expect(parsed.format).toBe('jslb');

    await cli(ctx, ['load', outPath, '--session', 'reload']);
    const info = await cli(ctx, ['profile', 'info', '--session', 'reload']);
    expect(info.stdout).toContain('This profile contains');
  });

  it('profile save refuses to overwrite without --force', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    const outPath = join(ctx.sessionDir, 'existing.json');
    await writeFile(outPath, 'original');

    const failure = await cliFail(ctx, ['profile', 'save', outPath]);
    expect(failure.stderr).toContain('already exists');
    expect(await readFile(outPath, 'utf-8')).toBe('original');

    await cli(ctx, ['profile', 'save', outPath, '--force']);
    expect(await readFile(outPath, 'utf-8')).not.toBe('original');
  });

  it('profile save into a directory names the file after the profile', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    const outDir = join(ctx.sessionDir, 'out');
    await mkdir(outDir);

    const result = await cli(ctx, ['profile', 'save', outDir, '--json']);
    const parsed = JSON.parse(result.stdout) as WithContext<ProfileSaveResult>;
    expect(parsed.format).toBe('json-gz');
    expect(dirname(parsed.path)).toBe(outDir);
    expect(parsed.path).toMatch(
      / \d{4}-\d{2}-\d{2} \d{2}\.\d{2} profile\.json\.gz$/
    );
    expect(await readdir(outDir)).toHaveLength(1);

    const failure = await cliFail(ctx, ['profile', 'save', outDir]);
    expect(failure.stderr).toContain('already exists');
  });

  it('profile save fails when the target directory does not exist', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);

    const failure = await cliFail(ctx, [
      'profile',
      'save',
      join(ctx.sessionDir, 'missing-dir', 'out.json'),
    ]);
    expect(failure.stderr).toContain('Directory not found');
  });

  it('profile save with a trailing slash requires an existing directory', async () => {
    await cli(ctx, ['load', 'src/test/fixtures/upgrades/processed-1.json']);
    const outDir = join(ctx.sessionDir, 'missing-out');

    const failure = await cliFail(ctx, ['profile', 'save', outDir + '/']);
    expect(failure.stderr).toContain('Directory not found');
    expect(await readdir(ctx.sessionDir)).not.toContain('missing-out');

    await mkdir(outDir);
    const result = await cli(ctx, ['profile', 'save', outDir + '/', '--json']);
    const parsed = JSON.parse(result.stdout) as WithContext<ProfileSaveResult>;
    expect(parsed.path).toMatch(/profile\.json\.gz$/);
    expect(await readdir(outDir)).toHaveLength(1);
  });
});
