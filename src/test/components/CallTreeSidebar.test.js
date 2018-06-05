/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import CallTreeSidebar from '../../components/sidebar/CallTreeSidebar';
import { changeSelectedCallNode } from '../../actions/profile-view';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

import type { CallNodePath } from '../../types/profile-derived';

describe('CallTreeSidebar', function() {
  function setup() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  E
    `);

    const store = storeWithProfile(profile);

    const selectNode = (nodePath: CallNodePath) => {
      store.dispatch(changeSelectedCallNode(0, nodePath));
    };

    return { store, funcNamesDict: funcNamesDictPerThread[0], selectNode };
  }

  it('matches the snapshots when displaying data about the currently selected node', () => {
    const { store, selectNode, funcNamesDict: { A, B, C, D, H } } = setup();

    const view = mount(
      <Provider store={store}>
        <CallTreeSidebar />
      </Provider>
    );
    expect(view).toMatchSnapshot();

    selectNode([A, B, C]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([A, B, C, D]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([A, B, H]);
    view.update();
    expect(view).toMatchSnapshot();
  });
});
