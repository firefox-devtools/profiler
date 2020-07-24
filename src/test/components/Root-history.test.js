/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// We want to test these components in isolation and tightly control the actions
// dispatched and avoid any side-effects.  That's why we mock this module and
// return dummy thunk actions that return a Promise.
// jest.mock('../../actions/receive-profile', () => ({
//   // These mocks will get their implementation in the `setup` function.
//   // Otherwise the implementation is wiped before the test starts.
//   // See https://github.com/facebook/jest/issues/7573 for more info.
//   retrieveProfileFromAddon: jest.fn(),
//   retrieveProfileFromStore: jest.fn(),
//   retrieveProfilesToCompare: jest.fn(),
// }));

import * as React from 'react';
import { render } from '@testing-library/react';

import Root from '../../components/app/Root';
import mockCanvasContext from '../fixtures/mocks/canvas-context';

// Because this module is mocked but we want the real actions in the test, we
// use `jest.requireActual` here.
// These functions are mocks
import { getProfileUrlForHash } from '../../actions/receive-profile';

import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { mockWindowLocation } from '../fixtures/mocks/window-location';
import { mockWindowHistory } from '../fixtures/mocks/window-history';
import { coerceMatchingShape } from '../../utils/flow';

import type { SerializableProfile } from 'firefox-profiler/types';
import { makeProfileSerializable } from '../../profile-logic/process-profile';

describe('Root with history', function() {
  // Cleanup the tests through a side-effect.
  let _cleanup;
  afterEach(() => {
    if (!_cleanup) {
      throw new Error('Expected the setup function to create a cleanup step.');
    }
    _cleanup();
  });

  type TestConfig = {|
    profileHash?: string,
  |};

  function setup(config: TestConfig) {
    const { profileHash } = config;

    let resetWindowLocation;
    const resetWindowHistory = mockWindowHistory();

    // This test is driven primarily by the URL. Decide how to load things.
    if (profileHash) {
      // Load by URL, with a profile hash.
      resetWindowLocation = mockWindowLocation(
        `https://profiler.firefox.com/public/${profileHash}`
      );

      // Ensure this is a properly serialized profile.
      const profile = makeProfileSerializable(
        getProfileFromTextSamples('A  B  C  D  E').profile
      );
      mockFetchProfileAtUrl(getProfileUrlForHash('FAKEHASH'), profile);
    } else {
      throw new Error('TODO');
    }

    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    const store = blankStore();
    const renderResult = render(<Root store={store} />);

    _cleanup = () => {
      // Cleanup the mocks.
      resetWindowLocation();
      resetWindowHistory();
      delete window.fetch;
      _cleanup = null;
    };

    const { findByRole } = renderResult;

    async function waitForTab(details: *): Promise<HTMLElement> {
      return findByRole('tab', details);
    }

    return {
      ...renderResult,
      ...store,
      waitForTab,
    };
  }

  it('can view a file from the profile store, use history with it', async function() {
    const { getByText, queryByText, waitForTab } = setup({
      profileHash: 'FAKEHASH',
    });

    expect(window.history.length).toBe(1);

    expect(getByText('Downloading and processing the profile...')).toBeTruthy();
    expect(queryByText('Call Tree')).toBeFalsy();

    await Promise.all((window: any).fetch.mock.results.map(n => n.value));

    // Wait until the call tree is visible.
    await waitForTab({ name: 'Call Tree', selected: true });
    await waitForTab({ name: 'Marker Chart', selected: false });

    // History on load starts at 1.
    expect(window.history.length).toBe(1);

    // Going back doesn't do anything.
    window.history.back();
    expect(window.history.length).toBe(1);

    // Trigger a history event by clicking a tab.
    const markerChart = await waitForTab({
      name: 'Marker Chart',
      selected: false,
    });
    markerChart.click();

    await waitForTab({ name: 'Call Tree', selected: false });
    await waitForTab({ name: 'Marker Chart', selected: true });

    expect(window.history.length).toBe(2);

    // Now go back to the call tree.
    window.history.back();

    await waitForTab({ name: 'Call Tree', selected: true });
    await waitForTab({ name: 'Marker Chart', selected: false });

    // The history will still have the same length, as we haven't overwritten it.
    expect(window.history.length).toBe(2);
  });

  it('resets the history length between tests', async function() {
    setup({
      profileHash: 'FAKEHASH',
    });
    expect(window.history.length).toBe(1);
  });
});

function mockFetchProfileAtUrl(
  url: string,
  profile: SerializableProfile
): void {
  const responses = [];
  const fetch = jest.fn().mockImplementation((fetchUrl: string) => {
    if (fetchUrl === url) {
      const response = coerceMatchingShape<Response>({
        ok: true,
        status: 200,
        headers: coerceMatchingShape<Headers>({
          get: () => 'application/json',
        }),
        json: () => Promise.resolve(profile),
      });
      responses.push(response);
      return Promise.resolve(response);
    }
    return Promise.reject(
      coerceMatchingShape<Response>({
        ok: false,
        status: 404,
        statusText: 'Not found',
      })
    );
  });

  (window: any).fetch = fetch;
}
