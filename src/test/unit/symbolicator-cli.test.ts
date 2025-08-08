/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { InMemorySymbolDB, makeOptionsFromArgv } from '../../symbolicator-cli';
import { completeSymbolTableAsTuple } from '../fixtures/example-symbol-table';
import { SymbolsNotFoundError } from '../../profile-logic/errors';

describe('makeOptionsFromArgv', function () {
  const commonArgs = ['/path/to/node', '/path/to/symbolicator-cli.js'];

  it('should pass arguments into options object', function () {
    const options = makeOptionsFromArgv([
      ...commonArgs,
      '--input',
      '/path/to/input',
      '--output',
      '/path/to/output',
      '--server',
      'http://symbol.server/',
    ]);

    expect(options.input).toEqual('/path/to/input');
    expect(options.output).toEqual('/path/to/output');
    expect(options.server).toEqual('http://symbol.server/');
  });

  it('should throw if an argument is missing', function () {
    expect(() => makeOptionsFromArgv(commonArgs)).toThrow();

    expect(() =>
      makeOptionsFromArgv([...commonArgs, '--input', 'value'])
    ).toThrow();
    expect(() =>
      makeOptionsFromArgv([...commonArgs, '--output', 'value'])
    ).toThrow();
    expect(() =>
      makeOptionsFromArgv([...commonArgs, '--server', 'value'])
    ).toThrow();

    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '--output',
        'value',
        '--server',
        'value',
      ])
    ).toThrow();
    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '--input',
        'value',
        '--server',
        'value',
      ])
    ).toThrow();
    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '--input',
        'value',
        '--output',
        'value',
      ])
    ).toThrow();
  });

  it('should throw if argument has no specified value', function () {
    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '--input',
        '--output',
        'value',
        '--server',
        'value',
      ])
    ).toThrow();
    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '--input',
        'value',
        '--output',
        '--server',
        'value',
      ])
    ).toThrow();
    expect(() =>
      makeOptionsFromArgv([
        ...commonArgs,
        '--input',
        'value',
        '--output',
        'value',
        '--server',
      ])
    ).toThrow();
  });
});

describe('InMemorySymbolDB', function () {
  const debugName = 'debugName';
  const breakpadId = 'breakpadId';

  it('should get a SymbolTable that was set', async function () {
    const db = new InMemorySymbolDB();

    await db.storeSymbolTable(
      debugName,
      breakpadId,
      completeSymbolTableAsTuple
    );

    const table = await db.getSymbolTable(debugName, breakpadId);
    expect(table).toEqual(completeSymbolTableAsTuple);
  });

  it('should throw when getting a SymbolTable that was not set', async function () {
    const db = new InMemorySymbolDB();

    await expect(async () => {
      await db.getSymbolTable(debugName, breakpadId);
    }).rejects.toThrow(SymbolsNotFoundError);
  });
});
