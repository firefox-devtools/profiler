/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import ProfileCallTreeView from '../../components/calltree/ProfileCallTreeView';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileForInvertedCallTree,
  getProfileForUnfilteredCallTree,
} from '../fixtures/profiles/profiles-for-call-trees';
import { changeCallTreeSearchString } from '../../actions/profile-view';

describe('calltree/ProfileCallTreeView', function() {
  it('renders an unfiltered call tree', () => {
    const calltree = renderer.create(
      <Provider store={storeWithProfile(getProfileForUnfilteredCallTree())}>
        <ProfileCallTreeView />
      </Provider>,
      { createNodeMock }
    );

    expect(calltree.toJSON()).toMatchSnapshot();
  });

  it('renders an inverted call tree', () => {
    const calltree = renderer.create(
      <Provider store={storeWithProfile(getProfileForInvertedCallTree())}>
        <ProfileCallTreeView />
      </Provider>,
      { createNodeMock }
    );

    expect(calltree.toJSON()).toMatchSnapshot();
  });

  it('renders call tree with a search string', () => {
    const store = storeWithProfile(getProfileForUnfilteredCallTree());
    store.dispatch(changeCallTreeSearchString('H'));
    const calltree = renderer.create(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>,
      { createNodeMock }
    );

    expect(calltree.toJSON()).toMatchSnapshot();
  });
});

/**
 * Mock out any created refs for the call tree components with relevant information.
 */
function createNodeMock(element) {
  const classNameParts = element.props.className.split(' ');
  if (
    // <VirtualList />
    classNameParts.includes('treeViewBody') ||
    // <VirtualListInner />
    classNameParts.includes('treeViewBodyInner')
  ) {
    return {
      addEventListener: () => {},
      // Set an arbitrary size that will not kick in any virtualization behavior.
      getBoundingClientRect: () => _getBoundingBox(2000, 1000),
      focus: () => {},
    };
  }
  return null;
}

function _getBoundingBox(width, height) {
  return {
    width,
    height,
    left: 0,
    x: 0,
    top: 0,
    y: 0,
    right: width,
    bottom: height,
  };
}
