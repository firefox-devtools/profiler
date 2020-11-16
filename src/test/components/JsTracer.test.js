/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import { JsTracer } from '../../components/js-tracer';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  addRootOverlayElement,
  removeRootOverlayElement,
  fireFullClick,
} from '../fixtures/utils';
import {
  getProfileWithJsTracerEvents,
  type TestDefinedJsTracerEvent,
} from '../fixtures/profiles/processed-profile';
import { getShowJsTracerSummary } from '../../selectors/url-state';
jest.useFakeTimers();

const GRAPH_BASE_WIDTH = 200;
const GRAPH_WIDTH =
  GRAPH_BASE_WIDTH + TIMELINE_MARGIN_LEFT + TIMELINE_MARGIN_RIGHT;
const GRAPH_HEIGHT = 300;

describe('StackChart', function() {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function setup({
    skipLoadingScreen,
    events,
  }: {
    skipLoadingScreen: boolean,
    events: TestDefinedJsTracerEvent[],
  }) {
    const flushRafCalls = mockRaf();
    const ctx = mockCanvasContext();

    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

    const profile = getProfileWithJsTracerEvents(events);

    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    const renderResult = render(
      <Provider store={store}>
        <JsTracer />
      </Provider>
    );
    const { container, getByText } = renderResult;

    if (skipLoadingScreen) {
      // Have React show the loading screen.
      flushRafCalls();
      // Have React show our new component, and schedule a draw call.
      flushRafCalls();
      // Now flush once more to actually draw to the screen.
      flushRafCalls();
    }

    const getJsTracerChartCanvas = () => container.querySelector('canvas');
    const getChangeJsTracerSummaryCheckbox = () =>
      getByText(/Show only self time/);

    return {
      ...renderResult,
      dispatch,
      getState,
      ctx,
      flushRafCalls,
      getJsTracerChartCanvas,
      getChangeJsTracerSummaryCheckbox,
    };
  }

  const simpleTracerEvents = [
    ['https://mozilla.org', 0, 20],
    ['Interpreter', 1, 19],
    ['IonMonkey', 2, 18],
  ];

  it('only computes the chart after the first tick', () => {
    const { getJsTracerChartCanvas, flushRafCalls } = setup({
      skipLoadingScreen: false,
      events: simpleTracerEvents,
    });
    expect(getJsTracerChartCanvas()).toBeFalsy();
    // Flush twice, as the canvas defers until after React updates.
    flushRafCalls();
    flushRafCalls();
    expect(getJsTracerChartCanvas()).toBeTruthy();
  });

  it('matches the snapshot for the loading screen', () => {
    const { container } = setup({
      skipLoadingScreen: false,
      events: simpleTracerEvents,
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for empty reasons screen', () => {
    const { container } = setup({
      skipLoadingScreen: true,
      events: [],
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for the chart', () => {
    const { container } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot a simple chart render', () => {
    const { ctx } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    expect(ctx.__flushDrawLog()).toMatchSnapshot();
  });

  it('can change to a summary view', function() {
    const { getChangeJsTracerSummaryCheckbox, getState } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    expect(getShowJsTracerSummary(getState())).toEqual(false);
    fireFullClick(getChangeJsTracerSummaryCheckbox());
    expect(getShowJsTracerSummary(getState())).toEqual(true);
  });

  it('matches the snapshot for an inverted draw call', function() {
    const { getChangeJsTracerSummaryCheckbox, ctx } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    fireFullClick(getChangeJsTracerSummaryCheckbox());
    expect(ctx.__flushDrawLog()).toMatchSnapshot();
  });
});
