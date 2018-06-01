/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import CallTreeSidebar from '../../components/sidebar/CallTreeSidebar';
import {
  changeSelectedCallNode,
  changeInvertCallstack,
} from '../../actions/profile-view';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

import type { CallNodePath } from '../../types/profile-derived';

describe('CallTreeSidebar', function() {
  function setup() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A    A    A A
      B    B    B B
      Cjs  Cjs  H H
      D    F    I
      Ejs  Ejs
    `);

    const store = storeWithProfile(profile);

    const selectNode = (nodePath: CallNodePath) => {
      store.dispatch(changeSelectedCallNode(0, nodePath));
    };

    const invertCallstack = () => store.dispatch(changeInvertCallstack(true));

    const view = mount(
      <Provider store={store}>
        <CallTreeSidebar />
      </Provider>
    );
    return {
      store,
      funcNamesDict: funcNamesDictPerThread[0],
      selectNode,
      invertCallstack,
      view,
    };
  }

  it('matches the snapshots when displaying data about the currently selected node', () => {
    const {
      selectNode,
      funcNamesDict: { A, B, Cjs, D, H, Ejs },
      view,
    } = setup();

    expect(view).toMatchSnapshot();

    // Cjs is a JS node, but has no self time, so we shouldn't see the JS engine
    // information.
    selectNode([A, B, Cjs]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([A, B, Cjs, D]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([A, B, H]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([A, B, Cjs, D, Ejs]);
    view.update();
    expect(view).toMatchSnapshot();
  });

  it('matches the snapshots when displaying data about the currently selected node in an inverted tree', () => {
    const {
      selectNode,
      invertCallstack,
      funcNamesDict: { A, B, H, Ejs, I },
      view,
    } = setup();

    invertCallstack();
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([Ejs]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([H]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([I, H]);
    view.update();
    expect(view).toMatchSnapshot();

    selectNode([H, B, A]);
    view.update();
    expect(view).toMatchSnapshot();
  });
});
