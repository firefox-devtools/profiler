/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { makeOptionsFromArgv } from '../../node-tools/profiler-edit';

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
    expect(() =>
      makeOptionsFromArgv([...commonArgs, '-i', '-o', '/path/to/output.json'])
    ).toThrow();
  });
});
