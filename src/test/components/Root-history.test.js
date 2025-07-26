/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import {
  render,
  screen,
  cleanup,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { Root } from '../../components/app/Root';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { fireFullClick } from '../fixtures/utils';
import { getProfileUrlForHash } from '../../actions/receive-profile';
import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  autoMockFullNavigation,
  resetHistoryWithUrl,
} from '../fixtures/mocks/window-navigation';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

import type { Profile } from 'firefox-profiler/types';

// ListOfPublishedProfiles depends on IDB and renders asynchronously, so we'll
// just test we want to render it, but otherwise test it more fully in a
// separate test file.
jest.mock('../../components/app/ListOfPublishedProfiles', () => ({
  ListOfPublishedProfiles: 'list-of-published-profiles',
}));

// AppLocalizationProvider calls a async function in componentDidMount()
// The tests related to it are in separate file.
jest.mock('../../components/app/AppLocalizationProvider', () => ({
  AppLocalizationProvider: ({ children }) => {
    const { L10nContext } = require('firefox-profiler/contexts/L10nContext');
    return (
      <L10nContext.Provider
        value={{
          primaryLocale: null,
          requestL10n: () => {},
        }}
      >
        {children}
      </L10nContext.Provider>
    );
  },
}));

describe('Root with history', function () {
  type TestConfig = {|
    profileHash?: string,
  |};

  autoMockFullNavigation();
  autoMockCanvasContext();
  autoMockIntersectionObserver();

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
      const profile = getProfileFromTextSamples('A  B  C  D  E').profile;
      mockFetchProfileAtUrl(getProfileUrlForHash('FAKEHASH'), profile);
    } else {
      throw new Error(
        'TODO - These tests need to add other views, which will not need the ' +
          'profile hash. This is needed to complete #1789.'
      );
    }

    const store = blankStore();
    render(<Root store={store} />);

    async function waitForTab({
      name,
      selected,
    }: {|
      +name: string,
      +selected: boolean,
    |}): Promise<HTMLElement> {
      // This uses `findByText` instead of `findbyRole` because this is a lot
      // faster in our use case where there's a lot of DOM nodes.
      return screen.findByText(name, {
        selector: `button[role~=tab][aria-selected=${String(selected)}]`,
      });
    }

    // This simulates a page reload, using the current URL.
    function loadPageAgain() {
      cleanup();
      resetHistoryWithUrl();
      const store = blankStore();
      render(<Root store={store} />);
    }

    return {
      waitForTab,
      loadPageAgain,
    };
  }

  it('can view a file from the profile store, use history with it', async function () {
    const { waitForTab } = setup({
      profileHash: 'FAKEHASH',
    });

    expect(window.history.length).toBe(1);

    expect(
      screen.getByText('Downloading and processing the profile…')
    ).toBeInTheDocument();
    expect(screen.queryByText('Call Tree')).not.toBeInTheDocument();

    // Wait until the call tree is visible.
    await waitForTab({ name: 'Call Tree', selected: true });
    await waitForTab({ name: 'Marker Chart', selected: false });

    // History on load starts at 1.
    expect(window.history.length).toBe(1);

    // Going back doesn't do anything.
    act(() => window.history.back());
    expect(window.history.length).toBe(1);

    // Trigger a history event by clicking a tab.
    const markerChart = await waitForTab({
      name: 'Marker Chart',
      selected: false,
    });
    fireFullClick(markerChart);

    await waitForTab({ name: 'Call Tree', selected: false });
    await waitForTab({ name: 'Marker Chart', selected: true });

    expect(window.history.length).toBe(2);

    // Now go back to the call tree.
    act(() => window.history.back());

    await waitForTab({ name: 'Call Tree', selected: true });
    await waitForTab({ name: 'Marker Chart', selected: false });

    // The history will still have the same length, as we haven't overwritten it.
    expect(window.history.length).toBe(2);
  });

  // In the next test, we test that we don't throw.
  // eslint-disable-next-line jest/expect-expect
  it('can work with history after a reload', async function () {
    const { waitForTab, loadPageAgain } = setup({
      profileHash: 'FAKEHASH',
    });

    await waitForTab({ name: 'Call Tree', selected: true });

    // Now we reload the page, wiping the history.
    loadPageAgain();

    // Wait until the call tree is visible.
    await waitForTab({ name: 'Call Tree', selected: true });
    await waitForTab({ name: 'Marker Chart', selected: false });

    // Trigger a history event by clicking a tab.
    const markerChart = await waitForTab({
      name: 'Marker Chart',
      selected: false,
    });
    fireFullClick(markerChart);

    await waitForTab({ name: 'Call Tree', selected: false });
    await waitForTab({ name: 'Marker Chart', selected: true });

    // Now go back to the call tree.
    act(() => window.history.back());

    await waitForTab({ name: 'Call Tree', selected: true });
    await waitForTab({ name: 'Marker Chart', selected: false });
  });

  it('resets the history length between tests', async function () {
    const { waitForTab } = setup({
      profileHash: 'FAKEHASH',
    });
    expect(window.history.length).toBe(1);
    await waitForTab({ name: 'Call Tree', selected: true });
  });
});

function mockFetchProfileAtUrl(url: string, profile: Profile): void {
  window.fetchMock
    .catch(404) // catchall
    .get(url, profile);
}
