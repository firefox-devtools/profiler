/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import { JsTracer } from '../../components/js-tracer';
import { getShowJsTracerSummary } from '../../selectors/url-state';

import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  addRootOverlayElement,
  removeRootOverlayElement,
  fireFullClick,
} from '../fixtures/utils';
import {
  getProfileWithJsTracerEvents,
  type TestDefinedJsTracerEvent,
} from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

jest.useFakeTimers();

const GRAPH_BASE_WIDTH = 200;
const GRAPH_WIDTH =
  GRAPH_BASE_WIDTH + TIMELINE_MARGIN_LEFT + TIMELINE_MARGIN_RIGHT;
const GRAPH_HEIGHT = 300;

describe('StackChart', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function setup({
    skipLoadingScreen,
    events,
  }: {
    skipLoadingScreen: boolean;
    events: TestDefinedJsTracerEvent[];
  }) {
    const flushRafCalls = mockRaf();

    const profile = getProfileWithJsTracerEvents(events);

    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    const renderResult = render(
      <Provider store={store}>
        <JsTracer />
      </Provider>
    );
    const { container } = renderResult;

    if (skipLoadingScreen) {
      flushRafCalls();
    }

    const getJsTracerChartCanvas = () => container.querySelector('canvas');
    const getChangeJsTracerSummaryCheckbox = () =>
      screen.getByText(/Show only self time/);

    return {
      ...renderResult,
      dispatch,
      getState,
      flushRafCalls,
      getJsTracerChartCanvas,
      getChangeJsTracerSummaryCheckbox,
    };
  }

  const simpleTracerEvents: TestDefinedJsTracerEvent[] = [
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
    setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('can change to a summary view', function () {
    const { getChangeJsTracerSummaryCheckbox, getState } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    expect(getShowJsTracerSummary(getState())).toEqual(false);
    fireFullClick(getChangeJsTracerSummaryCheckbox());
    expect(getShowJsTracerSummary(getState())).toEqual(true);
  });

  it('matches the snapshot for an inverted draw call', function () {
    const { getChangeJsTracerSummaryCheckbox } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    fireFullClick(getChangeJsTracerSummaryCheckbox());
    expect(flushDrawLog()).toMatchSnapshot();
  });
});
