/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Profile } from '../../types/profile';

import * as React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent } from 'react-testing-library';
import { oneLine } from 'common-tags';

import { changeTimelineType } from '../../actions/profile-view';
import TrackThread from '../../components/timeline/TrackThread';
import { getPreviewSelection } from 'selectors/profile';
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

import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';

import type { FileIoPayload } from '../../types/markers';

// The graph is 400 pixels wide based on the getBoundingBox mock. Each stack is 100
// pixels wide. Use the value 50 to click in the middle of this stack, and
// incrementing by steps of 100 pixels to get to the next stack.
const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = 50;
const STACK_1_X_POSITION = 50;
const STACK_2_X_POSITION = 150;
const STACK_3_X_POSITION = 250;
const STACK_4_X_POSITION = 350;

/**
 * This test is asserting behavior more for the ThreadStackGraph component. The
 * ThreadActivityGraph component was added as a new default. Currently this test
 * only checks the older behavior.
 */
describe('timeline/TrackThread', function() {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function getSamplesProfile() {
    return getProfileFromTextSamples(`
      a  d  g  j
      b  e  h  k
      c  f  i  l
    `).profile;
  }

  function getMarkersProfile(
    testMarkers = [
      ['Marker A', 0, { startTime: 0, endTime: 1 }],
      ['Marker B', 1, { startTime: 1, endTime: 2 }],
      ['Marker C', 2, { startTime: 2, endTime: 3 }],
      ['Marker D', 3, { startTime: 3, endTime: 4 }],
    ]
  ) {
    const profile = getProfileWithMarkers(testMarkers);
    const [thread] = profile.threads;
    thread.name = 'GeckoMain';
    thread.processType = 'default';
    return profile;
  }

  function setup(profile: Profile) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const threadIndex = 0;
    const flushRafCalls = mockRaf();
    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

    // Note: These tests were first written with the timeline using the ThreadStackGraph.
    // This is not the default view, so dispatch an action to change to the older default
    // view.
    store.dispatch(changeTimelineType('stack'));

    const renderResult = render(
      <Provider store={store}>
        <TrackThread threadIndex={threadIndex} />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const stackGraphCanvas = () =>
      ensureExists(
        container.querySelector('.threadStackGraphCanvas'),
        `Couldn't find the stack graph canvas, with selector .threadStackGraphCanvas`
      );
    const markerCanvas = () =>
      ensureExists(
        container.querySelector(oneLine`
          .timelineMarkersGeckoMain
          .timelineMarkersCanvas
        `),
        `Couldn't find the marker canvas`
      );

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      thread: profile.threads[0],
      store,
      threadIndex,
      stackGraphCanvas,
      markerCanvas,
    };
  }

  it('matches the snapshot', () => {
    const { container } = setup(getSamplesProfile());
    expect(container.firstChild).toMatchSnapshot();
  });

  it('can click a stack in the stack graph', function() {
    const { getState, stackGraphCanvas, thread } = setup(getSamplesProfile());

    // Provide a quick helper for nicely asserting the call node path.
    const getCallNodePath = () =>
      selectedThreadSelectors
        .getSelectedCallNodePath(getState())
        .map(funcIndex =>
          thread.stringTable.getString(thread.funcTable.name[funcIndex])
        );

    fireEvent(
      stackGraphCanvas(),
      getMouseEvent('mouseup', { pageX: STACK_1_X_POSITION })
    );
    expect(getCallNodePath()).toEqual(['a', 'b', 'c']);

    fireEvent(
      stackGraphCanvas(),
      getMouseEvent('mouseup', { pageX: STACK_2_X_POSITION })
    );
    expect(getCallNodePath()).toEqual(['d', 'e', 'f']);

    fireEvent(
      stackGraphCanvas(),
      getMouseEvent('mouseup', { pageX: STACK_3_X_POSITION })
    );
    expect(getCallNodePath()).toEqual(['g', 'h', 'i']);

    fireEvent(
      stackGraphCanvas(),
      getMouseEvent('mouseup', { pageX: STACK_4_X_POSITION })
    );
    expect(getCallNodePath()).toEqual(['j', 'k', 'l']);
  });

  it('can click a marker', function() {
    const { getState, markerCanvas } = setup(getMarkersProfile());

    function clickAndGetMarkerName(pageX: number) {
      fireEvent(markerCanvas(), getMouseEvent('mousedown', { pageX }));
      fireEvent(markerCanvas(), getMouseEvent('mouseup', { pageX }));
      return getPreviewSelection(getState());
    }

    expect(clickAndGetMarkerName(STACK_1_X_POSITION)).toMatchObject({
      selectionStart: 0,
      selectionEnd: 1,
    });

    expect(clickAndGetMarkerName(STACK_2_X_POSITION)).toMatchObject({
      selectionStart: 1,
      selectionEnd: 2,
    });
  });

  it('does not add disk io markers if none are present', function() {
    const noMarkers = [];
    const { queryByTestId } = setup(getMarkersProfile(noMarkers));
    expect(queryByTestId('TimelineMarkersFileIo')).toBeFalsy();
  });

  it('adds disk io markers if they are present', function() {
    const fileIoMarker = [
      [
        'FileIO',
        2,
        ({
          type: 'FileIO',
          startTime: 2,
          endTime: 3,
          source: 'PoisionOIInterposer',
          filename: '/foo/bar/',
          operation: 'read/write',
        }: FileIoPayload),
      ],
    ];
    const { getByTestId } = setup(getMarkersProfile(fileIoMarker));
    expect(getByTestId('TimelineMarkersFileIo')).toBeTruthy();
  });
});
