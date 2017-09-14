/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { storeWithProfile } from '../fixtures/stores';
import * as ProfileView from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../reducers/profile-view';

describe('call node paths on implementation filter change', function() {
  const { profile, funcNames } = getProfileFromTextSamples(`
    A.cpp
    B.js
    C.cpp
    D.js
    E.js
    F.cpp
  `);
  const threadIndex = 0;
  const A = funcNames.indexOf('A.cpp');
  const B = funcNames.indexOf('B.js');
  const C = funcNames.indexOf('C.cpp');
  const D = funcNames.indexOf('D.js');
  const E = funcNames.indexOf('E.js');

  it('starts with combined CallNodePaths', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B, C, D, E]));
    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([A, B, C, D, E]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [A],
      [A, B],
      [A, B, C],
      [A, B, C, D],
    ]);
  });

  it('starts with js CallNodePaths', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([B, D, E]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [B],
      [B, D],
    ]);
  });

  it('strips away the C++ functions when going from combined to JS', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B, C, D, E]));
    dispatch(ProfileView.changeImplementationFilter('js'));
    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([B, D, E]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [B],
      [B, D],
    ]);
  });

  it('re-adds the C++ functions when going from JS to combined', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    dispatch(ProfileView.changeImplementationFilter('combined'));
    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([A, B, C, D, E]);
    expect(
      selectedThreadSelectors
        .getExpandedCallNodePaths(getState())
        // The paths will be in a weird order, so sort by length.
        .slice()
        .sort((a, b) => a.length - b.length)
    ).toEqual([
      // Paths
      [A],
      [A, B],
      [A, B, C],
      [A, B, C, D],
    ]);
  });

  it('can go from JS to C++ views', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    dispatch(ProfileView.changeImplementationFilter('cpp'));
    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([A, C]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [A],
    ]);
  });
});
