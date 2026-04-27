/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CliOptions } from '../../../node-tools/profiler-edit';
import { run } from '../../../node-tools/profiler-edit';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';

// An end-to-end test for the profiler-edit tool's symbolication feature.

// Note that this test is running in a Jest environment which includes
// various mocks / shims that makes it feel more like a browser environment.
// For example, window.Worker is available.
//
// This is somewhat unfortunate because profiler-edit is intended to
// run in vanilla Node, not in a browser, so we're not really testing
// under realistic conditions here.
//
// It may be worth splitting this test off into a separate "vanilla Node"
// testing environment at some point.

describe('profiler-edit tool', function () {
  async function runToTempFileAndReturnOutput(options: CliOptions) {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'profiler-edit-test')
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
      'src/test/integration/profiler-edit/symbol-server-response.json'
    );

    window.fetchMock.post(
      'http://symbol.server/symbolicate/v5',
      new Response(symbolsJson as any)
    );

    const options: CliOptions = {
      input: {
        type: 'FILE',
        path: 'src/test/integration/profiler-edit/unsymbolicated.json',
      },
      output: '',
      symbolicateWithServer: 'http://symbol.server',
    };

    const result = await runToTempFileAndReturnOutput(options);

    expect(console.warn).not.toHaveBeenCalled();
    expect(result).toMatchSnapshot();
  });

  it('is symbolicating a .json.gz trace correctly', async function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const symbolsJson = fs.readFileSync(
      'src/test/integration/profiler-edit/symbol-server-response.json'
    );

    window.fetchMock.post(
      'http://symbol.server/symbolicate/v5',
      new Response(symbolsJson as any)
    );

    const options: CliOptions = {
      input: {
        type: 'FILE',
        path: 'src/test/integration/profiler-edit/unsymbolicated.json.gz',
      },
      output: '',
      symbolicateWithServer: 'http://symbol.server',
    };

    const result = await runToTempFileAndReturnOutput(options);

    expect(console.warn).not.toHaveBeenCalled();
    expect(result).toMatchSnapshot();
  });

  it('writes gzip-compressed output when the output filename ends with .gz', async function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'profiler-edit-test')
    );
    const tempFile = path.join(tempDir, 'out.json.gz');

    try {
      const options: CliOptions = {
        input: {
          type: 'FILE',
          path: 'src/test/integration/profiler-edit/unsymbolicated.json',
        },
        output: tempFile,
      };

      await run(options);

      const bytes = fs.readFileSync(tempFile);
      expect(bytes[0]).toBe(0x1f);
      expect(bytes[1]).toBe(0x8b);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads a profile from a URL', async function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const profileJson = fs.readFileSync(
      'src/test/integration/profiler-edit/unsymbolicated.json'
    );
    const symbolsJson = fs.readFileSync(
      'src/test/integration/profiler-edit/symbol-server-response.json'
    );

    window.fetchMock.get(
      'http://example.profile/profile.json',
      new Response(profileJson as any)
    );
    window.fetchMock.post(
      'http://symbol.server/symbolicate/v5',
      new Response(symbolsJson as any)
    );

    const options: CliOptions = {
      input: {
        type: 'URL',
        url: 'http://example.profile/profile.json',
      },
      output: '',
      symbolicateWithServer: 'http://symbol.server',
    };

    const result = await runToTempFileAndReturnOutput(options);

    expect(console.warn).not.toHaveBeenCalled();
    expect(result).toMatchSnapshot();
  });

  it('loads a profile from a storage hash', async function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const profileJson = fs.readFileSync(
      'src/test/integration/profiler-edit/unsymbolicated.json'
    );
    const symbolsJson = fs.readFileSync(
      'src/test/integration/profiler-edit/symbol-server-response.json'
    );

    const hash = 'testHash123';
    window.fetchMock.get(
      `https://storage.googleapis.com/${GOOGLE_STORAGE_BUCKET}/${hash}`,
      new Response(profileJson as any)
    );
    window.fetchMock.post(
      'http://symbol.server/symbolicate/v5',
      new Response(symbolsJson as any)
    );

    const options: CliOptions = {
      input: {
        type: 'HASH',
        hash,
      },
      output: '',
      symbolicateWithServer: 'http://symbol.server',
    };

    const result = await runToTempFileAndReturnOutput(options);

    expect(console.warn).not.toHaveBeenCalled();
    expect(result).toMatchSnapshot();
  });
});
