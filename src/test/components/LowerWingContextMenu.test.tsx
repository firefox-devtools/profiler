/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { LowerWingContextMenu } from '../../components/shared/LowerWingContextMenu';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { fireFullClick } from '../fixtures/utils';
import {
  changeLowerWingRightClickedCallNode,
  setContextMenuVisibility,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ensureExists } from '../../utils/types';

describe('LowerWingContextMenu', function () {
  // Samples: A->B->C, A->E->C
  // When C is selected, the lower wing (inverted) tree shows:
  //   C (root/self function)
  //     B (caller of C)
  //       A
  //     E (caller of C)
  //       A
  //
  // Right-clicking B (an inverted child = caller) should give a context menu
  // for B, not C.
  function createStore() {
    const {
      profile,
      funcNamesDictPerThread: [{ B, C }],
    } = getProfileFromTextSamples(`
      A  A
      B  E
      C  C
    `);
    const store = storeWithProfile(profile);

    // The inverted call node path for B-as-caller-of-C is [C, B].
    const threadsKey = 0;
    store.dispatch(
      changeLowerWingRightClickedCallNode(threadsKey, [C, B])
    );
    return store;
  }

  function setup(store = createStore()) {
    store.dispatch(setContextMenuVisibility(true));
    const renderResult = render(
      <Provider store={store}>
        <LowerWingContextMenu />
      </Provider>
    );
    return { ...renderResult, getState: store.getState };
  }

  describe('basic rendering', function () {
    it('does not render when no node is right-clicked', () => {
      const store = storeWithProfile(getProfileFromTextSamples('A').profile);
      store.dispatch(setContextMenuVisibility(true));
      const { container } = render(
        <Provider store={store}>
          <LowerWingContextMenu />
        </Provider>
      );
      expect(container.querySelector('.react-contextmenu')).toBeNull();
    });

    it('renders a context menu when a node is right-clicked', () => {
      const { container } = setup();
      expect(
        ensureExists(
          container.querySelector('.react-contextmenu'),
          `Couldn't find the context menu root component .react-contextmenu`
        ).children.length > 1
      ).toBeTruthy();
    });

    it('does not include call-node-specific transforms', () => {
      setup();
      expect(screen.queryByText(/Merge node only/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Focus on subtree only/)
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Expand all/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Copy stack/)).not.toBeInTheDocument();
    });
  });

  describe('clicking on transforms', function () {
    it('applies transforms to function B, not to the selected function C', function () {
      const { getState } = setup();
      fireFullClick(screen.getByText(/Merge function/));
      const transform = selectedThreadSelectors.getTransformStack(getState())[0];
      expect(transform.type).toBe('merge-function');
      // The transform should target B (the right-clicked caller), not C (the root).
      if (transform.type === 'merge-function') {
        const {
          funcNamesDictPerThread: [{ B }],
        } = getProfileFromTextSamples(`
          A  A
          B  E
          C  C
        `);
        expect(transform.funcIndex).toBe(B);
      }
    });

    it('adds a focus-function transform for the right-clicked node', function () {
      const { getState } = setup();
      fireFullClick(screen.getByText(/Focus on function/));
      expect(
        selectedThreadSelectors.getTransformStack(getState())[0].type
      ).toBe('focus-function');
    });
  });
});
