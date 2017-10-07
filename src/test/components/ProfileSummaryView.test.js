/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import ProfileSummaryView from '../../components/summary/ProfileSummaryView';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { summarizeProfile } from '../../profile-logic/summarize-profile';
import { profileSummaryProcessed } from '../../actions/profile-summary';

it('renders ProfileSummaryView correctly', () => {
  /**
   * Mock out any created refs for the components with relevant information.
   */
  function createNodeMock(element) {
    if (element.type === 'div') {
      return {
        offsetWidth: 400,
      };
    }
    return null;
  }

  /* Here we're only interested in the leaf nodes and thus put all
   * samples on the first line.  The samples chosen belong to known
   * categories. */
  const { profile } = getProfileFromTextSamples(`
    pthread_mutex_lock js::RunScript pthread_mutex_lock nsHTMLDNS mozilla::dom::
  `);

  const store = storeWithProfile(profile);
  store.dispatch(profileSummaryProcessed(summarizeProfile(profile)));

  const profileSummary = renderer.create(
    <Provider store={store}>
      <ProfileSummaryView />
    </Provider>,
    { createNodeMock }
  );

  expect(profileSummary.toJSON()).toMatchSnapshot();
});
