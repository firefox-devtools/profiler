/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ProfileCallTreeView from '../../components/calltree/ProfileCallTreeView';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { changeCallTreeSearchString } from '../../actions/profile-view';
import { getBoundingBox } from '../fixtures/utils';

describe('calltree/ProfileCallTreeView', function() {
  const { profile } = getProfileFromTextSamples(`
    A A A
    B B B
    C C H
    D F I
    E G
  `);

  it('renders an unfiltered call tree', () => {
    const calltree = renderer.create(
      <Provider store={storeWithProfile(profile)}>
        <ProfileCallTreeView />
      </Provider>,
      { createNodeMock }
    );

    expect(calltree.toJSON()).toMatchSnapshot();
  });

  it('renders an inverted call tree', () => {
    const profileForInvertedTree = getProfileFromTextSamples(`
      A A A
      B B B
      C X C
      D Y X
      E Z Y
          Z
    `).profile;

    const calltree = renderer.create(
      <Provider store={storeWithProfile(profileForInvertedTree)}>
        <ProfileCallTreeView />
      </Provider>,
      { createNodeMock }
    );

    expect(calltree.toJSON()).toMatchSnapshot();
  });

  it('renders call tree with a search string', () => {
    const store = storeWithProfile(profile);
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
      getBoundingClientRect: () => getBoundingBox(2000, 1000),
      focus: () => {},
    };
  }
  return null;
}
