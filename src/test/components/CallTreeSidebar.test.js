/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from 'react-testing-library';

import CallTreeSidebar from '../../components/sidebar/CallTreeSidebar';
import {
  changeSelectedCallNode,
  changeInvertCallstack,
} from '../../actions/profile-view';
import { ensureExists } from '../../utils/flow';

import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import type { CallNodePath } from '../../types/profile-derived';

describe('CallTreeSidebar', function() {
  function setup() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A    A    A              A
      B    B    B              B
      Cjs  Cjs  H[cat:Layout]  H[cat:Layout]
      D    F    I[cat:Idle]
      Ejs  Ejs
    `);

    const store = storeWithProfile(profile);

    const selectNode = (nodePath: CallNodePath) => {
      store.dispatch(changeSelectedCallNode(0, nodePath));
    };

    const invertCallstack = () => store.dispatch(changeInvertCallstack(true));

    const renderResult = render(
      <Provider store={store}>
        <CallTreeSidebar />
      </Provider>
    );
    return {
      ...renderResult,
      store,
      funcNamesDict: funcNamesDictPerThread[0],
      selectNode,
      invertCallstack,
    };
  }

  it('matches the snapshots when displaying data about the currently selected node', () => {
    const {
      selectNode,
      funcNamesDict: { A, B, Cjs, D, H, Ejs },
      container,
    } = setup();

    expect(container.firstChild).toMatchSnapshot();

    // Cjs is a JS node, but has no self time, so we shouldn't see the
    // implementation information.
    selectNode([A, B, Cjs]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, Cjs, D]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, H]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, Cjs, D, Ejs]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshots when displaying data about the currently selected node in an inverted tree', () => {
    const {
      selectNode,
      invertCallstack,
      funcNamesDict: { A, B, H, Ejs, I },
      container,
    } = setup();

    invertCallstack();
    expect(container.firstChild).toMatchSnapshot();

    selectNode([Ejs]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([H]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([I, H]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([H, B, A]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('rounds properly the displayed values', () => {
    const itemsCount = 25;
    const interval = 0.7;

    const profileString = Array(itemsCount)
      .fill('A')
      .join('  ');

    const {
      profile,
      funcNamesDictPerThread: [{ A }],
    } = getProfileFromTextSamples(profileString);
    // This is lazy but this works good enough for what we're doing here.
    profile.meta.interval = interval;

    const store = storeWithProfile(profile);

    const { getByText } = render(
      <Provider store={store}>
        <CallTreeSidebar />
      </Provider>
    );

    store.dispatch(changeSelectedCallNode(0, [A]));

    const categoryLabel = getByText(/Other/);
    const categoryValue = ensureExists(categoryLabel.nextElementSibling);
    expect(categoryValue.textContent).toEqual('17.5ms (100%)');
  });
});
