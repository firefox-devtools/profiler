/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CliOptions } from '../../../symbolicator-cli';
import { run } from '../../../symbolicator-cli';

// An end-to-end test for the symbolicator-cli tool.

// Note that this test is running in a Jest environment which includes
// various mocks / shims that makes it feel more like a browser environment.
// For example, window.Worker is available.
//
// This is somewhat unfortunate because symbolicator-cli is intended to
// run in vanilla Node, not in a browser, so we're not really testing
// under realistic conditions here.
//
// It may be worth splitting this test off into a separate "vanilla Node"
// testing environment at some point.

describe('symbolicator-cli tool', function () {
  async function runToTempFileAndReturnOutput(options: CliOptions) {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbolicator-cli-test')
    );
    const tempFile = path.join(tempDir, 'temp.json');
    options.output = tempFile;

    try {
      await run(options);
      return JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  it('is symbolicating a trace correctly', async function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const symbolsJson = fs.readFileSync(
      'src/test/integration/symbolicator-cli/symbol-server-response.json'
    );

    window.fetchMock.post(
      'http://symbol.server/symbolicate/v5',
      new Response(symbolsJson as any)
    );

    const options = {
      input: 'src/test/integration/symbolicator-cli/unsymbolicated.json',
      output: '',
      server: 'http://symbol.server',
    };

    const result = await runToTempFileAndReturnOutput(options);

    expect(console.warn).not.toHaveBeenCalled();
    expect(result).toMatchSnapshot();
  });

  it('is symbolicating a .json.gz trace correctly', async function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const symbolsJson = fs.readFileSync(
      'src/test/integration/symbolicator-cli/symbol-server-response.json'
    );

    window.fetchMock.post(
      'http://symbol.server/symbolicate/v5',
      new Response(symbolsJson as any)
    );

    const options = {
      input: 'src/test/integration/symbolicator-cli/unsymbolicated.json.gz',
      output: '',
      server: 'http://symbol.server',
    };

    const result = await runToTempFileAndReturnOutput(options);

    expect(console.warn).not.toHaveBeenCalled();
    expect(result).toMatchSnapshot();
  });
});
