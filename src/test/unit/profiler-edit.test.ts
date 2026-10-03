/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  createSourceReader,
  makeOptionsFromArgv,
  parseSourcePathMappings,
} from '../../node-tools/profiler-edit';
import type { SourceReader } from '../../profile-logic/embed-js-sources';

describe('makeOptionsFromArgv', function () {
  const commonArgs = ['/path/to/node', '/path/to/profiler-edit.js'];

  it('recognizes -i with a file path', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      '/path/to/profile.json',
      '-o',
      '/path/to/output.json',
    ]);
    expect(options.input).toEqual({
      type: 'FILE',
      path: '/path/to/profile.json',
    });
    expect(options.output).toEqual('/path/to/output.json');
    expect(options.symbolicateWithServer).toBeUndefined();
    expect(options.insertLabelFrames).toBeUndefined();
  });

  it('recognizes -i with an http URL', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      'http://example.com/profile.json',
      '-o',
      '/path/to/output.json',
    ]);
    expect(options.input).toEqual({
      type: 'URL',
      url: 'http://example.com/profile.json',
    });
  });

  it('recognizes -i with an https URL', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      'https://example.com/profile.json',
      '-o',
      '/path/to/output.json',
    ]);
    expect(options.input).toEqual({
      type: 'URL',
      url: 'https://example.com/profile.json',
    });
  });

  it('recognizes --from-file', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '--from-file',
      '/path/to/profile.json',
      '-o',
      '/path/to/output.json',
    ]);
    expect(options.input).toEqual({
      type: 'FILE',
      path: '/path/to/profile.json',
    });
  });

  it('recognizes --from-url', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '--from-url',
      'https://example.com/profile.json',
      '-o',
      '/path/to/output.json',
    ]);
    expect(options.input).toEqual({
      type: 'URL',
      url: 'https://example.com/profile.json',
    });
  });

  it('recognizes --from-hash', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '--from-hash',
      'abc123',
      '-o',
      '/path/to/output.json',
    ]);
    expect(options.input).toEqual({ type: 'HASH', hash: 'abc123' });
  });

  it('recognizes --output as an alias for -o', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      '/path/to/profile.json',
      '--output',
      '/path/to/output.json',
    ]);
    expect(options.output).toEqual('/path/to/output.json');
  });

  it('recognizes optional --symbolicate-with-server', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      '/path/to/profile.json',
      '-o',
      '/path/to/output.json',
      '--symbolicate-with-server',
      'http://localhost:8001/',
    ]);
    expect(options.symbolicateWithServer).toEqual('http://localhost:8001/');
  });

  it('recognizes optional --map-source-paths', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      '/path/to/profile.json',
      '-o',
      '/path/to/output.json',
      '--map-source-paths',
      '/path/to/mapping.json',
    ]);
    expect(options.mapSourcePaths).toEqual('/path/to/mapping.json');
  });

  it('recognizes optional --insert-label-frames', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '-i',
      '/path/to/profile.json',
      '-o',
      '/path/to/output.json',
      '--insert-label-frames',
      '/path/to/labels.toml',
    ]);
    expect(options.insertLabelFrames).toEqual('/path/to/labels.toml');
  });

  it('throws when no input is provided', function () {
    expect(() =>
      makeOptionsFromArgv([...commonArgs, '-o', '/path/to/output.json'])
    ).toThrow();
  });

  it('throws when multiple inputs are provided', function () {
    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '-i',
        '/path/to/profile.json',
        '--from-hash',
        'abc123',
        '-o',
        '/path/to/output.json',
      ])
    ).toThrow();
  });

  it('throws when no output is provided', function () {
    expect(() =>
      makeOptionsFromArgv([...commonArgs, '-i', '/path/to/profile.json'])
    ).toThrow();
  });

  it('throws when -i has no value because next token is a flag', function () {
    // Commander writes "error: too many arguments" to stderr before throwing
    // (it takes `-o` as the value of `-i` and then sees the output path as an
    // unexpected positional). Silence it so it doesn't clutter test output.
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() =>
      makeOptionsFromArgv([...commonArgs, '-i', '-o', '/path/to/output.json'])
    ).toThrow();
  });
});

describe('parseSourcePathMappings', function () {
  function parse(mappings: unknown) {
    return parseSourcePathMappings(JSON.stringify({ mappings }), '/base');
  }

  it('resolves local paths against the base directory', function () {
    expect(
      parse([{ urlPrefix: 'http://127.0.0.1:62763', localPath: 'benchmarks' }])
    ).toEqual([
      {
        urlPrefix: 'http://127.0.0.1:62763/',
        localPath: path.resolve('/base', 'benchmarks'),
      },
    ]);
  });

  it('rejects invalid files', function () {
    expect(() => parseSourcePathMappings('{}', '/base')).toThrow('at mappings');
    expect(() => parse([{ localPath: '/dir' }])).toThrow(
      'at mappings.0.urlPrefix'
    );
    expect(() =>
      parse([{ urlPrefix: 'not a url', localPath: '/dir' }])
    ).toThrow('Invalid URL');
    expect(() => parse([{ urlPrefix: 'http://host/', localPath: '' }])).toThrow(
      'at mappings.0.localPath'
    );
  });
});

describe('createSourceReader', function () {
  let tempDir: string;

  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profiler-edit-test'));
    fs.mkdirSync(path.join(tempDir, 'served', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'served', 'dist', 'app.js'), 'app();');
    fs.writeFileSync(path.join(tempDir, 'secret.txt'), 'secret');
  });

  afterEach(function () {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeLocalReader(): SourceReader {
    return createSourceReader([
      {
        urlPrefix: 'http://127.0.0.1:62763/',
        localPath: path.join(tempDir, 'served'),
      },
    ]);
  }

  it('reads files below the mapped directory', async function () {
    const readSource = makeLocalReader();
    expect(await readSource('http://127.0.0.1:62763/dist/app.js')).toBe(
      'app();'
    );
    expect(
      await readSource('http://127.0.0.1:62763/dist/app.js?v=1#hash')
    ).toBe('app();');
    expect(await readSource('http://127.0.0.1:62763/dist/missing.js')).toBe(
      null
    );
    expect(await readSource('http://127.0.0.1:9999/dist/app.js')).toBe(null);
  });

  it('never reads outside of the mapped directory', async function () {
    const readSource = makeLocalReader();
    expect(await readSource('http://127.0.0.1:62763/../secret.txt')).toBe(null);
    expect(await readSource('http://127.0.0.1:62763/..%2fsecret.txt')).toBe(
      null
    );
    expect(await readSource('http://127.0.0.1:62763/%2e%2e/secret.txt')).toBe(
      null
    );
  });

  it('uses the most specific mapping for a URL', async function () {
    fs.mkdirSync(path.join(tempDir, 'nested', 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'nested', 'dist', 'app.js'),
      'nested();'
    );
    const readSource = createSourceReader([
      {
        urlPrefix: 'http://127.0.0.1:62763/',
        localPath: path.join(tempDir, 'served'),
      },
      {
        urlPrefix: 'http://127.0.0.1:62763/nested/',
        localPath: path.join(tempDir, 'nested'),
      },
    ]);
    expect(await readSource('http://127.0.0.1:62763/nested/dist/app.js')).toBe(
      'nested();'
    );
    expect(await readSource('http://127.0.0.1:62763/dist/app.js')).toBe(
      'app();'
    );
  });
});
