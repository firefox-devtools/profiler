/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import MenuButtons from '../../components/app/MenuButtons';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import {
  startSymbolicating,
  doneSymbolicating,
} from '../../actions/receive-profile';
import { createGeckoProfileWithJsTimings } from '../fixtures/profiles/gecko-profile';
import { processProfile } from '../../profile-logic/process-profile';

describe('app/MenuButtons', function() {
  // profile.meta.networkURLsRemoved flag is set to false as a default.
  it('renders the MenuButtons buttons', () => {
    const store = storeWithProfile();
    store.dispatch(startSymbolicating());

    const { container } = render(
      <Provider store={store}>
        <MenuButtons />
      </Provider>
    );

    // MenuButtons is rendering a fragment with several children. We need to
    // check all children to assess that the component renders properly.
    expect(Array.from(container.children)).toMatchSnapshot();

    store.dispatch(doneSymbolicating());
    expect(Array.from(container.children)).toMatchSnapshot();
  });

  it('renders the MenuButtons buttons with profile.meta.networkURLsRemoved set to true', () => {
    const profile = processProfile(createGeckoProfileWithJsTimings());
    profile.meta.networkURLsRemoved = true;
    const store = storeWithProfile(profile);
    store.dispatch(startSymbolicating());

    const { container } = render(
      <Provider store={store}>
        <MenuButtons />
      </Provider>
    );

    expect(Array.from(container.children)).toMatchSnapshot();

    store.dispatch(doneSymbolicating());
    expect(Array.from(container.children)).toMatchSnapshot();
  });

  it('renders the MenuButtons buttons with profile.meta.networkURLsRemoved set to undefined', () => {
    const profile = processProfile(createGeckoProfileWithJsTimings());
    profile.meta.networkURLsRemoved = undefined;
    const store = storeWithProfile(profile);
    store.dispatch(startSymbolicating());

    const { container } = render(
      <Provider store={store}>
        <MenuButtons />
      </Provider>
    );

    expect(Array.from(container.children)).toMatchSnapshot();

    store.dispatch(doneSymbolicating());
    expect(Array.from(container.children)).toMatchSnapshot();
  });
});
