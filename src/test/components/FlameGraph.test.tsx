/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent, within, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { FlameGraph } from '../../components/flame-graph';
import { CallNodeContextMenu } from '../../components/shared/CallNodeContextMenu';
import {
  getInvertCallstack,
  getSourceViewFile,
} from '../../selectors/url-state';
import { ensureExists } from '../../utils/flow';
import {
  getEmptyThread,
  getEmptyProfile,
} from '../../profile-logic/data-structures';
import {
  changeInvertCallstack,
  changeSelectedCallNode,
  commitRange,
  updatePreviewSelection,
  changeImplementationFilter,
} from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';
import { selectedThreadSelectors } from '../../selectors/per-thread';

import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import type { FakeMouseEventInit } from '../fixtures/utils';
import {
  addRootOverlayElement,
  removeRootOverlayElement,
  getMouseEvent,
  fireFullClick,
  fireFullContextMenu,
  findFillTextPositionFromDrawLog,
} from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

import type { CssPixels } from 'firefox-profiler/types';

const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 300;

describe('FlameGraph', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  afterEach(removeRootOverlayElement);
  beforeEach(addRootOverlayElement);

  it('matches the snapshot', () => {
    const { container } = setupFlameGraph();
    const drawCalls = flushDrawLog();

    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });

  it('ignores invertCallstack and always displays non-inverted', () => {
    const { getState, dispatch } = setupFlameGraph();
    expect(getInvertCallstack(getState())).toBe(false);
    act(() => {
      dispatch(changeInvertCallstack(true));
    });
    expect(getInvertCallstack(getState())).toBe(false);
    act(() => {
      dispatch(changeInvertCallstack(false));
    });
    expect(getInvertCallstack(getState())).toBe(false);
  });

  it('shows a tooltip when hovering', () => {
    const { getTooltip, moveMouse, findFillTextPosition } = setupFlameGraph();
    expect(getTooltip()).toBe(null);
    moveMouse(findFillTextPosition('A'));
    expect(getTooltip()).toBeTruthy();
  });

  it('should not persist the selected frame tooltips', () => {
    const { getTooltip, moveMouse, findFillTextPosition, leftClick } =
      setupFlameGraph();
    // No tooltip displayed yet.
    expect(getTooltip()).toBe(null);

    leftClick(findFillTextPosition('A'));

    // The tooltip should be displayed.
    expect(getTooltip()).toBeTruthy();

    // Move the mouse outside of the frame.
    moveMouse({ x: 0, y: 0 });

    // Make sure that we don't have a persisted tooltip.
    expect(getTooltip()).toBeFalsy();
  });

  it('has a tooltip that matches the snapshot with categories', () => {
    const { getTooltip, moveMouse, findFillTextPosition } = setupFlameGraph();
    moveMouse(findFillTextPosition('A'));
    expect(getTooltip()).toMatchSnapshot();
  });

  it('shows a tooltip with the resource information with categories', () => {
    const { getTooltip, moveMouse, findFillTextPosition } = setupFlameGraph();
    moveMouse(findFillTextPosition('J'));
    const tooltip = ensureExists(getTooltip());

    // First, a targeted test.
    const { getByText } = within(tooltip);
    const resourceLabel = getByText('Resource:');
    const valueElement = ensureExists(resourceLabel.nextSibling);

    // See https://github.com/testing-library/jest-dom/issues/306
    // eslint-disable-next-line jest-dom/prefer-to-have-text-content
    expect(valueElement.textContent).toBe('libxul.so');
    // But also do a good old snapshot.
    expect(tooltip).toMatchSnapshot();
  });

  it('can be navigated with the keyboard', () => {
    const { getState, dispatch, getContentDiv, funcNames } = setupFlameGraph();
    const div = getContentDiv();

    function selectedNode() {
      const callNodeIndex =
        selectedThreadSelectors.getSelectedCallNodeIndex(getState());
      return callNodeIndex && funcNames[callNodeIndex];
    }

    // Start out with callnode B selected
    act(() => {
      dispatch(changeSelectedCallNode(0, [0, 1] /* B */));
    });
    expect(selectedNode()).toBe('B');

    // Move one callnode up
    fireEvent.keyDown(div, { key: 'ArrowUp' });
    expect(selectedNode()).toBe('C');

    // Move one callnode right
    fireEvent.keyDown(div, { key: 'ArrowRight' });
    expect(selectedNode()).toBe('H');

    // Go back to left again
    fireEvent.keyDown(div, { key: 'ArrowLeft' });
    expect(selectedNode()).toBe('C');

    // And down, back to our starting callnode again
    fireEvent.keyDown(div, { key: 'ArrowDown' });
    expect(selectedNode()).toBe('B');

    expect(getSourceViewFile(getState())).toBeNull();
    // Open source file for our starting callnode
    fireEvent.keyDown(div, { key: 'Enter' });
    expect(getSourceViewFile(getState())).toBe('path/for/B');
  });

  it('displays a context menu when rightclicking', () => {
    // Fake timers are indicated when dealing with the context menus.
    jest.useFakeTimers();

    const { rightClick, clickMenuItem, getContextMenu, findFillTextPosition } =
      setupFlameGraph();

    rightClick(findFillTextPosition('A'));
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('A');

    // The right click gesture triggered 2 redraws (one mousemove, one
    // mousedown), but the tool findFillTextPosition ensures there's only one
    // result and will throw otherwise.
    // So let's flush the draw calls now. After running the timers
    // afterwards the flame graph will redraw again (as a result of closing the
    // menu and resetting the rightClickedCallNodeIndex).
    flushDrawLog();
    act(() => jest.runAllTimers());

    // Try another node to make sure the menu can handle other nodes than the first.
    rightClick(findFillTextPosition('B'));
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('B');
  });

  it('has a tooltip that matches the snapshot with categories when a preview selection is applied', () => {
    const { getTooltip, moveMouse, findFillTextPosition, dispatch } =
      setupFlameGraph();
    flushDrawLog();
    act(() => {
      dispatch(
        updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 1.3,
          selectionEnd: 5,
        })
      );
    });
    moveMouse(findFillTextPosition('A'));
    expect(getTooltip()).toMatchSnapshot();
  });

  describe('EmptyReasons', () => {
    it('matches the snapshot when a profile has no samples', () => {
      const profile = getEmptyProfile();
      const thread = getEmptyThread();
      thread.name = 'Empty Thread';
      profile.threads.push(thread);

      const store = storeWithProfile(profile);
      const container = render(
        <Provider store={store}>
          <>
            <FlameGraph />
          </>
        </Provider>
      ).container;

      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when samples are not in the committed range', () => {
      const { dispatch } = setupFlameGraph();
      act(() => {
        dispatch(commitRange(5, 10));
      });
      expect(
        screen.getByText('Broaden the selected range to view samples.')
      ).toBeInTheDocument();
    });

    it('shows reasons when samples are not in the preview range', () => {
      const { dispatch } = setupFlameGraph();
      act(() => {
        dispatch(
          updatePreviewSelection({
            hasSelection: true,
            isModifying: false,
            selectionStart: 5,
            selectionEnd: 10,
          })
        );
      });

      expect(
        screen.getByText(
          'Try broadening the selected range, removing search terms, or call tree transforms to view samples.'
        )
      ).toBeInTheDocument();
    });

    it('shows reasons when samples have been completely filtered out', function () {
      const { dispatch } = setupFlameGraph();
      act(() => {
        dispatch(changeImplementationFilter('js'));
      });
      expect(
        screen.getByText(
          'Try broadening the selected range, removing search terms, or call tree transforms to view samples.'
        )
      ).toBeInTheDocument();
    });
  });
});

