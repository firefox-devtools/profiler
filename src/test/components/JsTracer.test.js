/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import JsTracer from '../../components/js-tracer';
import { mount } from 'enzyme';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { getProfileWithJsTracerEvents } from '../fixtures/profiles/processed-profile';
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
    events: Array<*>,
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

    const view = mount(
      <Provider store={store}>
        <JsTracer />
      </Provider>
    );
    if (skipLoadingScreen) {
      // Have React show the loading screen.
      flushRafCalls();
      // Have React show our new component, and schedule a draw call.
      flushRafCalls();
      // Now flush once more to actually draw to the screen.
      flushRafCalls();
      view.update();
    }

    const getJsTracerChartCanvas = () => view.find('canvas').first();
    const getChangeJsTracerSummaryCheckbox = () =>
      view.find('.jsTracerSettingsCheckbox');

    return {
      dispatch,
      getState,
      view,
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
    const { view, flushRafCalls } = setup({
      skipLoadingScreen: false,
      events: simpleTracerEvents,
    });
    expect(view.find('canvas').length).toEqual(0);
    // Flush twice, as the canvas defers until after React updates.
    flushRafCalls();
    flushRafCalls();
    view.update();
    expect(view.find('canvas').length).toEqual(1);
  });

  it('matches the snapshot for the loading screen', () => {
    const { view } = setup({
      skipLoadingScreen: false,
      events: simpleTracerEvents,
    });
    expect(view).toMatchSnapshot();
  });

  it('matches the snapshot for empty reasons screen', () => {
    const { view } = setup({
      skipLoadingScreen: true,
      events: [],
    });
    expect(view).toMatchSnapshot();
  });

  it('matches the snapshot for the chart', () => {
    const { view } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    expect(view).toMatchSnapshot();
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
    getChangeJsTracerSummaryCheckbox().simulate('change');
    expect(getShowJsTracerSummary(getState())).toEqual(true);
  });

  it('matches the snapshot for an inverted draw call', function() {
    const { getChangeJsTracerSummaryCheckbox, ctx } = setup({
      skipLoadingScreen: true,
      events: simpleTracerEvents,
    });
    getChangeJsTracerSummaryCheckbox().simulate('change');
    expect(ctx.__flushDrawLog()).toMatchSnapshot();
  });
});
