/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { Details } from '../../components/app/Details';
import { changeSelectedTab, changeSidebarOpenState } from '../../actions/app';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import { tabSlugs } from '../../app-logic/tabs-handling';
import type { TabSlug } from '../../app-logic/tabs-handling';

// Let's mock all possible views so that we don't spend too much time rendering stuff.
// We use the tab slugs as class names. `call-tree` is an exception because if
// we need a dash to masquerade as custom elements so that React doesn't emit a
// warning.
jest.mock('../../components/calltree/ProfileCallTreeView', () => ({
  ProfileCallTreeView: 'call-tree',
}));
jest.mock('../../components/flame-graph', () => ({
  FlameGraph: 'flame-graph',
}));
jest.mock('../../components/stack-chart', () => ({
  StackChart: 'stack-chart',
}));
jest.mock('../../components/marker-chart', () => ({
  MarkerChart: 'marker-chart',
}));
jest.mock('../../components/marker-table', () => ({
  MarkerTable: 'marker-table',
}));
jest.mock('../../components/network-chart', () => ({
  NetworkChart: 'network-chart',
}));
jest.mock('../../components/js-tracer', () => ({
  JsTracer: 'js-tracer',
}));

describe('app/Details', function () {
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  E
    `);

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <Details />
      </Provider>
    );

    return { ...renderResult, store };
  }

  it('renders an initial view with the right panel', () => {
    const { container } = setup();
    expect(container.querySelector('call-tree')).toBeTruthy();
  });

  tabSlugs.forEach((tabSlug: TabSlug) => {
    it(`renders an initial view with the right panel for tab ${tabSlug}`, () => {
      const { container, store } = setup();
      act(() => {
        store.dispatch(changeSelectedTab(tabSlug));
      });
      // The call tree has a special handling, see the comment above for more information.
      const expectedCustomName = tabSlug === 'calltree' ? 'call-tree' : tabSlug;
      expect(container.querySelector(expectedCustomName)).toBeTruthy();
    });
  });

  it('show the correct state for the sidebar open button', function () {
    const { store, getByTitle } = setup();
    expect(getByTitle(/sidebar/i)).toMatchSnapshot();
    act(() => {
      store.dispatch(changeSidebarOpenState('calltree', false));
    });
    expect(getByTitle(/sidebar/i)).toMatchSnapshot();
    act(() => {
      store.dispatch(changeSelectedTab('flame-graph'));
    });
    expect(getByTitle(/sidebar/i)).toMatchSnapshot();
    act(() => {
      store.dispatch(changeSidebarOpenState('calltree', false));
    });
    act(() => {
      store.dispatch(changeSelectedTab('calltree'));
    });
    expect(getByTitle(/sidebar/i)).toMatchSnapshot();
  });
});
