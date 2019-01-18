/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';

import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import StackChartGraph from '../../components/stack-chart';
import { changeSelectedCallNode } from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
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
    const { getState, dispatch } = store;

    const renderResult = render(
      <Provider store={store}>
        <StackChartGraph />
      </Provider>
    );
    const { container } = renderResult;

    flushRafCalls();

    const stackChartCanvas = ensureExists(
      container.querySelector('.chartCanvas.stackChartCanvas')
    );
    return {
      ...renderResult,
      dispatch,
      getState,
      funcNames,
      ctx,
      flushRafCalls,
      stackChartCanvas,
    };
  }

  it('matches the snapshot', () => {
    const { container, ctx } = setup();
    const drawCalls = ctx.__flushDrawLog();
    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });

  it('can select a call node when clicking the chart', function() {
    const { dispatch, getState, stackChartCanvas } = setup();

    // Start out deselected
    dispatch(changeSelectedCallNode(0, []));
    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    // Click the first frame
    fireEvent(
      stackChartCanvas,
      getMouseEvent('mousemove', {
        offsetX: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
        offsetY: 10,
      })
    );
    fireEvent.mouseDown(stackChartCanvas);
    fireEvent.mouseUp(stackChartCanvas);

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      0
    );

    // Click on a region without any drawn box to deselect
    fireEvent(
      stackChartCanvas,
      getMouseEvent('mousemove', {
        offsetX: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
        offsetY: 100,
      })
    );
    fireEvent.mouseDown(stackChartCanvas);
    fireEvent.mouseUp(stackChartCanvas);

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );
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
});
