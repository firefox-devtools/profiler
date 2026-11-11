/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  MAX_COMMAND_OUTPUT_LENGTH,
  runProfilerCliCommand,
  tokenizeCommandLine,
} from 'firefox-profiler/app-logic/profile-chat/pq-browser-executor';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import {
  getSelectedThreadIndexes,
  getAllCommittedRanges,
} from 'firefox-profiler/selectors/url-state';

describe('tokenizeCommandLine', function () {
  it('splits on whitespace', function () {
    expect(tokenizeCommandLine('  thread   samples --limit 5 ')).toEqual([
      'thread',
      'samples',
      '--limit',
      '5',
    ]);
  });

  it('drops a leading program name', function () {
    expect(tokenizeCommandLine('pq profile info')).toEqual(['profile', 'info']);
    expect(tokenizeCommandLine('profiler-cli profile info')).toEqual([
      'profile',
      'info',
    ]);
  });

  it('handles quotes and escapes', function () {
    expect(
      tokenizeCommandLine(
        `thread markers --search "name:DOM Event" --category 'a "b"' x\\ y ""`
      )
    ).toEqual([
      'thread',
      'markers',
      '--search',
      'name:DOM Event',
      '--category',
      'a "b"',
      'x y',
      '',
    ]);
    expect(tokenizeCommandLine(`a "say \\"hi\\"" 'it\\s'`)).toEqual([
      'a',
      'say "hi"',
      'it\\s',
    ]);
  });

  it('rejects unterminated quotes', function () {
    expect(() => tokenizeCommandLine('thread markers --search "abc')).toThrow(
      'Unterminated " quote'
    );
  });
});

describe('runProfilerCliCommand', function () {
  function setup() {
    const { profile } = getProfileFromTextSamples(
      `
        0         10        20        30
        A         A         A         A
        B         B         B         B
        Cjs       Cjs       Djs       Djs
      `,
      `
        0         10
        X         X
        Y         Z
      `
    );
    profile.threads[0].name = 'GeckoMain';
    profile.threads[1].name = 'Worker';
    return storeWithProfile(profile);
  }

  it('runs profile info', async function () {
    const store = setup();
    const { text, isError } = await runProfilerCliCommand(
      store,
      'profile info'
    );
    expect(isError).toBe(false);
    expect(text).toContain('GeckoMain');
    expect(text).toContain('Worker');
  });

  it('selects a thread in the store and queries it', async function () {
    const store = setup();
    expect(getSelectedThreadIndexes(store.getState())).toEqual(new Set([0]));

    const select = await runProfilerCliCommand(store, 'pq thread select t-1');
    expect(select.isError).toBe(false);
    expect(getSelectedThreadIndexes(store.getState())).toEqual(new Set([1]));

    const samples = await runProfilerCliCommand(store, 'thread samples');
    expect(samples.isError).toBe(false);
    expect(samples.text).toContain('Worker');
    expect(samples.text).toContain('Y');
    expect(samples.text).not.toContain('Cjs');
  });

  it('zooms the committed range in the store', async function () {
    const store = setup();
    const { isError } = await runProfilerCliCommand(store, 'zoom push 0%,50%');
    expect(isError).toBe(false);
    expect(getAllCommittedRanges(store.getState())).toHaveLength(1);
  });

  it('keeps handles stable across calls', async function () {
    const store = setup();
    const functions = await runProfilerCliCommand(
      store,
      'thread functions --search Djs'
    );
    const handle = /f-\d+/.exec(functions.text)?.[0];
    expect(handle).toBeDefined();
    const info = await runProfilerCliCommand(store, `function info ${handle}`);
    expect(info.isError).toBe(false);
    expect(info.text).toContain('Djs');
  });

  it('keeps marker handles when the profile changes', async function () {
    const store = storeWithProfile(
      getProfileWithMarkers([
        ['FirstMarker', 0, 1],
        ['SecondMarker', 2, 3],
      ])
    );
    const markers = await runProfilerCliCommand(store, 'thread markers --list');
    const handle = /m-\d+/.exec(markers.text)?.[0];
    expect(handle).toBeDefined();

    // Replaces the profile object, like the end of symbolication does.
    store.dispatch({ type: 'DONE_SYMBOLICATING' });

    const info = await runProfilerCliCommand(store, `marker info ${handle}`);
    expect(info.isError).toBe(false);
    expect(info.text).toContain('Marker');
  });

  it('supports --json', async function () {
    const store = setup();
    const { text } = await runProfilerCliCommand(store, 'thread info --json');
    expect(JSON.parse(text)).toMatchObject({ type: 'thread-info' });
  });

  it('returns help output without an error', async function () {
    const store = setup();
    const { text, isError } = await runProfilerCliCommand(
      store,
      'thread markers --help'
    );
    expect(isError).toBe(false);
    expect(text).toContain('Usage: profiler-cli thread markers [options]');
    expect(text).toContain('--search <term>');
  });

  it('lists the commands for "help"', async function () {
    const store = setup();
    const { text, isError } = await runProfilerCliCommand(store, 'help');
    expect(isError).toBe(false);
    expect(text).toContain('thread');
    expect(text).toContain('zoom');
  });

  it('leaves out commands that need a file system', async function () {
    const store = setup();
    const save = await runProfilerCliCommand(store, 'profile save /tmp/x');
    expect(save.isError).toBe(true);
    expect(save.text).toContain("unknown command 'save'");

    const apply = await runProfilerCliCommand(store, 'sourcemap apply x.map');
    expect(apply.isError).toBe(true);
  });

  it('reports usage errors', async function () {
    const store = setup();
    expect(await runProfilerCliCommand(store, 'nosuchcommand')).toEqual({
      text: "error: unknown command 'nosuchcommand'",
      isError: true,
    });
    expect(await runProfilerCliCommand(store, 'thread samples --nope')).toEqual(
      {
        text: "error: unknown option '--nope'",
        isError: true,
      }
    );
    expect(
      await runProfilerCliCommand(store, 'thread functions --limit nope')
    ).toEqual({
      text: 'Error: --limit must be a non-negative integer (0 = no limit)',
      isError: true,
    });
    expect(await runProfilerCliCommand(store, 'thread search "x')).toEqual({
      text: 'Error: Unterminated " quote in: thread search "x',
      isError: true,
    });
  });

  it('reports query errors', async function () {
    const store = setup();
    const { text, isError } = await runProfilerCliCommand(
      store,
      'thread select t-99'
    );
    expect(isError).toBe(true);
    expect(text).toMatch(/^Error: .*t-99/);
  });

  it('truncates long output', async function () {
    const funcNames = Array.from(
      { length: 2000 },
      (_, i) => `aVeryLongFunctionNameNumber${i}`
    );
    // Columns are found from the first line, so pad every name to one width.
    const { profile } = getProfileFromTextSamples(
      funcNames.map((name) => name.padEnd(40)).join('')
    );
    const store = storeWithProfile(profile);
    const { text, isError } = await runProfilerCliCommand(
      store,
      'thread functions --limit 0'
    );
    expect(isError).toBe(false);
    expect(text.length).toBeLessThan(MAX_COMMAND_OUTPUT_LENGTH + 200);
    expect(text).toContain('[Output truncated at');
  });
});
