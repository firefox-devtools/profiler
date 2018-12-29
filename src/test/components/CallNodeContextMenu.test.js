/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import CallNodeContextMenu from '../../components/shared/CallNodeContextMenu';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { mount } from 'enzyme';
import { changeSelectedCallNode } from '../../actions/profile-view';
import { MenuItem } from 'react-contextmenu';
import { Provider } from 'react-redux';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import copy from 'copy-to-clipboard';

describe('calltree/CallNodeContextMenu', function() {
  // Provide a store with a useful profile to assert context menu operations off of.
  function createStore() {
    // Create a profile that every transform can be applied to.
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A          A          A
      B:library  B:library  B:library
      B:library  B:library  B:library
      B:library  B:library  B:library
      C          C          H
      D          F          I
      E          E
    `);
    const store = storeWithProfile(profile);
    store.dispatch(
      changeSelectedCallNode(0, [
        funcNames.indexOf('A'),
        funcNames.indexOf('B:library'),
      ])
    );
    return store;
  }

  function setup(store = createStore(), forceOpenForTests = true) {
    const wrapper = mount(
      <Provider store={store}>
        <CallNodeContextMenu forceOpenForTests={forceOpenForTests} />
      </Provider>
    );

    function findMenuItem(type: string) {
      return wrapper.find(MenuItem).findWhere(n => {
        const { data } = n.props();
        return typeof data === 'object' && data.type === type;
      });
    }

    return { store, wrapper, findMenuItem };
  }

  describe('basic rendering', function() {
    it('renders a blank context menu (with only 1 div) before it is open', () => {
      const isContextMenuOpen = false;
      const { wrapper } = setup(createStore(), isContextMenuOpen);
      expect(wrapper.find('ContextMenu > nav').children().length).toBe(1);
      expect(wrapper).toMatchSnapshot();
    });

    it('renders a full context menu when open, with many nav items', () => {
      const isContextMenuOpen = true;
      const { wrapper } = setup(createStore(), isContextMenuOpen);
      expect(
        wrapper.find('ContextMenu > nav').children().length > 1
      ).toBeTruthy();
      expect(wrapper).toMatchSnapshot();
    });
  });

  describe('clicking on call tree transforms', function() {
    // Iterate through each transform slug, and click things in it.
    for (const type of [
      'merge-call-node',
      'merge-function',
      'focus-subtree',
      'focus-function',
      'collapse-function-subtree',
      'collapse-resource',
      'collapse-direct-recursion',
      'drop-function',
    ]) {
      it(`adds a transform for "${type}"`, function() {
        const { store: { getState }, findMenuItem } = setup();
        findMenuItem(type).simulate('click');
        expect(
          selectedThreadSelectors.getTransformStack(getState())[0].type
        ).toBe(type);
      });
    }
  });

  describe('clicking on the rest of the menu items', function() {
    it('can expand all call nodes in the call tree', function() {
      const { store: { getState }, findMenuItem } = setup();
      expect(
        selectedThreadSelectors.getExpandedCallNodeIndexes(getState())
      ).toHaveLength(1);

      findMenuItem('expand-all').simulate('click');

      // This test only asserts that a bunch of call nodes were actually expanded.
      expect(
        selectedThreadSelectors.getExpandedCallNodeIndexes(getState())
      ).toHaveLength(11);
    });

    it('can look up functions on SearchFox', function() {
      const { findMenuItem } = setup();
      jest.spyOn(window, 'open').mockImplementation(() => {});
      findMenuItem('searchfox').simulate('click');
      expect(window.open).toBeCalledWith(
        'https://searchfox.org/mozilla-central/search?q=B%3Alibrary',
        '_blank'
      );
    });

    it('can copy a function name', function() {
      const { findMenuItem } = setup();
      // Copy is a mocked module, clear it both before and after.
      findMenuItem('copy-function-name').simulate('click');
      expect(copy).toBeCalledWith('B:library');
    });

    it('can copy a script URL', function() {
      // Create a new profile that has JavaScript in it.
      const {
        profile,
        funcNamesPerThread: [funcNames],
      } = getProfileFromTextSamples(`
        A.js
      `);
      const funcIndex = funcNames.indexOf('A.js');
      const [thread] = profile.threads;
      thread.funcTable.fileName[funcIndex] = thread.stringTable.indexForString(
        'https://example.com/script.js'
      );

      const store = storeWithProfile(profile);
      store.dispatch(changeSelectedCallNode(0, [funcIndex]));
      const { findMenuItem } = setup(store);

      // Copy is a mocked module, clear it both before and after.
      findMenuItem('copy-url').simulate('click');
      expect(copy).toBeCalledWith('https://example.com/script.js');
    });

    it('can copy a stack', function() {
      const { findMenuItem } = setup();
      // Copy is a mocked module, clear it both before and after.
      findMenuItem('copy-stack').simulate('click');
      expect(copy).toBeCalledWith(`B:library\nA\n`);
    });
  });
});
