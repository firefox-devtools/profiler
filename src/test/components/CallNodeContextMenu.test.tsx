/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import copy from 'copy-to-clipboard';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { CallNodeContextMenu } from '../../components/shared/CallNodeContextMenu';
import { storeWithProfile, blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { createGeckoProfileWithJsTimings } from '../fixtures/profiles/gecko-profile';
import {
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  setContextMenuVisibility,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getSourceViewFile } from '../../selectors/url-state';
import { ensureExists } from '../../utils/flow';
import { fireFullClick } from '../fixtures/utils';
import { createBrowserConnection } from '../../app-logic/browser-connection';
import { updateBrowserConnectionStatus } from 'firefox-profiler/actions/app';
import { simulateWebChannel } from '../fixtures/mocks/web-channel';
import { retrieveProfileFromBrowser } from '../../actions/receive-profile';
import type { GeckoProfile } from 'firefox-profiler/types';

describe('calltree/CallNodeContextMenu', function () {
  // Provide a store with a useful profile to assert context menu operations off of.
  function createStore() {
    // Create a profile that every transform can be applied to.
    const {
      profile,
      funcNamesDictPerThread: [{ A, B }],
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

    store.dispatch(changeExpandedCallNodes(0, [[A]]));
    store.dispatch(changeRightClickedCallNode(0, [A, B]));
    return store;
  }

  function createStoreWithJsCallStack() {
    // Create a new profile that has JavaScript in it.
    const {
      profile,
      stringTable,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A.js
      B.js
    `);
    const [thread] = profile.threads;
    const fileNameIndex = stringTable.indexForString(
      'https://example.com/script.js'
    );

    const funcIndexA = funcNames.indexOf('A.js');
    thread.funcTable.fileName[funcIndexA] = fileNameIndex;
    thread.funcTable.lineNumber[funcIndexA] = 1;
    thread.funcTable.columnNumber[funcIndexA] = 111;

    const funcIndexB = funcNames.indexOf('B.js');
    thread.funcTable.fileName[funcIndexB] = fileNameIndex;
    thread.funcTable.lineNumber[funcIndexB] = 2;
    thread.funcTable.columnNumber[funcIndexB] = 222;

    const store = storeWithProfile(profile);
    store.dispatch(changeRightClickedCallNode(0, [funcIndexA, funcIndexB]));
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

  describe('basic rendering', function () {
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

  describe('clicking on call tree transforms', function () {
    // Iterate through each transform slug, and click things in it.
    const fixtures = [
      { matcher: /Merge function/, type: 'merge-function' },
      { matcher: /Merge node only/, type: 'merge-call-node' },
      { matcher: /Focus on subtree only/, type: 'focus-subtree' },
      { matcher: /Focus on function/, type: 'focus-function' },
      { matcher: /Other/, type: 'focus-category' },
      { matcher: /Collapse function/, type: 'collapse-function-subtree' },
      { matcher: /XUL/, type: 'collapse-resource' },
      {
        matcher: /Collapse recursion/,
        type: 'collapse-recursion',
      },
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

  describe('clicking on the rest of the menu items', function () {
    it('can show source file', function () {
      const sourceViewFile =
        'git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b';
      const {
        profile,
        funcNamesDictPerThread: [{ A }],
      } = getProfileFromTextSamples(`A[file:${sourceViewFile}]`);
      const store = storeWithProfile(profile);
      store.dispatch(changeRightClickedCallNode(0, [A]));
      const { getState } = setup(store);

      expect(getSourceViewFile(getState())).toBeNull();
      fireFullClick(screen.getByText(/Show/));
      expect(getSourceViewFile(getState())).toBe(sourceViewFile);
    });

    it('can expand all call nodes in the call tree', function () {
      const { getState } = setup();
      expect(
        selectedThreadSelectors.getExpandedCallNodeIndexes(getState())
      ).toHaveLength(1);

      fireFullClick(screen.getByText('Expand all'));

      // This test only asserts that a bunch of call nodes were actually expanded.
      expect(
        selectedThreadSelectors.getExpandedCallNodeIndexes(getState())
      ).toHaveLength(11);
    });

    it('can look up functions on SearchFox', function () {
      setup();
      // @ts-expect-error Not a fully featured window.open implementation
      jest.spyOn(window, 'open').mockImplementation(() => {});
      fireFullClick(screen.getByText(/Searchfox/));
      expect(window.open).toHaveBeenCalledWith(
        'https://searchfox.org/mozilla-central/search?q=B',
        '_blank'
      );
    });

    it('can copy a function name', function () {
      setup();
      // Copy is a mocked module, clear it both before and after.
      fireFullClick(screen.getByText('Copy function name'));
      expect(copy).toHaveBeenCalledWith('B');
    });

    it('can copy a script URL', function () {
      setup(createStoreWithJsCallStack());
      // Copy is a mocked module, clear it both before and after.
      fireFullClick(screen.getByText('Copy script URL'));
      expect(copy).toHaveBeenCalledWith('https://example.com/script.js');
    });

    it('can copy a stack', function () {
      setup(createStoreWithJsCallStack());
      // Copy is a mocked module, clear it both before and after.
      fireFullClick(screen.getByText('Copy stack'));
      expect(copy).toHaveBeenCalledWith(
        `B.js [https://example.com/script.js:2:222]\nA.js [https://example.com/script.js:1:111]`
      );
    });

    describe('Show the function in DevTools item', function () {
      async function setupWithBrowserConnection(
        profile: GeckoProfile = createGeckoProfileWithJsTimings()
      ) {
        simulateWebChannel(async () => profile);
        const browserConnectionStatus =
          await createBrowserConnection('Firefox/136.0');
        const store = blankStore();
        store.dispatch(updateBrowserConnectionStatus(browserConnectionStatus));
        await store.dispatch(
          retrieveProfileFromBrowser(browserConnectionStatus)
        );

        setup(store);

        return {
          ...store,
          profile,
        };
      }

      it('does not show up when there is no browser connection', function () {
        const {
          profile,
          funcNamesDictPerThread: [{ A }],
        } = getProfileFromTextSamples(`A.js`);
        const store = storeWithProfile(profile);
        store.dispatch(changeRightClickedCallNode(0, [A]));
        setup(store);

        const contextMenuItem = screen.queryByText(
          'Show the function in DevTools'
        );
        expect(contextMenuItem).not.toBeInTheDocument();
      });

      it('shows up when there is a browser connection', async function () {
        const { dispatch } = await setupWithBrowserConnection();
        const threadIndex = 0;
        // This refers to the sample with "(root), 0x100000f84, javascriptOne"
        const callNodePath = [0, 1, 4];

        act(() => {
          dispatch(changeRightClickedCallNode(threadIndex, callNodePath));
        });

        const contextMenuItem = screen.queryByText(
          'Show the function in DevTools'
        );
        expect(contextMenuItem).toBeInTheDocument();
      });

      it('does not show up when it is not a JS frame', async function () {
        const { dispatch } = await setupWithBrowserConnection();
        const threadIndex = 0;
        // This refers to the sample with "(root), 0x100000f84, Startup::XRE_Main"
        const callNodePath = [0, 1, 3];

        act(() => {
          dispatch(changeRightClickedCallNode(threadIndex, callNodePath));
        });

        const contextMenuItem = screen.queryByText(
          'Show the function in DevTools'
        );
        expect(contextMenuItem).not.toBeInTheDocument();
      });

      it('does not show up when the JS is self hosted', async function () {
        const { dispatch } = await setupWithBrowserConnection();
        const threadIndex = 0;
        // This refers to the sample with "(root), 0x100000f84, javascriptOne javascriptTwo"
        const callNodePath = [0, 1, 4, 5];

        act(() => {
          dispatch(changeRightClickedCallNode(threadIndex, callNodePath));
        });

        const contextMenuItem = screen.queryByText(
          'Show the function in DevTools'
        );
        expect(contextMenuItem).not.toBeInTheDocument();
      });

      it('does not show up when there is no tabId', async function () {
        const { dispatch } = await setupWithBrowserConnection();
        const threadIndex = 0;
        // This refers to the sample with 0x100000f84, javascriptOne, javascriptTwo, 0x10000f0f0, 0x100fefefe, javascriptThree
        const callNodePath = [0, 1, 4, 5, 6, 7];

        act(() => {
          dispatch(changeRightClickedCallNode(threadIndex, callNodePath));
        });

        const contextMenuItem = screen.queryByText(
          'Show the function in DevTools'
        );
        expect(contextMenuItem).not.toBeInTheDocument();
      });
    });
  });
});
