/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import copy from 'copy-to-clipboard';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { FunctionListContextMenu } from '../../components/shared/FunctionListContextMenu';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { fireFullClick } from '../fixtures/utils';
import {
  changeRightClickedFunctionIndex,
  setContextMenuVisibility,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ensureExists } from '../../utils/types';

describe('FunctionListContextMenu', function () {
  // Create a profile that exercises all the conditional menu items:
  // - B[lib:XUL] appears three times in a row (direct + indirect recursion)
  // - B[lib:XUL] belongs to the XUL library (collapse-resource)
  function createStore() {
    const {
      profile,
      funcNamesDictPerThread: [{ B }],
    } = getProfileFromTextSamples(`
      A           A           A
      B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
      B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
      B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
      C           C           H
      D           F           I
      E           E
    `);
    const store = storeWithProfile(profile);
    store.dispatch(changeRightClickedFunctionIndex(0, B));
    return store;
  }

  function setup(store = createStore()) {
    store.dispatch(setContextMenuVisibility(true));
    const renderResult = render(
      <Provider store={store}>
        <FunctionListContextMenu />
      </Provider>
    );
    return { ...renderResult, getState: store.getState };
  }

  describe('basic rendering', function () {
    it('does not render when no function is right-clicked', () => {
      const store = storeWithProfile(getProfileFromTextSamples('A').profile);
      store.dispatch(setContextMenuVisibility(true));
      const { container } = render(
        <Provider store={store}>
          <FunctionListContextMenu />
        </Provider>
      );
      expect(container.querySelector('.react-contextmenu')).toBeNull();
    });

    it('renders a full context menu when a function is right-clicked', () => {
      const { container } = setup();
      expect(
        ensureExists(
          container.querySelector('.react-contextmenu'),
          `Couldn't find the context menu root component .react-contextmenu`
        ).children.length > 1
      ).toBeTruthy();
      expect(container.firstChild).toMatchSnapshot();
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
    const fixtures = [
      { matcher: /Merge function/, type: 'merge-function' },
      { matcher: /Focus on function/, type: 'focus-function' },
      { matcher: /Focus on self only/, type: 'focus-self' },
      { matcher: /Collapse function/, type: 'collapse-function-subtree' },
      { matcher: /XUL/, type: 'collapse-resource' },
      { matcher: /^Collapse recursion/, type: 'collapse-recursion' },
      {
        matcher: /Collapse direct recursion/,
        type: 'collapse-direct-recursion',
      },
      { matcher: /Drop samples/, type: 'drop-function' },
    ];

    fixtures.forEach(({ matcher, type }) => {
      it(`adds a transform for "${type}"`, function () {
        const { getState } = setup();
        fireFullClick(screen.getByText(matcher));
        expect(
          selectedThreadSelectors.getTransformStack(getState())[0].type
        ).toBe(type);
      });
    });
  });

  describe('clicking on utility items', function () {
    it('can copy a function name', function () {
      setup();
      fireFullClick(screen.getByText('Copy function name'));
      expect(copy).toHaveBeenCalledWith('B');
    });
  });
});
