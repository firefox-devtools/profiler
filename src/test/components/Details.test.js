/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { shallowWithStore } from '../fixtures/enzyme';

import Details from '../../components/app/Details';
import { changeSelectedTab, changeSidebarOpenState } from '../../actions/app';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

import { tabSlugs } from '../../app-logic/tabs-handling';
import type { TabSlug } from '../../app-logic/tabs-handling';

describe('app/Details', function() {
  const { profile } = getProfileFromTextSamples(`
    A A A
    B B B
    C C H
    D F I
    E E
  `);

  it('renders an initial view with the right panel', () => {
    const store = storeWithProfile(profile);
    // dive() will shallow-render the wrapped component
    const view = shallowWithStore(<Details />, store);
    expect(view.dive()).toMatchSnapshot();
  });

  tabSlugs.forEach((tabSlug: TabSlug) => {
    it(`renders an initial view with the right panel for tab ${tabSlug}`, () => {
      const store = storeWithProfile(profile);
      store.dispatch(changeSelectedTab(tabSlug));

      const view = shallowWithStore(<Details />, store);
      expect(view.dive()).toMatchSnapshot();
    });
  });

  it('show the correct state for the sidebar open button', function() {
    const store = storeWithProfile(profile);
    const view = shallowWithStore(<Details />, store);
    expect(view.dive()).toMatchSnapshot();
    store.dispatch(changeSidebarOpenState('calltree', true));
    expect(view.dive()).toMatchSnapshot();
    store.dispatch(changeSelectedTab('flame-graph'));
    expect(view.dive()).toMatchSnapshot();
    store.dispatch(changeSidebarOpenState('calltree', false));
    store.dispatch(changeSelectedTab('calltree'));
    expect(view.dive()).toMatchSnapshot();
  });
});
