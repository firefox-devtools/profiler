/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import StackChartGraph from '../../components/stack-chart';
import CallNodeContextMenu from '../../components/shared/CallNodeContextMenu';
import {
  getEmptyThread,
  getEmptyProfile,
} from '../../profile-logic/data-structures';
import {
  changeSelectedCallNode,
  commitRange,
  changeImplementationFilter,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from 'selectors/per-thread';
import { ensureExists } from '../../utils/flow';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import type { CssPixels } from '../../types/units';

jest.useFakeTimers();

const GRAPH_BASE_WIDTH = 200;
const GRAPH_WIDTH =
  GRAPH_BASE_WIDTH + TIMELINE_MARGIN_LEFT + TIMELINE_MARGIN_RIGHT;
const GRAPH_HEIGHT = 300;

describe('StackChart', function() {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function setup(samples) {
    const flushRafCalls = mockRaf();
    const ctx = mockCanvasContext();

    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(
      samples ||
        `
          A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
          B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
          C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
          D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
          E[cat:Graphics]  G[cat:Graphics]
        `
    );

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <>
          <CallNodeContextMenu />
          <StackChartGraph />
        </>
      </Provider>
    );
    const { container, getByText } = renderResult;

    flushRafCalls();

    const stackChartCanvas = ensureExists(
      container.querySelector('.chartCanvas.stackChartCanvas'),
      `Couldn't find the stack chart canvas, with selector .chartCanvas.stackChartCanvas`
    );

    // Mouse event tools
    function getPositioningOptions({ x, y }) {
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

    function fireMouseEvent(eventName, options) {
      fireEvent(stackChartCanvas, getMouseEvent(eventName, options));
    }

    type Position = { x: CssPixels, y: CssPixels };

    // Note to a future developer: the x/y values can be derived from the
    // array returned by flushDrawLog().
    function leftClick(where: Position) {
      const positioningOptions = getPositioningOptions(where);
      const clickOptions = {
        ...positioningOptions,
        button: 0,
        buttons: 0,
      };

      fireMouseEvent('mousemove', positioningOptions);
      fireMouseEvent('mousedown', clickOptions);
      fireMouseEvent('mouseup', clickOptions);
      fireMouseEvent('click', clickOptions);
      flushRafCalls();
    }

    function rightClick(where: Position) {
      const positioningOptions = getPositioningOptions(where);
      const clickOptions = {
        ...positioningOptions,
        button: 2,
        buttons: 2,
      };

      fireMouseEvent('mousemove', positioningOptions);
      fireMouseEvent('mousedown', clickOptions);
      fireMouseEvent('mouseup', clickOptions);
      fireMouseEvent('contextmenu', clickOptions);
      flushRafCalls();
    }

    function moveMouse(where) {
      fireMouseEvent('mousemove', getPositioningOptions(where));
    }

    // Context menu tools
    const getContextMenu = () =>
      ensureExists(
        container.querySelector('.react-contextmenu'),
        `Couldn't find the context menu.`
      );

    function clickMenuItem(strOrRegexp) {
      fireEvent.click(getByText(strOrRegexp));
    }

    return {
      ...renderResult,
      ...store,
      funcNames,
      ctx,
      flushRafCalls,
      stackChartCanvas,
      moveMouse,
      leftClick,
      rightClick,
      clickMenuItem,
      getContextMenu,
    };
  }

  it('matches the snapshot', () => {
    const { container, ctx } = setup();
    const drawCalls = ctx.__flushDrawLog();
    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });

  it('can select a call node when clicking the chart', function() {
    const { dispatch, getState, leftClick } = setup();

    // Start out deselected
    dispatch(changeSelectedCallNode(0, []));
    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    // Click the first frame
    leftClick({
      x: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
      y: 10,
    });

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      0
    );

    // Click on a region without any drawn box to deselect
    leftClick({
      x: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
      y: 100,
    });

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );
  });

  it('can display a context menu when right clicking the chart', function() {
    // Fake timers are indicated when dealing with the context menus.
    jest.useFakeTimers();

    const { rightClick, getContextMenu, clickMenuItem } = setup();

    // Right click the first frame
    rightClick({
      x: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
      y: 10,
    });
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('A');

    // The menu should be closed now.
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    // Run the timers to have a clean state.
    jest.runAllTimers();

    // Try another to make sure the menu works for other stacks too.
    // Right click the first frame
    rightClick({
      x: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
      y: 20,
    });
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('B');
  });

  function getDrawnFrames(ctx) {
    const drawCalls = ctx.__flushDrawLog();
    return drawCalls.filter(([fn]) => fn === 'fillText').map(([, arg]) => arg);
  }

  it('can scroll into view when selecting a node', function() {
    // Create a stack deep enough to not have all its rendered frames
    // fit within GRAPH_HEIGHT.
    const frames = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(
      ' '
    );
    const { dispatch, ctx, funcNames, flushRafCalls } = setup(
      frames.join('\n')
    );
    ctx.__flushDrawLog();

    // Select the last frame, 'Z', and then make sure we can "see" the
    // drawn 'Z', but not 'A'.
    dispatch(
      changeSelectedCallNode(0, frames.map(name => funcNames.indexOf(name)))
    );
    flushRafCalls();

    let drawnFrames = getDrawnFrames(ctx);
    expect(drawnFrames).toContain('Z');
    expect(drawnFrames).not.toContain('A');

    // Now select the first frame, 'A', and check that we also can
    // scroll up again and see 'A', but not 'Z'.
    dispatch(changeSelectedCallNode(0, [funcNames.indexOf('A')]));
    flushRafCalls();

    drawnFrames = getDrawnFrames(ctx);
    expect(drawnFrames).toContain('A');
    expect(drawnFrames).not.toContain('Z');
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
            <StackChartGraph />
          </>
        </Provider>
      ).container;

      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when samples are out of range', () => {
      const { dispatch, container } = setup();
      dispatch(commitRange(5, 10));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when samples have been completely filtered out', function() {
      const { dispatch, container } = setup();
      dispatch(changeImplementationFilter('js'));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });
  });
});
