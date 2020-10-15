/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import { FlameGraph } from '../../components/flame-graph';
import CallNodeContextMenu from '../../components/shared/CallNodeContextMenu';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  addRootOverlayElement,
  removeRootOverlayElement,
  getMouseEvent,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  getEmptyThread,
  getEmptyProfile,
} from '../../profile-logic/data-structures';
import {
  changeInvertCallstack,
  changeSelectedCallNode,
  commitRange,
  changeImplementationFilter,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { getInvertCallstack } from '../../selectors/url-state';
import { ensureExists } from '../../utils/flow';

import type { CssPixels } from 'firefox-profiler/types';

const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 300;

describe('FlameGraph', function() {
  afterEach(removeRootOverlayElement);
  beforeEach(addRootOverlayElement);

  it('matches the snapshot', () => {
    const { container, flushDrawLog } = setupFlameGraph();
    const drawCalls = flushDrawLog();

    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });

  it('renders a message instead of the graph when call stack is inverted', () => {
    const { getByText, dispatch } = setupFlameGraph();
    dispatch(changeInvertCallstack(true));
    expect(getByText(/The Flame Graph is not available/)).toBeDefined();
  });

  it('switches back to uninverted mode when clicking the button', () => {
    const { getByText, dispatch, getState } = setupFlameGraph();
    dispatch(changeInvertCallstack(true));
    expect(getInvertCallstack(getState())).toBe(true);
    fireFullClick(getByText(/Switch to the normal call stack/));
    expect(getInvertCallstack(getState())).toBe(false);
  });

  it('shows a tooltip when hovering', () => {
    const { getTooltip, moveMouse } = setupFlameGraph();
    expect(getTooltip()).toBe(null);
    moveMouse(GRAPH_WIDTH * 0.5, GRAPH_HEIGHT - 3);
    expect(getTooltip()).toBeTruthy();
  });

  it('has a tooltip that matches the snapshot', () => {
    const { getTooltip, moveMouse } = setupFlameGraph();
    moveMouse(GRAPH_WIDTH * 0.5, GRAPH_HEIGHT - 3);
    expect(getTooltip()).toMatchSnapshot();
  });

  it('can be navigated with the keyboard', () => {
    const { getState, dispatch, getContentDiv, funcNames } = setupFlameGraph();
    const div = getContentDiv();

    function selectedNode() {
      const callNodeIndex = selectedThreadSelectors.getSelectedCallNodeIndex(
        getState()
      );
      return callNodeIndex && funcNames[callNodeIndex];
    }

    // Start out with callnode B selected
    dispatch(changeSelectedCallNode(0, [0, 1] /* B */));
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
  });

  it('displays a context menu when rightclicking', () => {
    // Fake timers are indicated when dealing with the context menus.
    jest.useFakeTimers();

    const { rightClick, clickMenuItem, getContextMenu } = setupFlameGraph();

    rightClick(GRAPH_WIDTH * 0.5, GRAPH_HEIGHT - 3);
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('A');

    jest.runAllTimers();

    // Try another node to make sure the menu can handle other nodes than the first.
    rightClick(GRAPH_WIDTH * 0.5, GRAPH_HEIGHT - 25);
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('B');
  });

  describe('EmptyReasons', () => {
    it('shows reasons when a profile has no samples', () => {
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

    it('shows reasons when samples are out of range', () => {
      const { dispatch, container } = setupFlameGraph();
      dispatch(commitRange(5, 10));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when samples have been completely filtered out', function() {
      const { dispatch, container } = setupFlameGraph();
      dispatch(changeImplementationFilter('js'));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });
  });
});

function setupFlameGraph() {
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();

  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
    B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
    C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
    D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
    E[cat:Graphics]  G[cat:Graphics]
  `);

  // Add some file and line number to the profile so that tooltips generate
  // an interesting snapshot.
  const { funcTable, stringTable } = profile.threads[0];
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    funcTable.lineNumber[funcIndex] = funcIndex + 10;
    funcTable.columnNumber[funcIndex] = funcIndex + 100;
    funcTable.fileName[funcIndex] = stringTable.indexForString('path/to/file');
  }

  const store = storeWithProfile(profile);

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

  function getPositioningOptions(x, y) {
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

  function fireMouseEvent(eventName, options) {
    fireEvent(canvas, getMouseEvent(eventName, options));
  }

  // Note to a future developer: the x/y values can be derived from the
  // array returned by flushDrawLog().
  function rightClick(x: CssPixels, y: CssPixels) {
    const positioningOptions = getPositioningOptions(x, y);

    fireMouseEvent('mousemove', positioningOptions);
    fireFullContextMenu(canvas, positioningOptions);
    flushRafCalls();
  }

  function moveMouse(x, y) {
    fireMouseEvent('mousemove', getPositioningOptions(x, y));
  }

  /**
   * The tooltip is in a portal, and created in the root overlay elements.
   */
  function getTooltip() {
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

  function clickMenuItem(strOrRegexp) {
    fireFullClick(getByText(strOrRegexp));
  }

  return {
    ...store,
    ...renderResult,
    funcNames,
    ctx,
    moveMouse,
    rightClick,
    getTooltip,
    getContentDiv,
    getContextMenu,
    clickMenuItem,
    flushDrawLog: () => ctx.__flushDrawLog(),
  };
}