function setupFlameGraph() {
  const flushRafCalls = mockRaf();

  const {
    profile,
    stringTable,
    funcNamesPerThread: [funcNames],
    funcNamesDictPerThread: [funcNamesDict],
  } = getProfileFromTextSamples(`
    A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
    B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
    C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
    D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
    E[cat:Graphics]  G[cat:Graphics]
                     J[lib:libxul.so]
  `);

  // Add some file and line number to the profile so that tooltips generate
  // an interesting snapshot.
  const { funcTable } = profile.threads[0];
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    funcTable.lineNumber[funcIndex] = funcIndex + 10;
    funcTable.columnNumber[funcIndex] = funcIndex + 100;
    funcTable.fileName[funcIndex] = stringTable.indexForString('path/to/file');
  }

  funcTable.fileName[funcNamesDict.B] =
    stringTable.indexForString('path/for/B');

  funcTable.fileName[funcNamesDict.J] = stringTable.indexForString(
    'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28'
  );

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('flame-graph'));

  const renderResult = render(
    <Provider store={store}>
      <>
        <CallNodeContextMenu />
        <FlameGraph />
      </>
    </Provider>
  );
  const { container, getByText } = renderResult;

  flushRafCalls();

  function getPositioningOptions(x: number, y: number) {
    // These positioning options will be sent to all our mouse events. Note
    // that the values aren't really consistent, especially offsetY and
    // pageY shouldn't be the same, but in the context of our test this will
    // be good enough.
    // pageX/Y values control the position of the tooltip so it's not super
    // important.
    // offsetX/Y are more important as they're used to find which node is
    // actually clicked.
    // clientX/Y is used in the Viewport HOC when dragging and zooming.
    const positioningOptions = {
      offsetX: x,
      offsetY: y,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
    };

    return positioningOptions;
  }

  const canvas = ensureExists(
    container.querySelector('canvas'),
    'The container should contain a canvas element.'
  );

  function fireMouseEvent(eventName: string, options: FakeMouseEventInit) {
    fireEvent(canvas, getMouseEvent(eventName, options));
  }

  function leftClick({ x, y }: { x: CssPixels; y: CssPixels }) {
    const positioningOptions = getPositioningOptions(x, y);

    fireMouseEvent('mousemove', positioningOptions);
    fireFullClick(canvas, positioningOptions);
    flushRafCalls();
  }

  // You can use findFillTextPosition to derive the x, y positioning from the
  // draw log.
  function rightClick({ x, y }: { x: CssPixels; y: CssPixels }) {
    const positioningOptions = getPositioningOptions(x, y);

    fireMouseEvent('mousemove', positioningOptions);
    fireFullContextMenu(canvas, positioningOptions);
    flushRafCalls();
  }

  function moveMouse({ x, y }: { x: CssPixels; y: CssPixels }) {
    fireMouseEvent('mousemove', getPositioningOptions(x, y));
  }

  /**
   * The tooltip is in a portal, and created in the root overlay elements.
   */
  function getTooltip(): HTMLElement | null {
    return document.querySelector('#root-overlay .tooltip');
  }

  /**
   * The content div is the one receiving keyboard events for navigation.
   */
  function getContentDiv() {
    return ensureExists(
      container.querySelector('.flameGraphContent'),
      `Couldn't find the content div with selector .flameGraphContent`
    );
  }

  // Context menu tools
  const getContextMenu = () =>
    ensureExists(
      container.querySelector('.react-contextmenu'),
      `Couldn't find the context menu.`
    );

  function clickMenuItem(strOrRegexp: string | RegExp) {
    fireFullClick(getByText(strOrRegexp));
  }

  function findFillTextPosition(fillText: string) {
    return findFillTextPositionFromDrawLog(flushDrawLog(), fillText);
  }

  return {
    ...store,
    ...renderResult,
    funcNames,
    moveMouse,
    leftClick,
    rightClick,
    getTooltip,
    getContentDiv,
    getContextMenu,
    clickMenuItem,
    findFillTextPosition,
  };
}
