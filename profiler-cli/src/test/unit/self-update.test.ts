/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { extractTar, getInstallKind } from '../../self-update';
import { snapshotEnv } from '../integration/fake-samply';

const PACKAGE = '@firefox-devtools/profiler-cli';

jest.mock('../../constants', () => ({
  BUILD_HASH: 'test-build-hash',
  PACKAGE_NAME: '@firefox-devtools/profiler-cli',
  VERSION: '0.13.0',
}));

describe('profiler-cli self-update', function () {
  let tmpDir: string;
  let restoreEnv: () => void;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcli-self-update-'));
    restoreEnv = snapshotEnv(['MOZBUILD_STATE_PATH']);
    process.env.MOZBUILD_STATE_PATH = path.join(tmpDir, 'mozbuild');
  });

  afterEach(function () {
    restoreEnv();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getInstallKind', function () {
    const npmRoot = () => path.join(tmpDir, 'npm', 'lib', 'node_modules');
    const noNpm = () => null;

    it('detects the copy installed by mach bootstrap', function () {
      const script = path.join(
        tmpDir,
        'mozbuild',
        'profiler-cli',
        'dist',
        'profiler-cli.js'
      );
      expect(getInstallKind(script, npmRoot)).toBe('mach');
    });

    it('detects a global npm install', function () {
      const script = path.join(npmRoot(), PACKAGE, 'dist', 'profiler-cli.js');
      expect(getInstallKind(script, npmRoot)).toBe('npm-global');
    });

    it('follows the bin symlink of a global npm install', function () {
      const script = path.join(npmRoot(), PACKAGE, 'dist', 'profiler-cli.js');
      fs.mkdirSync(path.dirname(script), { recursive: true });
      fs.writeFileSync(script, '');
      const bin = path.join(tmpDir, 'npm', 'bin', 'pq');
      fs.mkdirSync(path.dirname(bin), { recursive: true });
      fs.symlinkSync(script, bin);
      expect(getInstallKind(bin, npmRoot)).toBe('npm-global');
    });

    it('detects npx', function () {
      const script = path.join(
        tmpDir,
        '.npm',
        '_npx',
        'abc',
        'node_modules',
        PACKAGE,
        'dist',
        'profiler-cli.js'
      );
      expect(getInstallKind(script, npmRoot)).toBe('npx');
    });

    it('does not claim installs that npm -g does not own', function () {
      const script = path.join(
        tmpDir,
        'project',
        'node_modules',
        PACKAGE,
        'dist',
        'profiler-cli.js'
      );
      expect(getInstallKind(script, npmRoot)).toBe('other-node-modules');
      expect(getInstallKind(script, noNpm)).toBe('other-node-modules');
    });

    it('detects a build from a source checkout', function () {
      const script = path.join(
        tmpDir,
        'profiler',
        'profiler-cli',
        'dist',
        'profiler-cli.js'
      );
      expect(getInstallKind(script, npmRoot)).toBe('source');
    });
  });

  describe('extractTar', function () {
    function makeTar(sourceDir: string, entry: string): Uint8Array {
      return execFileSync(
        'tar',
        // -P keeps ".." components that tar would otherwise strip.
        ['--format=ustar', '-P', '-cf', '-', '-C', sourceDir, entry],
        // Stops macOS tar from adding AppleDouble "._" entries.
        { env: { ...process.env, COPYFILE_DISABLE: '1' } }
      );
    }

    it('extracts files below the root directory', function () {
      const source = path.join(tmpDir, 'source');
      fs.mkdirSync(path.join(source, 'profiler-cli', 'dist'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(source, 'profiler-cli', 'package.json'),
        '{"version":"1.2.3"}'
      );
      fs.writeFileSync(
        path.join(source, 'profiler-cli', 'dist', 'profiler-cli.js'),
        'console.log("hi");'
      );

      const dest = path.join(tmpDir, 'dest');
      extractTar(makeTar(source, 'profiler-cli'), dest, 'profiler-cli');

      expect(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')).toBe(
        '{"version":"1.2.3"}'
      );
      expect(
        fs.readFileSync(path.join(dest, 'dist', 'profiler-cli.js'), 'utf8')
      ).toBe('console.log("hi");');
    });

    it('rejects entries outside the root directory', function () {
      const source = path.join(tmpDir, 'source');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'evil.js'), '');

      const dest = path.join(tmpDir, 'dest');
      expect(() =>
        extractTar(makeTar(source, 'evil.js'), dest, 'profiler-cli')
      ).toThrow('Unexpected entries in the profiler-cli archive: evil.js');
    });

    it('rejects ".." components', function () {
      const source = path.join(tmpDir, 'source', 'nested');
      fs.mkdirSync(path.join(source, 'profiler-cli'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'evil.js'), '');

      // After stripping "profiler-cli/", this would land next to `dest`.
      const dest = path.join(tmpDir, 'out', 'dest');
      expect(() =>
        extractTar(
          makeTar(source, 'profiler-cli/../../../evil.js'),
          dest,
          'profiler-cli'
        )
      ).toThrow(
        'Unexpected entries in the profiler-cli archive: profiler-cli/../../../evil.js'
      );
      expect(fs.existsSync(path.join(tmpDir, 'out', 'evil.js'))).toBe(false);
    });

    it('rejects symbolic links', function () {
      const source = path.join(tmpDir, 'source');
      fs.mkdirSync(path.join(source, 'profiler-cli'), { recursive: true });
      fs.symlinkSync(tmpDir, path.join(source, 'profiler-cli', 'link'));

      const dest = path.join(tmpDir, 'dest');
      expect(() =>
        extractTar(makeTar(source, 'profiler-cli'), dest, 'profiler-cli')
      ).toThrow(
        'Unexpected entries in the profiler-cli archive: profiler-cli/link'
      );
      expect(fs.existsSync(path.join(dest, 'link'))).toBe(false);
    });
  });
});
