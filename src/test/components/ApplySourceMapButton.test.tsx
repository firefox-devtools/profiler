/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { ApplySourceMapButton } from 'firefox-profiler/components/app/MenuButtons/ApplySourceMapButton';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';

import type { Profile } from 'firefox-profiler/types';
import type { EligibleSource } from 'firefox-profiler/profile-logic/source-map-matching';

// Keep the rest of the module real (receive-profile imports
// doSourceMapSymbolication from here), but stub the action creator so we can
// assert the component wiring without spinning up the worker.
jest.mock('firefox-profiler/actions/source-map-symbolication', () => ({
  ...jest.requireActual('firefox-profiler/actions/source-map-symbolication'),
  applySourceMapFile: jest.fn(),
}));
import { applySourceMapFile } from 'firefox-profiler/actions/source-map-symbolication';

type SourceDescriptor = { filename: string; sourceMapURL: string };

// Build a profile with one JS source per descriptor, each carrying a
// sourceMapURL so it becomes a candidate for file-based symbolication.
function buildProfileWithSources(descs: SourceDescriptor[]): Profile {
  const textSamples = descs.map(
    (d, i) => `${String.fromCharCode(65 + i)}js[file:${d.filename}]`
  );
  const { profile } = getProfileFromTextSamples(...textSamples);
  const { sources, stringArray } = profile.shared;
  for (const d of descs) {
    const filenameStrIdx = stringArray.indexOf(d.filename);
    const sourceIndex = sources.filename.findIndex((f) => f === filenameStrIdx);
    const urlIdx = stringArray.length;
    stringArray.push(d.sourceMapURL);
    sources.sourceMapURL[sourceIndex] = urlIdx;
  }
  return profile;
}

function sourceIndexOf(profile: Profile, filename: string): number {
  const { sources, stringArray } = profile.shared;
  const strIdx = stringArray.indexOf(filename);
  return sources.filename.findIndex((f) => f === strIdx);
}

