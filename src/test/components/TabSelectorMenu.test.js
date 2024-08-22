/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TabSelectorMenu } from 'firefox-profiler/components/shared/TabSelectorMenu';
import { addActiveTabInformationToProfile } from '../fixtures/profiles/processed-profile';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';

describe('app/TabSelectorMenu', () => {
  function setup() {
    const { profile, ...extraPageData } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );

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
});
