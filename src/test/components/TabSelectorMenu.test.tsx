/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';
import { screen } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TabSelectorMenu } from 'firefox-profiler/components/shared/TabSelectorMenu';
import { addTabInformationToProfile } from '../fixtures/profiles/processed-profile';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick } from '../fixtures/utils';
import { getTabFilter } from '../../selectors/url-state';
import { ensureExists } from 'firefox-profiler/utils/types';
import { removeURLs } from 'firefox-profiler/utils/string';

describe('app/TabSelectorMenu', () => {
  function setup() {
    const { profile, ...extraPageData } = addTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    ensureExists(profile.pages)[3].favicon =
      'data:image/png;base64,test-png-favicon-data-for-profiler.firefox.com';

    // This is needed for the thread activity score calculation.
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'ns',
    };

    // Add some frames with innerWindowIDs now. Note that we only expand the
    // innerWindowID array and not the others as we don't check them at all.
    //
    // Thread 0 will be present in firstTabTabID.
    // Thread 1 be present in secondTabTabID.
    profile.threads[0].frameTable.innerWindowID[0] =
      extraPageData.parentInnerWindowIDsWithChildren;
    profile.threads[0].frameTable.length++;
    profile.threads[0].usedInnerWindowIDs = [
      extraPageData.parentInnerWindowIDsWithChildren,
    ];

    // Add a threadCPUDelta value for thread activity score.
    profile.threads[0].samples.threadCPUDelta = [1];

    profile.threads[1].frameTable.innerWindowID[0] =
      extraPageData.secondTabInnerWindowIDs[0];
    profile.threads[1].frameTable.length++;
    profile.threads[1].usedInnerWindowIDs = [
      extraPageData.secondTabInnerWindowIDs[0],
    ];
    // Add a threadCPUDelta value for thread activity score. This thread
    // should stay above the first thread.
    profile.threads[0].samples.threadCPUDelta = [2];

    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <TabSelectorMenu />
      </Provider>
    );

    return {
      profile,
      ...extraPageData,
      ...store,
    };
  }

  it('should render properly', () => {
    setup();
    expect(document.body).toMatchSnapshot();
  });

  it('should not render when the profile does not contain any page data', () => {
    const store = storeWithProfile(getProfileWithNiceTracks());
    render(
      <Provider store={store}>
        <TabSelectorMenu />
      </Provider>
    );
    expect(document.body).toMatchSnapshot();
  });

  it('should switch tabs properly', () => {
    const { getState, firstTabTabID, secondTabTabID } = setup();

    // Check that there is no tab filter at first.
    expect(getTabFilter(getState())).toBe(null);

    // Change the tab filter by clicking on the menu item.
    const mozillaTab = screen.getByText('mozilla.org');
    fireFullClick(mozillaTab);

    // Check the tab filter again, it should match the first tab in the profile.
    expect(getTabFilter(getState())).toBe(firstTabTabID);

    // Change the tab filter again.
    const profilerTab = screen.getByText('profiler.firefox.com');
    fireFullClick(profilerTab);

    // Check the tab filter again, it should match the second tab in the profile.
    expect(getTabFilter(getState())).toBe(secondTabTabID);

    // Change the tab filter to all tabs and windows
    const allTabs = screen.getByText('All tabs and windows');
    fireFullClick(allTabs);

    // Check the tab filter again, it should be null, meaning all tabs and windows.
    expect(getTabFilter(getState())).toBe(null);
  });

  it('should display the relevant threads after tab switch', () => {
    const { getState, firstTabTabID, secondTabTabID } = setup();

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
    const profilerTab = screen.getByText('profiler.firefox.com');
    fireFullClick(profilerTab);

    // Check the tab filter again, it should match the second tab in the profile.
    expect(getTabFilter(getState())).toBe(secondTabTabID);
    // Make sure that the second process group is visible.
    // Note that the first thread will be visible too, because it's the parent
    // process which we always include.
    expect(getHumanReadableTracks(getState())).toEqual([
      'hide [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    // Change the tab filter again.
    const mozillaTab = screen.getByText('mozilla.org');
    fireFullClick(mozillaTab);

    // Check the tab filter again, it should match the first tab in the profile.
    expect(getTabFilter(getState())).toBe(firstTabTabID);
    // Also make sure that the first process is visible.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
    ]);

    // Change the tab filter to all tabs and windows.
    const allTabs = screen.getByText('All tabs and windows');
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

  it('should sort the tabs by their activity scores', () => {
    setup();

    const profilerTab = screen.getByText('profiler.firefox.com');
    const mozillaTab = screen.getByText('mozilla.org');

    // Make sure that profiler tab comes before the mozilla tab.
    expect(profilerTab.compareDocumentPosition(mozillaTab)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('should render sanitized page urls correctly', () => {
    const { profile, ...extraPageData } = addTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    // This is needed for the thread activity score calculation.
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'ns',
    };

    // Add a webextension url to test it.
    ensureExists(profile.pages)[4].url =
      'moz-extension://259ec0ce-9df7-8e4a-ad30-3b67bed900f3/';

    // Sanitize the page urls.
    profile.pages = ensureExists(profile.pages).map((page, index) => ({
      ...page,
      url: removeURLs(page.url, `<Page #${index}>`),
    }));

    // Attach innerWindowIDs to the samples.
    profile.threads[0].frameTable.innerWindowID[0] =
      extraPageData.parentInnerWindowIDsWithChildren;
    profile.threads[0].frameTable.length++;
    profile.threads[0].frameTable.innerWindowID[1] =
      extraPageData.secondTabInnerWindowIDs[0];
    profile.threads[0].frameTable.length++;
    profile.threads[0].usedInnerWindowIDs = [
      extraPageData.parentInnerWindowIDsWithChildren,
      extraPageData.secondTabInnerWindowIDs[0],
    ];

    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <TabSelectorMenu />
      </Provider>
    );

    // Make sure that sanitized https and moz-extension urls are still visible.
    expect(screen.getByText('https://', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText('moz-extension://', { exact: false })
    ).toBeInTheDocument();
    expect(document.body).toMatchSnapshot();
  });
});
