/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import Timeline from '../../components/timeline';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { processProfile } from '../../profile-logic/process-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { changeViewAndRecomputeProfileData } from '../../actions/receive-profile';

describe('ActiveTabTimeline', function() {
  const browsingContextID = 123123;

  it('should be rendered properly from the Timeline component', () => {
    const profile = processProfile(createGeckoProfile());
    const store = storeWithProfile(profile);
    store.dispatch(changeViewAndRecomputeProfileData(browsingContextID));

    const { container } = render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
