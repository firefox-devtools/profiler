/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { mount } from 'enzyme';

import ProfileCallTreeView from '../../components/calltree/ProfileCallTreeView';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileFromTextSamples,
  getEmptyThread,
  getEmptyProfile,
} from '../fixtures/profiles/make-profile';
import {
  changeCallTreeSearchString,
  changeImplementationFilter,
  changeInvertCallstack,
  addRangeFilter,
} from '../../actions/profile-view';

describe('calltree/ProfileCallTreeView', function() {
  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
    C  C  H
    D  F  I
    E  E
  `);

  it('renders an unfiltered call tree', () => {
    const calltree = mount(
      <Provider store={storeWithProfile(profile)}>
        <ProfileCallTreeView />
      </Provider>
    );

    expect(calltree).toMatchSnapshot();
  });

  it('renders an inverted call tree', () => {
    const profileForInvertedTree = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  X  C
      D  Y  X
      E  Z  Y
            Z
    `).profile;
    const store = storeWithProfile(profileForInvertedTree);
    store.dispatch(changeInvertCallstack(true));

    const calltree = mount(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    expect(calltree).toMatchSnapshot();
  });

  it('renders call tree with some search strings', () => {
    const store = storeWithProfile(profile);
    const calltree = mount(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    expect(calltree).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C'));
    expect(calltree.update()).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C,'));
    expect(calltree.update()).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C, F'));
    expect(calltree.update()).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C, F,E'));
    expect(calltree.update()).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString(' C , E   '));
    expect(calltree.update()).toMatchSnapshot();
  });

  it('computes a width for a call tree of a really deep stack', () => {
    const { profile } = getProfileFromTextSamples(
      Array(113)
        .fill('name')
        .join('\n')
    );
    const store = storeWithProfile(profile);
    const calltree = mount(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    expect(calltree).toMatchSnapshot();
  });
});

describe('calltree/ProfileCallTreeView EmptyReasons', function() {
  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
    C  C  H
    D  F  I
    E  E
  `);
  profile.threads[0].name = 'Thread with samples';

  function renderWithStore(store) {
    return mount(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
  }

  it('shows a reason for a call tree with no samples', function() {
    const profile = getEmptyProfile();
    const thread = getEmptyThread();
    thread.name = 'Empty Thread';
    profile.threads.push(thread);

    const store = storeWithProfile(profile);
    expect(renderWithStore(store)).toMatchSnapshot();
  });

  it('shows reasons for being out of range of a threads samples', function() {
    const store = storeWithProfile(profile);
    store.dispatch(addRangeFilter(5, 10));
    expect(renderWithStore(store)).toMatchSnapshot();
  });

  it('shows reasons for when samples are completely filtered out', function() {
    const store = storeWithProfile(profile);
    store.dispatch(changeImplementationFilter('js'));
    expect(renderWithStore(store)).toMatchSnapshot();
  });
});
