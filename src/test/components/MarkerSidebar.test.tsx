/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { MarkerSidebar } from '../../components/sidebar/MarkerSidebar';
import { changeSelectedMarker } from '../../actions/profile-view';

import { storeWithProfile } from '../fixtures/stores';
import { getMarkerTableProfile } from '../fixtures/profiles/processed-profile';

describe('MarkerSidebar', function () {
  function setup() {
    const profile = getMarkerTableProfile();
    const store = storeWithProfile(profile);

    const renderResult = render(
      <Provider store={store}>
        <MarkerSidebar />
      </Provider>
    );
    return {
      ...renderResult,
      ...store,
      profile,
    };
  }

  it('matches the snapshots when displaying data about the currently selected node', () => {
    const { dispatch, profile, container } = setup();

    act(() => {
      dispatch(
        changeSelectedMarker(
          0,
          profile.threads[0].markers.data.findIndex(
            (data) => data && data.type === 'IPC'
          )
        )
      );
    });

    expect(container.firstChild).toMatchSnapshot();
  });
});
