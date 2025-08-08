/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { DetailsContainer } from '../../components/app/DetailsContainer';
import { changeSelectedTab, changeSidebarOpenState } from '../../actions/app';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import { tabSlugs } from '../../app-logic/tabs-handling';
import type { TabSlug } from '../../app-logic/tabs-handling';

jest.mock('../../components/app/Details', () => ({
  Details: 'details-viewer',
}));

describe('app/DetailsContainer', function () {
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  E
    `);

    const store = storeWithProfile(profile);
    // Make sure the sidebar is visible in all tabs
    tabSlugs.forEach((tabSlug) =>
      store.dispatch(changeSidebarOpenState(tabSlug, true))
    );
    return { store };
  }

  const expectedSidebar: { [slug in TabSlug]: boolean } = {
    calltree: true,
    'flame-graph': true,
    'stack-chart': false,
    'marker-chart': false,
    'marker-table': true,
    'network-chart': false,
    'js-tracer': false,
  };

  it('renders an initial view with a sidebar', () => {
    const { store } = setup();
    const { container } = render(
      <Provider store={store}>
        <DetailsContainer />
      </Provider>
    );
    expect(container.querySelector('.sidebar')).toBeTruthy();
  });

  tabSlugs.forEach((tabSlug: TabSlug) => {
    const expected = expectedSidebar[tabSlug];

    it(`renders an initial view ${
      expected ? 'with' : 'without'
    } a sidebar for tab ${tabSlug}`, () => {
      const { store } = setup();
      store.dispatch(changeSelectedTab(tabSlug));

      const { container } = render(
        <Provider store={store}>
          <DetailsContainer />
        </Provider>
      );

      expect(!!container.querySelector('.sidebar')).toBe(expected);
    });
  });
});
