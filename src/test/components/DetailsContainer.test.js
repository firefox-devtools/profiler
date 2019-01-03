/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { shallowWithStore } from '../fixtures/enzyme';

import DetailsContainer from '../../components/app/DetailsContainer';
import { changeSelectedTab, changeSidebarOpenState } from '../../actions/app';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import { tabSlugs } from '../../app-logic/tabs-handling';
import type { TabSlug } from '../../app-logic/tabs-handling';

describe('app/DetailsContainer', function() {
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E E
    `);

    const store = storeWithProfile(profile);
    // Make sure the sidebar is visible in all tabs
    tabSlugs.forEach(tabSlug =>
      store.dispatch(changeSidebarOpenState(tabSlug, true))
    );
    return { store };
  }

  it('renders an initial view with or without a sidebar', () => {
    const { store } = setup();
    // dive() will shallow-render the wrapped component
    const view = shallowWithStore(<DetailsContainer />, store);
    expect(view.dive()).toMatchSnapshot();
  });

  tabSlugs.forEach((tabSlug: TabSlug) => {
    it(`renders an initial view with or without a sidebar for tab ${tabSlug}`, () => {
      const { store } = setup();
      store.dispatch(changeSelectedTab(tabSlug));

      const view = shallowWithStore(<DetailsContainer />, store);
      expect(view.dive()).toMatchSnapshot();
    });
  });
});
