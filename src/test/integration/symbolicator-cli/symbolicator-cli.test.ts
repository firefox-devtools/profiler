/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CliOptions } from '../../../symbolicator-cli';
import { run } from '../../../symbolicator-cli';

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
});
