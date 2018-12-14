/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import StackChartGraph from '../../components/stack-chart';
import { mount } from 'enzyme';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { changeSelectedCallNode } from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/profile-view';
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
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
    `
    );

    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    const view = mount(
      <Provider store={store}>
        <StackChartGraph />
      </Provider>
    );

    flushRafCalls();

    const stackChartCanvas = view.find('.chartCanvas.stackChartCanvas').first();
    return {
      dispatch,
      getState,
      funcNames,
      view,
      ctx,
      flushRafCalls,
      stackChartCanvas,
    };
  }

  it('matches the snapshot', () => {
    const { view, ctx } = setup();
    const drawCalls = ctx.__flushDrawLog();
    expect(view).toMatchSnapshot();
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
    stackChartCanvas.simulate(
      'mousemove',
      getMouseEvent({
        nativeEvent: {
          offsetX: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
          offsetY: 10,
        },
      })
    );
    stackChartCanvas.simulate('mousedown');
    stackChartCanvas.simulate('mouseup');

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      0
    );

    // Click on a region without any drawn box to deselect
    stackChartCanvas.simulate(
      'mousemove',
      getMouseEvent({
        nativeEvent: {
          offsetX: GRAPH_BASE_WIDTH / 2 + TIMELINE_MARGIN_LEFT,
          offsetY: 100,
        },
      })
    );
    stackChartCanvas.simulate('mousedown');
    stackChartCanvas.simulate('mouseup');

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
