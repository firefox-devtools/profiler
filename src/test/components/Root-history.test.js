/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { render } from '@testing-library/react';

import { Root } from '../../components/app/Root';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getProfileUrlForHash } from '../../actions/receive-profile';
import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { autoMockFullNavigation } from '../fixtures/mocks/window-navigation';
import { coerceMatchingShape } from '../../utils/flow';
import { makeProfileSerializable } from '../../profile-logic/process-profile';

import type { SerializableProfile } from 'firefox-profiler/types';

// ListOfPublishedProfiles depends on IDB and renders asynchronously, so we'll
// just test we want to render it, but otherwise test it more fully in a
// separate test file.
jest.mock('../../components/app/ListOfPublishedProfiles', () => ({
  ListOfPublishedProfiles: 'list-of-published-profiles',
}));

describe('Root with history', function() {
  type TestConfig = {|
    profileHash?: string,
  |};

  autoMockFullNavigation();

  function setup(config: TestConfig) {
    const { profileHash } = config;

    // This test is driven primarily by the URL. Decide how to load things.
    if (profileHash) {
      // Load by URL, with a profile hash. This replaces the initial URL as
      // configured by the navigation automocking.
      window.location.replace(
        `https://profiler.firefox.com/public/${profileHash}`
      );

      // Ensure this is a properly serialized profile.
      const profile = makeProfileSerializable(
        getProfileFromTextSamples('A  B  C  D  E').profile
      );
      mockFetchProfileAtUrl(getProfileUrlForHash('FAKEHASH'), profile);
    } else {
      throw new Error(
        'TODO - These tests need to add other views, which will not need the ' +
          'profile hash. This is needed to complete #1789.'
      );
    }

    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    const store = blankStore();
    const renderResult = render(<Root store={store} />);

    const { findByText } = renderResult;

    async function waitForTab({
      name,
      selected,
    }: {|
      +name: string,
      +selected: boolean,
    |}): Promise<HTMLElement> {
      // This uses `findByText` instead of `findbyRole` because this is a lot
      // faster in our use case where there's a lot of DOM nodes.
      return findByText(name, {
        selector: `button[role~=tab][aria-selected=${String(selected)}]`,
      });
    }

    return {
      ...renderResult,
      ...store,
      waitForTab,
    };
  }

  afterEach(() => {
    delete window.fetch;
  });

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
