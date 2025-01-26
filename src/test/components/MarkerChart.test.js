/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { BLUE_60 } from 'photon-colors';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  screen,
  fireEvent,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { changeMarkersSearchString } from '../../actions/profile-view';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import { MarkerChart } from '../../components/marker-chart';
import { MaybeMarkerContextMenu } from '../../components/shared/MarkerContextMenu';
import { changeSelectedTab } from '../../actions/app';
import { changeTimelineTrackOrganization } from '../../actions/receive-profile';
import { getPreviewSelection } from '../../selectors/profile';
import { ensureExists } from '../../utils/flow';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithMarkers,
  addActiveTabInformationToProfile,
  addMarkersToThreadWithCorrespondingSamples,
  getUserTiming,
  type TestDefinedMarkers,
} from '../fixtures/profiles/processed-profile';
import {
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
  findFillTextPositionFromDrawLog,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

import type { CssPixels } from 'firefox-profiler/types';

const MARKERS: TestDefinedMarkers = [
  ['Marker A', 0, 10],
  ['Marker A', 0, 10],
  ['Marker A', 11, 17], // 17 is chosen on purpose so that we can test rounding on integer pixels
  [
    'Very very very very very very Very very very very very very Very very very very very very Very very very very very very Very very very very very very long Marker D',
    5,
    15,
  ],
  ['Dot marker E', 4, null],
  ['Non-interval marker F without data', 7, null],
  [
    'Marker G type DOMEvent',
    5,
    10,
    {
      type: 'DOMEvent',
      eventType: 'click',
    },
  ],
  [
    'Marker H with no start',
    0,
    3,
    {
      type: 'tracing',
      category: 'Paint',
    },
  ],
  [
    'Marker H with no end',
    9,
    10,
    {
      type: 'tracing',
      category: 'Paint',
    },
  ],
  getUserTiming('Marker B', 2, 6),
];

function setupWithProfile(profile) {
  const flushRafCalls = mockRaf();

  const store = storeWithProfile(profile);

  store.dispatch(changeSelectedTab('marker-chart'));

  const renderResult = render(
    <Provider store={store}>
      <>
        <MaybeMarkerContextMenu />
        <MarkerChart />
      </>
    </Provider>
  );

  const { container } = renderResult;

  function fireMouseEvent(eventName, options) {
    fireEvent(
      ensureExists(
        container.querySelector('canvas'),
        `Couldn't find the canvas element`
      ),
      getMouseEvent(eventName, options)
    );
  }

  return {
    ...renderResult,
    ...store,
    flushRafCalls,
    fireMouseEvent,
  };
}

describe('MarkerChart', function () {
  const containerWidth = 200 + TIMELINE_MARGIN_LEFT + TIMELINE_MARGIN_RIGHT;
  const containerHeight = 300;
  autoMockCanvasContext();
  autoMockElementSize({
    width: containerWidth,
    height: containerHeight,
  });
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('renders the normal marker chart and matches the snapshot', () => {
    window.devicePixelRatio = 2;

    const profile = getProfileWithMarkers([...MARKERS]);
    const { container, flushRafCalls, dispatch } = setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();

    const drawCalls = flushDrawLog();
    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.devicePixelRatio;
  });

  it('sets a correct size for the marker chart even when dPR is non-integer', () => {
    window.devicePixelRatio = 12 / 11;

    const profile = getProfileWithMarkers([...MARKERS]);
    const { flushRafCalls, dispatch } = setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();

    const canvasElement = ensureExists(document.querySelector('canvas'));
    const canvasCssWidth = parseFloat(canvasElement.style.width);
    const canvasCssHeight = parseFloat(canvasElement.style.height);

    // Always smaller than the container, so that it fits the available space
    expect(canvasCssWidth).toBeLessThanOrEqual(containerWidth);
    expect(canvasCssHeight).toBeLessThanOrEqual(containerHeight);

    // The CSS size needs to match with the canvas size so that canvas pixels
    // are aligned with device pixels.
    expect(canvasCssWidth * window.devicePixelRatio).toEqual(
      canvasElement.width
    );
    expect(canvasCssHeight * window.devicePixelRatio).toEqual(
      canvasElement.height
    );

    expect(canvasElement).toMatchSnapshot();

    delete window.devicePixelRatio;
  });

  it('does not render several small markers on the same pixel', () => {
    window.devicePixelRatio = 1;
    const rowName = 'TestMarker';

    const markers = [
      // DIAMOND [RENDERED]: This marker defines the start of our range.
      [rowName, 0],
      // DIAMOND [RENDERED]: This is the first instant marker, so it's rendered.
      [rowName, 5000],
      // RECTANGLE [RENDERED]: This marker has a duration, but it's very small,
      // so it's rendered as a small rectangle. It's rendered because it's the the first.
      [rowName, 5001, 5001.1],
      // DIAMOND [NOT-RENDERED]: The second instant marker, so it's not rendered.
      [rowName, 5002],
      // RECTANGLE [NOT-RENDERED]: This marker has a duration, but it's very small, and would get
      // rendered as 1 pixel wide rectangle if it was rendered. But it's not because it's close to
      // the previous one.
      [rowName, 5002, 5002.1],
      // RECTANGLE [RENDERED]: This is a longer marker, it should always be drawn even if it starts
      // at the same location as a small marker
      [rowName, 5002.1, 7000],
      // DIAMOND [RENDERED]: Add a final marker that's quite far away to have a big time range.
      [rowName, 15000],
    ];

    const profile = getProfileWithMarkers(markers);
    const { flushRafCalls } = setupWithProfile(profile);
    flushRafCalls();

    const drawCalls = flushDrawLog();

    // Check that we have 3 diamonds (initial instant marker, first "middle"
    // instant marker, and last marker). We use the moveTo operation as a proxy
    // to know that a diamond is drawn.
    const diamondOperations = drawCalls.filter(
      ([operation]) => operation === 'moveTo'
    );
    expect(diamondOperations).toHaveLength(3);

    // Check that all X, Y values are different
    const diamondOperationsXY = new Set(
      diamondOperations.map(([, x, y]) => `${Math.round(x)};${Math.round(y)}`)
    );
    expect(diamondOperationsXY.size).toBe(3);

    // Check that we have a fillRect operation for the first small interval
    // marker. We filter also using w or h to filter out the initial clearing
    // fillRect operation as well as the separators.
    const fillRectOperations = drawCalls.filter(
      ([operation, , , w, h]) =>
        operation === 'fillRect' &&
        w !== containerWidth - TIMELINE_MARGIN_RIGHT &&
        h !== containerHeight
    );
    expect(fillRectOperations).toHaveLength(1);

    // Check that the rect operation for the later longer marker is present.
    const rectOperations = drawCalls.filter(
      ([operation]) => operation === 'rect'
    );
    // We'll actually have 2 rect operations, because we also have a rect first
    // for the initial `clip` operation, and one for the longer marker.
    expect(rectOperations).toHaveLength(2);

    delete window.devicePixelRatio;
  });

  it('renders the hoveredItem markers properly', () => {
    window.devicePixelRatio = 1;

    const profile = getProfileWithMarkers(MARKERS);
    const { flushRafCalls, dispatch, fireMouseEvent } =
      setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();
    // No tooltip displayed yet
    expect(document.querySelector('.tooltip')).toBeFalsy();

    {
      const drawLog = flushDrawLog();

      const { x, y } = findFillTextPositionFromDrawLog(drawLog, 'Marker B');

      // Move the mouse on top of an item.
      fireMouseEvent('mousemove', {
        offsetX: x,
        offsetY: y,
        pageX: x,
        pageY: y,
      });
    }

    flushRafCalls();

    const drawLog = flushDrawLog();
    if (drawLog.length === 0) {
      throw new Error('The mouse move produced no draw commands.');
    }
    expect(drawLog).toMatchSnapshot();

    // The tooltip should be displayed
    expect(
      ensureExists(
        document.querySelector('.tooltip'),
        'A tooltip component must exist for this test.'
      )
    ).toMatchSnapshot();
  });

  it('persists the selected marker tooltips properly', () => {
    window.devicePixelRatio = 1;

    const profile = getProfileWithMarkers(MARKERS);
    const { flushRafCalls, dispatch, fireMouseEvent, container } =
      setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();

    // No tooltip displayed yet
    expect(document.querySelector('.tooltip')).toBeFalsy();

    function leftClick(pos: { x: CssPixels, y: CssPixels }) {
      const positioningOptions = {
        offsetX: pos.x,
        offsetY: pos.y,
        pageX: pos.x,
        pageY: pos.y,
      };
      const canvas = ensureExists(
        container.querySelector('canvas'),
        `Couldn't find the canvas element`
      );
      // Because different components listen to different events, we trigger
      // all the right events, to be as close as possible to the real stuff.
      fireMouseEvent('mousemove', positioningOptions);
      fireFullClick(canvas, positioningOptions);
      flushRafCalls();
    }

    const drawLog = flushDrawLog();
    const position = findFillTextPositionFromDrawLog(drawLog, 'Marker B');
    leftClick(position);

    // The tooltip should be displayed
    expect(
      ensureExists(
        document.querySelector('.tooltip'),
        'A tooltip component must exist for this test.'
      )
    ).toMatchSnapshot();

    // Move the mouse outside of the marker.
    fireMouseEvent('mousemove', {
      offsetX: 0,
      offsetY: 0,
      pageX: 0,
      pageY: 0,
    });

    // Make sure that we have the tooltip persisted.
    expect(document.querySelector('.tooltip')).toBeTruthy();

    // Click outside of the marker.
    leftClick({ x: 0, y: 0 });

    // Now the tooltip should not be displayed.
    expect(document.querySelector('.tooltip')).toBeFalsy();
  });

  it('only renders a single row when hovering', () => {
    window.devicePixelRatio = 1;

    const profile = getProfileWithMarkers(MARKERS);
    const { flushRafCalls, dispatch, fireMouseEvent } =
      setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();

    const drawLogBefore = flushDrawLog();

    const { x, y } = findFillTextPositionFromDrawLog(drawLogBefore, 'Marker B');

    // Move the mouse on top of an item.
    fireMouseEvent('mousemove', {
      offsetX: x,
      offsetY: y,
      pageX: x,
      pageY: y,
    });

    flushRafCalls();

    const drawLogAfter = flushDrawLog();

    // As a rough test of better performance, assert that at least half as many draw
    // calls were issued for a hovered event.
    expect(drawLogBefore.length > drawLogAfter.length * 2).toBe(true);
  });

  it('changes the mouse time position when the mouse moves', () => {
    window.devicePixelRatio = 1;

    const profile = getProfileWithMarkers(MARKERS);
    const { flushRafCalls, getState, dispatch, fireMouseEvent } =
      setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();

    const drawLogBefore = flushDrawLog();

    // Expect the mouseTimePosition to not be set at the beginning of the test.
    expect(getState().profileView.viewOptions.mouseTimePosition).toBeNull();

    // Move the mouse on top of an item, ensure mouseTimePosition is set.
    const { x, y } = findFillTextPositionFromDrawLog(drawLogBefore, 'Marker B');
    fireMouseEvent('mousemove', {
      offsetX: x,
      offsetY: y,
      pageX: x,
      pageY: y,
    });
    const mouseTimePosition =
      getState().profileView.viewOptions.mouseTimePosition;
    expect(typeof mouseTimePosition).toEqual('number');

    // Move the mouse on top of another item, ensure mouseTimePosition changed.
    const { x: x2, y: y2 } = findFillTextPositionFromDrawLog(
      drawLogBefore,
      'Marker A'
    );
    expect(x2).not.toEqual(x);
    fireMouseEvent('mousemove', {
      offsetX: x2,
      offsetY: y2,
      pageX: x2,
      pageY: y2,
    });
    expect(getState().profileView.viewOptions.mouseTimePosition).not.toEqual(
      mouseTimePosition
    );

    // Move the mouse out of the marker chart, ensure mouseTimePosition is no
    // longer set.
    // React uses mouseover/mouseout events to implement mouseenter/mouseleave.
    // See https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/react-dom/src/events/EnterLeaveEventPlugin.js#L24-L31
    fireMouseEvent('mouseout', {});

    expect(getState().profileView.viewOptions.mouseTimePosition).toBeNull();
  });

  describe('context menus', () => {
    beforeEach(() => {
      // Always use fake timers when dealing with context menus.
      jest.useFakeTimers();
    });

    function setupForContextMenus() {
      const profile = getProfileWithMarkers([
        getUserTiming('UserTiming A', 0, 10), // 0 -> 10
        getUserTiming('UserTiming B', 2, 6), // 2 -> 8
      ]);
      const setupResult = setupWithProfile(profile);
      const { flushRafCalls, dispatch, fireMouseEvent, container } =
        setupResult;

      dispatch(changeSelectedTab('marker-chart'));
      flushRafCalls();
      const drawLog = flushDrawLog();

      function getPositioningOptions({ x, y }) {
        // These positioning options will be sent to all our mouse events. Note
        // that the values aren't really consistent, especially offsetY and
        // pageY shouldn't be the same, but in the context of our test this will
        // be good enough.
        // pageX/Y values control the position of the tooltip so it's not super
        // important.
        // offsetX/Y are more important as they're used to find which node is
        // actually clicked.
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

      function leftClick(where: { x: CssPixels, y: CssPixels }) {
        const positioningOptions = getPositioningOptions(where);
        const canvas = ensureExists(
          container.querySelector('canvas'),
          `Couldn't find the canvas element`
        );
        // Because different components listen to different events, we trigger
        // all the right events, to be as close as possible to the real stuff.
        fireMouseEvent('mousemove', positioningOptions);
        fireFullClick(canvas, positioningOptions);
        flushRafCalls();
      }

      function rightClick(where: { x: CssPixels, y: CssPixels }) {
        const positioningOptions = getPositioningOptions(where);
        const canvas = ensureExists(
          container.querySelector('canvas'),
          `Couldn't find the canvas element`
        );
        // Because different components listen to different events, we trigger
        // all the right events, to be as close as possible to the real stuff.
        fireMouseEvent('mousemove', positioningOptions);
        fireFullContextMenu(canvas, positioningOptions);
        flushRafCalls();
      }

      function mouseOver(where: { x: CssPixels, y: CssPixels }) {
        const positioningOptions = getPositioningOptions(where);
        fireMouseEvent('mousemove', positioningOptions);
        flushRafCalls();
      }

      function clickOnMenuItem(stringOrRegexp) {
        const menuItem = screen.getByRole('menuitem', { name: stringOrRegexp });
        fireFullClick(menuItem);
      }

      function findFillTextPosition(fillText: string): {|
        x: number,
        y: number,
      |} {
        return findFillTextPositionFromDrawLog(drawLog, fillText);
      }

      const getContextMenu = () =>
        ensureExists(
          container.querySelector('.react-contextmenu'),
          `Couldn't find the context menu.`
        );

      return {
        ...setupResult,
        leftClick,
        rightClick,
        mouseOver,
        getContextMenu,
        findFillTextPosition,
        clickOnMenuItem,
      };
    }

    it('displays when right clicking on a marker', () => {
      const {
        rightClick,
        clickOnMenuItem,
        getContextMenu,
        findFillTextPosition,
      } = setupForContextMenus();

      rightClick(findFillTextPosition('UserTiming A'));

      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
      expect(getContextMenu()).toMatchSnapshot();

      clickOnMenuItem('Copy description');
      expect(copy).toHaveBeenLastCalledWith('UserTiming — UserTiming A');
      expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

      act(() => jest.runAllTimers());
      expect(document.querySelector('react-contextmenu')).toBeFalsy();
    });

    it('displays when right clicking on markers in a sequence', () => {
      const {
        rightClick,
        clickOnMenuItem,
        getContextMenu,
        findFillTextPosition,
      } = setupForContextMenus();

      rightClick(findFillTextPosition('UserTiming A'));
      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      rightClick(findFillTextPosition('UserTiming B'));
      jest.runAllTimers();

      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
      clickOnMenuItem('Copy description');
      expect(copy).toHaveBeenLastCalledWith('UserTiming — UserTiming B');
    });

    it('displays and still highlights other markers when hovering them', () => {
      const { rightClick, mouseOver, getContextMenu, findFillTextPosition } =
        setupForContextMenus();

      rightClick(findFillTextPosition('UserTiming A'));
      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      flushDrawLog();
      // The "click" DOMEvent marker is drawn from 213,129 to 275.5,109.
      mouseOver(findFillTextPosition('UserTiming B'));

      // Expect that we have 2 markers drawn with this color.
      const drawCalls = flushDrawLog();
      const callsWithHighlightColor = drawCalls.filter(
        ([operation, argument]) =>
          operation === 'set fillStyle' && argument === BLUE_60
      );
      expect(callsWithHighlightColor).toHaveLength(2);
    });

    it('allows selecting markers and highlights them', () => {
      const { leftClick, findFillTextPosition, getState } =
        setupForContextMenus();

      function getHighlightCalls() {
        const drawCalls = flushDrawLog();
        return drawCalls.filter(
          ([operation, argument]) =>
            operation === 'set fillStyle' && argument === BLUE_60
        );
      }

      // No highlights have been drawn yet.
      expect(getHighlightCalls()).toHaveLength(0);
      expect(selectedThreadSelectors.getSelectedMarker(getState())).toBe(null);

      // Clicking on a marker highlights it.
      leftClick(findFillTextPosition('UserTiming A'));
      expect(getHighlightCalls()).toHaveLength(1);
      const marker: any = selectedThreadSelectors.getSelectedMarker(getState());
      expect(marker.data.name).toBe('UserTiming A');

      // Clicking off of a marker unselects it.
      leftClick({ x: 0, y: 0 });
      expect(getHighlightCalls()).toHaveLength(0);
      expect(selectedThreadSelectors.getSelectedMarker(getState())).toBe(null);
    });

    it('changes selection range when clicking on submenu', () => {
      const {
        rightClick,
        clickOnMenuItem,
        getContextMenu,
        findFillTextPosition,
        getState,
      } = setupForContextMenus();

      rightClick(findFillTextPosition('UserTiming B'));

      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      clickOnMenuItem(/start.*start/i);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 2,
        selectionEnd: 11,
      });

      clickOnMenuItem(/start.*end/i);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 8,
        selectionEnd: 11,
      });

      // This one doesn't work because it's disabled.
      clickOnMenuItem(/end.*start/i);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 8,
        selectionEnd: 11,
      });

      // Reset the selection by using the other marker.
      rightClick(findFillTextPosition('UserTiming A'));
      clickOnMenuItem(/start.*start/i);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 11,
      });

      rightClick(findFillTextPosition('UserTiming B'));

      clickOnMenuItem(/end.*start/i);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 2,
      });

      clickOnMenuItem(/end.*end/i);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 8,
      });
    });

    it('changes selection range using the full marker duration', () => {
      const { rightClick, clickOnMenuItem, findFillTextPosition, getState } =
        setupForContextMenus();

      // Now we're testing the selection using the full marker's duration.
      rightClick(findFillTextPosition('UserTiming B'));
      clickOnMenuItem(/duration/);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 2,
        selectionEnd: 8,
      });

      rightClick(findFillTextPosition('UserTiming A'));
      clickOnMenuItem(/duration/);
      expect(getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 10,
      });
    });
  });

  describe('with search strings', function () {
    function getFillTextCalls(drawCalls) {
      return drawCalls
        .filter(([methodName]) => methodName === 'fillText')
        .map(([_, text]) => text);
    }

    const searchString = 'Dot marker E';

    it('renders lots of markers initially', function () {
      const profile = getProfileWithMarkers(MARKERS);
      const { flushRafCalls } = setupWithProfile(profile);

      flushRafCalls();
      const text = getFillTextCalls(flushDrawLog());
      expect(text.length).toBeGreaterThan(1);
      // Check that our test search string is in here:
      expect(text.filter((t) => t === searchString).length).toBe(1);
    });

    it('renders only the marker that was searched for', function () {
      const profile = getProfileWithMarkers(MARKERS);
      const { flushRafCalls, dispatch } = setupWithProfile(profile);

      // Flush out any existing draw calls.
      flushRafCalls();
      flushDrawLog();

      // Update the chart with a search string.
      act(() => {
        dispatch(changeMarkersSearchString(searchString));
      });
      flushRafCalls();

      const text = getFillTextCalls(flushDrawLog());
      expect(text).toEqual(['Dot marker E', 'Other']);
    });
  });

  describe('EmptyReasons', () => {
    it('shows a reason when a profile has no markers', () => {
      const profile = getProfileWithMarkers([]);
      const { dispatch, container } = setupWithProfile(profile);

      dispatch(changeSelectedTab('marker-chart'));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it("shows a reason when a profile's markers have been filtered out", () => {
      const profile = getProfileWithMarkers(MARKERS);
      const { dispatch, container } = setupWithProfile(profile);

      act(() => {
        dispatch(changeSelectedTab('marker-chart'));
      });
      act(() => {
        dispatch(changeMarkersSearchString('MATCH_NOTHING'));
      });
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });
  });

  describe('with active tab', () => {
    function setupForActiveTab() {
      // Setup the profile data for active tab.
      const { profile, firstTabTabID, parentInnerWindowIDsWithChildren } =
        addActiveTabInformationToProfile(getProfileWithMarkers([...MARKERS]));
      profile.meta.configuration = {
        threads: [],
        features: [],
        capacity: 1000000,
        activeTabID: firstTabTabID,
      };
      addMarkersToThreadWithCorrespondingSamples(
        profile.threads[0],
        profile.shared,
        [
          [
            'Marker Navigation',
            3,
            null,
            {
              type: 'tracing',
              category: 'Navigation',
              innerWindowID: parentInnerWindowIDsWithChildren,
            },
          ],
          [
            'Marker DomEvent',
            6,
            13,
            {
              type: 'DOMEvent',
              latency: 7,
              eventType: 'click',
              innerWindowID: parentInnerWindowIDsWithChildren,
            },
          ],
        ]
      );

      const setupResult = setupWithProfile(profile);
      // Switch to active tab view.
      act(() => {
        setupResult.dispatch(
          changeTimelineTrackOrganization({
            type: 'active-tab',
            tabID: firstTabTabID,
          })
        );
      });

      return {
        ...setupResult,
      };
    }

    it('renders the marker chart and matches the snapshot', () => {
      window.devicePixelRatio = 2;
      const { dispatch, flushRafCalls, container } = setupForActiveTab();

      dispatch(changeSelectedTab('marker-chart'));
      flushRafCalls();

      const drawCalls = flushDrawLog();
      expect(container.firstChild).toMatchSnapshot();
      expect(drawCalls).toMatchSnapshot();

      delete window.devicePixelRatio;
    });

    it('renders the hovered marker properly', () => {
      window.devicePixelRatio = 1;

      const { dispatch, flushRafCalls, fireMouseEvent } = setupForActiveTab();

      dispatch(changeSelectedTab('marker-chart'));
      flushRafCalls();
      // No tooltip displayed yet
      expect(document.querySelector('.tooltip')).toBeFalsy();

      {
        const drawLog = flushDrawLog();

        // Find the DomEvent with the eventType 'click'.
        const { x, y } = findFillTextPositionFromDrawLog(drawLog, 'click');

        // Move the mouse on top of an item.
        fireMouseEvent('mousemove', {
          offsetX: x,
          offsetY: y,
          pageX: x,
          pageY: y,
        });
      }

      flushRafCalls();

      const drawLog = flushDrawLog();
      if (drawLog.length === 0) {
        throw new Error('The mouse move produced no draw commands.');
      }
      expect(drawLog).toMatchSnapshot();

      // The tooltip should be displayed
      expect(
        ensureExists(
          document.querySelector('.tooltip'),
          'A tooltip component must exist for this test.'
        )
      ).toMatchSnapshot();
    });

    it('does not render the hovered label', () => {
      window.devicePixelRatio = 1;

      const { dispatch, flushRafCalls, fireMouseEvent } = setupForActiveTab();

      dispatch(changeSelectedTab('marker-chart'));
      flushRafCalls();

      const getLabelFromDrawLog = (drawLog, markerLabel) =>
        drawLog.filter(
          ([operation, text]) =>
            operation === 'fillText' && text === markerLabel
        );

      {
        // First make sure that the marker label is present.
        const drawLog = flushDrawLog();
        expect(getLabelFromDrawLog(drawLog, 'Marker DomEvent')).toHaveLength(1);

        // Find the DomEvent label.
        const { x, y } = findFillTextPositionFromDrawLog(
          drawLog,
          'Marker DomEvent'
        );

        // Move the mouse on top of the label.
        fireMouseEvent('mousemove', {
          offsetX: x,
          offsetY: y,
          pageX: x,
          pageY: y,
        });
      }

      flushRafCalls();

      const drawLog = flushDrawLog();
      if (drawLog.length === 0) {
        throw new Error('The mouse move produced no draw commands.');
      }

      // Now, since we hovered over the label, it should not be rendered.
      expect(getLabelFromDrawLog(drawLog, 'Marker DomEvent')).toHaveLength(0);
      expect(drawLog).toMatchSnapshot();
    });
  });
});
