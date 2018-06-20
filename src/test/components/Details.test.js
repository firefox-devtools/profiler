/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { shallowWithStore } from '../fixtures/enzyme';

import Details from '../../components/app/Details';
import { changeSelectedTab } from '../../actions/app';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

import type { TabSlug } from '../../types/actions';

describe('app/DetailsContainer', function() {
  const { profile } = getProfileFromTextSamples(`
    A A A
    B B B
    C C H
    D F I
    E E
  `);

  const tabSlugs: TabSlug[] = [
    'stack-chart',
    'marker-chart',
    'flame-graph',
    'marker-table',
    'calltree', // 'calltree' not first on purpose
  ];

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
});
