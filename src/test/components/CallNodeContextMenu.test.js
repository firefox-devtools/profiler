/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import CallNodeContextMenu from '../../components/shared/CallNodeContextMenu';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { render, fireEvent } from 'react-testing-library';
import {
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  setContextMenuVisibility,
} from '../../actions/profile-view';
import { Provider } from 'react-redux';
import { selectedThread } from 'firefox-profiler/selectors';
import { ensureExists } from '../../utils/flow';
import copy from 'copy-to-clipboard';

describe('calltree/CallNodeContextMenu', function() {
  // Provide a store with a useful profile to assert context menu operations off of.
  function createStore() {
    // Create a profile that every transform can be applied to.
    const {
      profile,
      funcNamesDictPerThread: [{ A, B }],
    } = getProfileFromTextSamples(`
      A               A               A
      B[lib:library]  B[lib:library]  B[lib:library]
      B[lib:library]  B[lib:library]  B[lib:library]
      B[lib:library]  B[lib:library]  B[lib:library]
      C               C               H
      D               F               I
      E               E
    `);
    const store = storeWithProfile(profile);

    store.dispatch(changeExpandedCallNodes(0, [[A]]));
    store.dispatch(changeRightClickedCallNode(0, [A, B]));
    return store;
  }

  function setup(store = createStore(), openMenuState = true) {
    store.dispatch(setContextMenuVisibility(openMenuState));

    const renderResult = render(
      <Provider store={store}>
        <CallNodeContextMenu />
      </Provider>
    );

    return { ...renderResult, getState: store.getState };
  }

  describe('basic rendering', function() {
    it('does not render the context menu when it is closed', () => {
      const isContextMenuOpen = false;
      const { container } = setup(createStore(), isContextMenuOpen);
      expect(container.querySelector('.react-contextmenu')).toBeNull();
    });

    it('renders a full context menu when open, with many nav items', () => {
      const isContextMenuOpen = true;
      const { container } = setup(createStore(), isContextMenuOpen);
      expect(
        ensureExists(
          container.querySelector('.react-contextmenu'),
          `Couldn't find the context menu root component .react-contextmenu`
        ).children.length > 1
      ).toBeTruthy();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('clicking on call tree transforms', function() {
    // Iterate through each transform slug, and click things in it.
    const fixtures = [
      { matcher: /Merge node/, type: 'merge-call-node' },
      { matcher: /Merge function/, type: 'merge-function' },
      { matcher: /Focus.*subtree/, type: 'focus-subtree' },
      { matcher: /Focus.*function/, type: 'focus-function' },
      { matcher: /Collapse.*subtree/, type: 'collapse-function-subtree' },
      { matcher: /Collapse functions/, type: 'collapse-resource' },
      { matcher: /Collapse.*recursion/, type: 'collapse-direct-recursion' },
      { matcher: /Drop samples/, type: 'drop-function' },
    ];

    fixtures.forEach(({ matcher, type }) => {
      it(`adds a transform for "${type}"`, function() {
        const { getState, getByText } = setup();
        fireEvent.click(getByText(matcher));
        expect(selectedThread.getTransformStack(getState())[0].type).toBe(type);
      });
    });
  });

  describe('clicking on the rest of the menu items', function() {
    it('can expand all call nodes in the call tree', function() {
      const { getState, getByText } = setup();
      expect(
        selectedThread.getExpandedCallNodeIndexes(getState())
      ).toHaveLength(1);

      fireEvent.click(getByText('Expand all'));

      // This test only asserts that a bunch of call nodes were actually expanded.
      expect(
        selectedThread.getExpandedCallNodeIndexes(getState())
      ).toHaveLength(11);
    });

    it('can look up functions on SearchFox', function() {
      const { getByText } = setup();
      jest.spyOn(window, 'open').mockImplementation(() => {});
      fireEvent.click(getByText(/Searchfox/));
      expect(window.open).toBeCalledWith(
        'https://searchfox.org/mozilla-central/search?q=B',
        '_blank'
      );
    });

    it('can copy a function name', function() {
      const { getByText } = setup();
      // Copy is a mocked module, clear it both before and after.
      fireEvent.click(getByText('Copy function name'));
      expect(copy).toBeCalledWith('B');
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
      store.dispatch(changeRightClickedCallNode(0, [funcIndex]));
      const { getByText } = setup(store);

      // Copy is a mocked module, clear it both before and after.
      fireEvent.click(getByText('Copy script URL'));
      expect(copy).toBeCalledWith('https://example.com/script.js');
    });

    it('can copy a stack', function() {
      const { getByText } = setup();
      // Copy is a mocked module, clear it both before and after.
      fireEvent.click(getByText('Copy stack'));
      expect(copy).toBeCalledWith(`B\nA\n`);
    });
  });
});