// A fileReader stub matching the shape returned by receive-profile's
// _fileReader, resolving asText() to the given contents.
function makeFileReader(text: string) {
  return (_file: File) => ({
    asText: () => Promise.resolve(text),
    asArrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

function selectFile(fileName: string) {
  const input = document.querySelector(
    '.metaInfoSourceMapFileInput'
  ) as HTMLInputElement;
  const file = new File(['ignored'], fileName, { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ApplySourceMapButton', function () {
  const mockedApply = applySourceMapFile as jest.Mock;

  beforeEach(() => {
    mockedApply.mockReset();
    // The action returns a thunk; default it to a successful apply.
    mockedApply.mockReturnValue(() =>
      Promise.resolve({ type: 'applied', filename: 'app.min.js' })
    );
  });

  function setup(descs: SourceDescriptor[], fileText: string = '{}') {
    const profile = buildProfileWithSources(descs);
    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <ApplySourceMapButton fileReader={makeFileReader(fileText) as any} />
      </Provider>
    );
    return { profile };
  }

  it('renders nothing when no source has a source map', function () {
    const { profile } = getProfileFromTextSamples('Ajs[file:bundle.js]');
    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <ApplySourceMapButton />
      </Provider>
    );
    expect(screen.queryByText(/Apply source map/)).not.toBeInTheDocument();
  });

  it('renders the button when a source has a source map', function () {
    setup([{ filename: 'app.min.js', sourceMapURL: 'app.min.js.map' }]);
    expect(screen.getByText(/Apply source map/)).toBeInTheDocument();
  });

  it('shows a success message when symbolication applies results', async function () {
    const { profile } = setup([
      { filename: 'app.min.js', sourceMapURL: 'app.min.js.map' },
    ]);

    selectFile('app.min.js.map');

    // Fluent wraps the interpolated filename in bidi isolation marks, so match
    // the phrase with a regex and check the filename via textContent.
    const status = await screen.findByText(/Original sources resolved for/);
    expect(status).toHaveTextContent('app.min.js');
    expect(mockedApply).toHaveBeenCalledTimes(1);
    // (fileName, fileContents, sourceIndex?) — auto-match leaves sourceIndex
    // undefined; the thunk resolves it.
    expect(mockedApply.mock.calls[0][0]).toBe('app.min.js.map');
    expect(mockedApply.mock.calls[0][2]).toBeUndefined();
    // The connected component still holds a real profile with the source.
    expect(sourceIndexOf(profile, 'app.min.js')).toBeGreaterThanOrEqual(0);
  });

  it('reports when the map matched nothing', async function () {
    mockedApply.mockReturnValue(() =>
      Promise.resolve({ type: 'no-match', filename: 'app.min.js' })
    );
    setup([{ filename: 'app.min.js', sourceMapURL: 'app.min.js.map' }]);

    selectFile('app.min.js.map');

    const status = await screen.findByText(/matched this source map/);
    expect(status).toHaveTextContent('app.min.js');
  });

  it('shows a select picker on ambiguity, then symbolicates the chosen source', async function () {
    const { profile } = setup([
      { filename: 'app.min.js', sourceMapURL: 'app.min.js.map' },
      { filename: 'vendor.min.js', sourceMapURL: 'vendor.min.js.map' },
    ]);
    const appIndex = sourceIndexOf(profile, 'app.min.js');
    const vendorIndex = sourceIndexOf(profile, 'vendor.min.js');
    const candidates: EligibleSource[] = [
      {
        sourceIndex: appIndex,
        filename: 'app.min.js',
        sourceMapURL: 'app.min.js.map',
      },
      {
        sourceIndex: vendorIndex,
        filename: 'vendor.min.js',
        sourceMapURL: 'vendor.min.js.map',
      },
    ];
    mockedApply.mockReturnValueOnce(() =>
      Promise.resolve({ type: 'ambiguous', candidates })
    );
    mockedApply.mockReturnValueOnce(() =>
      Promise.resolve({ type: 'applied', filename: 'vendor.min.js' })
    );

    selectFile('unrelated-name.map');

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    expect(mockedApply).toHaveBeenCalledTimes(1);

    fireEvent.change(select, { target: { value: String(vendorIndex) } });
    fireEvent.click(screen.getByText('Apply'));

    const status = await screen.findByText(/Original sources resolved for/);
    expect(status).toHaveTextContent('vendor.min.js');
    expect(mockedApply).toHaveBeenCalledTimes(2);
    expect(mockedApply.mock.calls[1][2]).toBe(vendorIndex);
  });

  it('lets the user cancel the source picker', async function () {
    const { profile } = setup([
      { filename: 'app.min.js', sourceMapURL: 'app.min.js.map' },
      { filename: 'vendor.min.js', sourceMapURL: 'vendor.min.js.map' },
    ]);
    mockedApply.mockReturnValueOnce(() =>
      Promise.resolve({
        type: 'ambiguous',
        candidates: [
          {
            sourceIndex: sourceIndexOf(profile, 'app.min.js'),
            filename: 'app.min.js',
            sourceMapURL: 'app.min.js.map',
          },
          {
            sourceIndex: sourceIndexOf(profile, 'vendor.min.js'),
            filename: 'vendor.min.js',
            sourceMapURL: 'vendor.min.js.map',
          },
        ],
      })
    );

    selectFile('unrelated-name.map');

    fireEvent.click(await screen.findByText('Cancel'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('reports a parse error for an invalid source map file', async function () {
    mockedApply.mockReturnValue(() =>
      Promise.resolve({ type: 'error', error: 'invalid-source-map' })
    );
    setup([{ filename: 'app.min.js', sourceMapURL: 'app.min.js.map' }]);

    selectFile('app.min.js.map');

    expect(
      await screen.findByText(/not a valid source map/)
    ).toBeInTheDocument();
  });
});
