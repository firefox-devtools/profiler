/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Profile, FileIoPayload } from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { oneLine } from 'common-tags';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import {
  changeTimelineType,
  changeInvertCallstack,
  changeSelectedCallNode,
} from '../../actions/profile-view';
import { TimelineTrackThread } from '../../components/timeline/TrackThread';
import { getPreviewSelection } from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ensureExists } from '../../utils/flow';

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
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

// The graph is 400 pixels wide based on the element size mock. Each stack is
// 100 pixels wide. Use the value 50 to click in the middle of this stack, and
// incrementing by steps of 100 pixels to get to the next stack.
const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = 50;

/**
 * This test is asserting behavior more for the ThreadStackGraph component. The
 * ThreadActivityGraph component was added as a new default. Currently this test
 * only checks the older behavior.
 */
describe('timeline/TrackThread', function () {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver();

  function getSamplesProfile() {
    return getProfileFromTextSamples(`
      a  d  g  j
      b  e  h  k
      c  f  i  l
    `).profile;
  }

  function getMarkersProfile(
    testMarkers = [
      ['Marker A', 0],
      ['Marker B', 1],
      ['Marker C', 2],
      ['Marker D', 3],
    ]
  ) {
    const profile = getProfileWithMarkers(testMarkers);
    const [thread] = profile.threads;
    thread.name = 'GeckoMain';
    thread.isMainThread = true;
    thread.processType = 'default';
    return profile;
  }

  function setup(profile: Profile) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const threadIndex = 0;
    const flushRafCalls = mockRaf();

    type Coordinate = { pageX: number, pageY: number };

    // Look through the draw log and find the center of a specific fillRect
    // call. This is a good way to know where the canvas drew something.
    function getFillRectCenterByIndex(log: any[], index: number): Coordinate {
      type FillRectCall = [string, number, number, number, number];
      const calls: FillRectCall[] = log.filter(
        (call) => call[0] === 'fillRect'
      );
      const call = calls[index];
      if (!call) {
        console.error(log);
        throw new Error(`Could not find a fillRect call at ${index}.`);
      }
      const [, x, y, w, h] = call;
      return { pageX: x + w * 0.5, pageY: y + h * 0.5 };
    }

    // Note: These tests were first written with the timeline using the ThreadStackGraph.
    // This is not the default view, so dispatch an action to change to the older default
    // view.
    store.dispatch(changeTimelineType('stack'));

    const renderResult = render(
      <Provider store={store}>
        <TimelineTrackThread
          threadsKey={threadIndex}
          trackType="expanded"
          trackName="Test Track"
        />
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
      getFillRectCenterByIndex,
    };
  }

  it('matches the snapshot for the component', () => {
    const { container } = setup(getSamplesProfile());
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    setup(getSamplesProfile());
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('can click a stack in the stack graph in normal call trees', function () {
    const {
      getState,
      stackGraphCanvas,
      profile,
      thread,
      getFillRectCenterByIndex,
    } = setup(getSamplesProfile());

    const log = flushDrawLog();

    // Provide a quick helper for nicely asserting the call node path.
    const getCallNodePath = () =>
      selectedThreadSelectors
        .getSelectedCallNodePath(getState())
        .map(
          (funcIndex) =>
            profile.shared.stringArray[thread.funcTable.name[funcIndex]]
        );

    fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 0));
    expect(getCallNodePath()).toEqual(['a', 'b', 'c']);

    fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 1));
    expect(getCallNodePath()).toEqual(['d', 'e', 'f']);

    fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 2));
    expect(getCallNodePath()).toEqual(['g', 'h', 'i']);

    fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 3));
    expect(getCallNodePath()).toEqual(['j', 'k', 'l']);
  });

  it('can click a stack in the stack graph in inverted call trees', function () {
    const {
      dispatch,
      getState,
      stackGraphCanvas,
      profile,
      thread,
      getFillRectCenterByIndex,
    } = setup(getSamplesProfile());

    // Provide a quick helper for nicely asserting the call node path.
    const getCallNodePath = () =>
      selectedThreadSelectors
        .getSelectedCallNodePath(getState())
        .map(
          (funcIndex) =>
            profile.shared.stringArray[thread.funcTable.name[funcIndex]]
        );

    function changeInvertCallstackAndGetDrawLog(value) {
      // We don't want a selected stack graph to change fillRect ordering.
      act(() => {
        dispatch(changeSelectedCallNode(0, []));
      });
      flushDrawLog();
      act(() => {
        dispatch(changeInvertCallstack(value));
      });
      return flushDrawLog();
    }

    // Switch to "inverted" mode to test with this state
    {
      const log = changeInvertCallstackAndGetDrawLog(true);

      fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 0));
      expect(getCallNodePath()).toEqual(['c']);

      fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 2));
      expect(getCallNodePath()).toEqual(['i']);
    }
    {
      // Switch back to "uninverted" mode
      const log = changeInvertCallstackAndGetDrawLog(false);

      fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 0));
      expect(getCallNodePath()).toEqual(['a', 'b', 'c']);

      fireFullClick(stackGraphCanvas(), getFillRectCenterByIndex(log, 2));
      expect(getCallNodePath()).toEqual(['g', 'h', 'i']);
    }
  });

  it('can click a marker', function () {
    const { getState, markerCanvas, getFillRectCenterByIndex } = setup(
      getMarkersProfile([
        ['DOMEvent', 0, 4],
        ['DOMEvent', 4, 8],
      ])
    );

    const log = flushDrawLog();

    function clickAndGetMarkerName(event) {
      fireFullClick(markerCanvas(), event);
      return getPreviewSelection(getState());
    }

    // Currently markers are drawn with 3 fillRects, the middle of the three is the
    // big interesting one. If this test breaks, likely the drawing strategy
    // has changed.
    const determineIndex = (i) => i * 3 + 1;

    expect(
      clickAndGetMarkerName(getFillRectCenterByIndex(log, determineIndex(0)))
    ).toMatchObject({
      selectionStart: 0,
      selectionEnd: 4,
    });

    expect(
      clickAndGetMarkerName(getFillRectCenterByIndex(log, determineIndex(1)))
    ).toMatchObject({
      selectionStart: 4,
      selectionEnd: 8,
    });
  });

  it('does not add disk io markers if none are present', function () {
    const noMarkers = [];
    const { queryByTestId } = setup(getMarkersProfile(noMarkers));
    expect(queryByTestId('TimelineMarkersFileIo')).not.toBeInTheDocument();
  });

  it('adds file io markers if they are present', function () {
    const fileIoMarker = [
      [
        'FileIO',
        2,
        3,
        ({
          type: 'FileIO',
          source: 'PoisionOIInterposer',
          filename: '/foo/bar/',
          operation: 'read/write',
        }: FileIoPayload),
      ],
    ];
    const { getByTestId } = setup(getMarkersProfile(fileIoMarker));
    expect(getByTestId('TimelineMarkersFileIo')).toBeInTheDocument();
  });

  it('does not add off-thread file io markers even if they are present', function () {
    const fileIoMarker = [
      [
        'FileIO',
        2,
        3,
        ({
          type: 'FileIO',
          source: 'PoisionOIInterposer',
          filename: '/foo/bar/',
          operation: 'read/write',
          threadId: 123,
        }: FileIoPayload),
      ],
    ];
    const { queryByTestId } = setup(getMarkersProfile(fileIoMarker));
    expect(queryByTestId('TimelineMarkersFileIo')).not.toBeInTheDocument();
  });
});
