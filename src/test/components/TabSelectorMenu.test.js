/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TabSelectorMenu } from 'firefox-profiler/components/shared/TabSelectorMenu';
import { addActiveTabInformationToProfile } from '../fixtures/profiles/processed-profile';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick } from '../fixtures/utils';
import { getTabFilter } from '../../selectors/url-state';

describe('app/TabSelectorMenu', () => {
  function setup() {
    const { profile, ...extraPageData } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );

    // Add some frames with innerWindowIDs now. Note that we only expand the
    // innerWindowID array and not the others as we don't check them at all.
    //
    // Thread 0 will be present in firstTabTabID.
    // Thread 1 be present in secondTabTabID.
    profile.threads[0].frameTable.innerWindowID[0] =
      extraPageData.parentInnerWindowIDsWithChildren;
    profile.threads[0].frameTable.length++;

    profile.threads[1].frameTable.innerWindowID[0] =
      extraPageData.secondTabInnerWindowIDs[0];
    profile.threads[1].frameTable.length++;

    const store = storeWithProfile(profile);
    const renderResults = render(
      <Provider store={store}>
        <TabSelectorMenu />
      </Provider>
    );

    return {
      profile,
      ...renderResults,
      ...extraPageData,
      ...store,
    };
  }

  it('should render properly', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('should not render when the profile does not contain any page data', () => {
    const store = storeWithProfile(getProfileWithNiceTracks());
    const { container } = render(
      <Provider store={store}>
        <TabSelectorMenu />
      </Provider>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('should switch tabs properly', () => {
    const { getState, getByText, firstTabTabID, secondTabTabID } = setup();

    // Check that there is no tab filter at first.
    expect(getTabFilter(getState())).toBe(null);

    // Change the tab filter by clicking on the menu item.
    const mozillaTab = getByText('mozilla.org');
    fireFullClick(mozillaTab);

    // Check the tab filter again, it should match the first tab in the profile.
    expect(getTabFilter(getState())).toBe(firstTabTabID);

    // Change the tab filter again.
    const profilerTab = getByText('profiler.firefox.com');
    fireFullClick(profilerTab);

    // Check the tab filter again, it should match the second tab in the profile.
    expect(getTabFilter(getState())).toBe(secondTabTabID);

    // Change the tab filter to all tabs and windows
    const allTabs = getByText('All tabs and windows');
    fireFullClick(allTabs);

    // Check the tab filter again, it should be null, meaning all tabs and windows.
    expect(getTabFilter(getState())).toBe(null);
  });

  it('should display the relevant threads after tab switch', () => {
    const { getState, getByText, firstTabTabID, secondTabTabID } = setup();

    // Check that there is no tab filter at first.
    expect(getTabFilter(getState())).toBe(null);
    // Also make sure that we have all the threads currently.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    // Change the tab filter by clicking on the menu item.
    const profilerTab = getByText('profiler.firefox.com');
    fireFullClick(profilerTab);

    // Check the tab filter again, it should match the second tab in the profile.
    expect(getTabFilter(getState())).toBe(secondTabTabID);
    // Make sure that the second process group is visible.
    // Note that the first thread will be visible too, because it's the parent
    // process which we always include.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    // Change the tab filter again.
    const mozillaTab = getByText('mozilla.org');
    fireFullClick(mozillaTab);

    // Check the tab filter again, it should match the first tab in the profile.
    expect(getTabFilter(getState())).toBe(firstTabTabID);
    // Also make sure that the first process is visible.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
    ]);

    // Change the tab filter to all tabs and windows.
    const allTabs = getByText('All tabs and windows');
    fireFullClick(allTabs);

    // Check the tab filter again, it should be null, meaning full profile.
    expect(getTabFilter(getState())).toBe(null);
    // It should show the full thread list again.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);
  });
});
