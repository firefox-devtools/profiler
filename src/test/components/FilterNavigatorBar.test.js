/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { ProfileFilterNavigator } from '../../components/app/ProfileFilterNavigator';
import * as ProfileView from '../../actions/profile-view';
import * as ReceiveProfile from '../../actions/receive-profile';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('app/ProfileFilterNavigator', () => {
  const browsingContextID = 123123;
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
      `);
    // Add page for active tab.
    profile.pages = [
      {
        browsingContextID: browsingContextID,
        innerWindowID: 1,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
    ];
    profile.meta.configuration = {
      threads: [],
      features: [],
      capacity: 1000000,
      activeBrowsingContextID: browsingContextID,
    };

    // Change the root range for testing.
    const samples = profile.threads[0].samples;
    samples.time[samples.length - 1] = 50;

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileFilterNavigator />
      </Provider>
    );

    return {
      ...store,
      ...renderResult,
    };
  }

  it('renders ProfileFilterNavigator properly', () => {
    const { container, dispatch } = setup();
    // Just root range
    expect(container.firstChild).toMatchSnapshot();

    // With committed range
    dispatch(ProfileView.commitRange(0, 40));
    expect(container.firstChild).toMatchSnapshot();

    // With preview selection
    dispatch(
      ProfileView.updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 10,
        selectionEnd: 10.1,
      })
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the "Full Range" text as its first element', () => {
    const { getByText } = setup();
    expect(getByText('Full Range')).toBeTruthy();
  });

  it('renders the site hostname as its first element in the single tab view', () => {
    const { dispatch, container } = setup();
    dispatch(
      ReceiveProfile.changeTimelineTrackOrganization({
        type: 'active-tab',
        browsingContextID,
      })
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the site hostname as its first element in the single tab view', () => {
    const { dispatch, queryByText, getByText } = setup();
    dispatch(
      ReceiveProfile.changeTimelineTrackOrganization({
        type: 'active-tab',
        browsingContextID,
      })
    );
    expect(queryByText('Full Range')).toBeFalsy();
    // Using regexp because searching for a partial text.
    expect(getByText(/developer\.mozilla\.org/)).toBeTruthy();
  });
});
