/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  screen,
  fireEvent,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import {
  TimelineMarkersOverview,
  TimelineMarkersMemory,
  MIN_MARKER_WIDTH,
} from '../../components/timeline/Markers';
import { MaybeMarkerContextMenu } from '../../components/shared/MarkerContextMenu';
import { overlayFills } from '../../profile-logic/marker-styles';
import { ensureExists } from '../../utils/flow';

import type { FillRectOperation } from '../fixtures/mocks/canvas-context';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import type { TestDefinedMarker } from '../fixtures/profiles/processed-profile';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import type { FakeMouseEventInit } from '../fixtures/utils';
import {
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import {
  autoMockElementSize,
  setMockedElementSize,
} from '../fixtures/mocks/element-size';
import {
  autoMockIntersectionObserver,
  triggerIntersectionObservers,
} from '../fixtures/mocks/intersection-observer';
import { triggerResizeObservers } from '../fixtures/mocks/resize-observer';

import type { CssPixels } from 'firefox-profiler/types';

const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 300;

function setupWithMarkers(
  {
    rangeStart,
    rangeEnd,
    component,
  }: {
    rangeStart: number;
    rangeEnd: number;
    component?: typeof TimelineMarkersOverview;
  },
  ...markersPerThread: TestDefinedMarker[][]
) {
  const flushRafCalls = mockRaf();

  const profile = getProfileWithMarkers(...markersPerThread);
  const TimelineMarkersComponent = component ?? TimelineMarkersOverview;

  const renderResult = render(
    <Provider store={storeWithProfile(profile)}>
      <>
        <TimelineMarkersComponent
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          threadsKey={0}
          onSelect={() => {}}
        />
        <MaybeMarkerContextMenu />
      </>
    </Provider>
  );

  flushRafCalls();

  function getContextMenu() {
    return ensureExists(
      document.querySelector('.react-contextmenu'),
      `Couldn't find the context menu.`
    );
  }

  function tryToGetMarkerTooltip() {
    return document.querySelector('.tooltipMarker');
  }

  function clickOnMenuItem(stringOrRegexp: string | RegExp) {
    fireFullClick(screen.getByText(stringOrRegexp));
  }

  function fireMouseEvent(eventName: string, options: FakeMouseEventInit) {
    fireEvent(
      ensureExists(
        document.querySelector('canvas'),
        `Couldn't find the canvas element`
      ),
      getMouseEvent(eventName, options)
    );
  }

  function getPositioningOptions({ x, y }: { x: number; y: number }) {
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

  // Note to a future developer: the x/y values can be derived from the
  // array returned by ctx.__flushDrawLog().
  function rightClick(where: { x: CssPixels; y: CssPixels }) {
    const positioningOptions = getPositioningOptions(where);
    const canvas = ensureExists(
      document.querySelector('canvas'),
      `Couldn't find the canvas element`
    );

    // Because different components listen to different events, we trigger
    // all the right events, to be as close as possible to the real stuff.
    fireMouseEvent('mousemove', positioningOptions);
    fireFullContextMenu(canvas, positioningOptions);

    flushRafCalls();
  }

  function mouseOver(where: { x: CssPixels; y: CssPixels }) {
    const positioningOptions = getPositioningOptions(where);
    fireMouseEvent('mousemove', positioningOptions);
    flushRafCalls();
  }

  return {
    rightClick,
    mouseOver,
    getContextMenu,
    tryToGetMarkerTooltip,
    clickOnMenuItem,
    flushRafCalls,
    ...renderResult,
  };
}

describe('TimelineMarkers', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver();
  // We will be hovering over element with a tooltip. It requires root overlay
  // element to be present in DOM.
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('renders correctly overview markers', () => {
    window.devicePixelRatio = 1;

    const { container } = setupWithMarkers({ rangeStart: 0, rangeEnd: 15 }, [
      ['DOMEvent', 0, 10, { type: 'tracing', category: 'JS' }],
      ['DOMEvent', 0, 10, { type: 'tracing', category: 'JS' }],
      ['DOMEvent', 5, 15, { type: 'DOMEvent', latency: 3.7, eventType: 'msg' }],
      ['Paint', 2, 13, { type: 'tracing', category: 'Paint' }],
      ['Navigation', 2, 6, { type: 'tracing', category: 'Navigation' }],
      ['Layout', 6, 8, { type: 'tracing', category: 'Layout' }],
      // These 2 will be ignored.
      ['CC', 0, 5],
      ['GCMajor', 5, 10],
    ]);

    const drawCalls = flushDrawLog();

    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    // @ts-expect-error "must be optional"
    delete window.devicePixelRatio;
  });

  it('renders correctly memory markers', () => {
    window.devicePixelRatio = 1;

    const { container } = setupWithMarkers(
      { rangeStart: 0, rangeEnd: 15, component: TimelineMarkersMemory },
      [
        // The first one will be ignored.
        ['DOMEvent', 0, 10, { type: 'tracing', category: 'JS' }],
        ['CC', 0, 5],
        ['GCMajor', 5, 10],
      ]
    );

    const drawCalls = flushDrawLog();

    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    // @ts-expect-error "must be optional"
    delete window.devicePixelRatio;
  });

  it('does not render several dot markers in the same position', () => {
    window.devicePixelRatio = 2;

    setupWithMarkers({ rangeStart: 0, rangeEnd: 15000 }, [
      // 2 very close dot markers. They shouldn't be drawn both together.
      ['DOMEvent', 5000],
      ['DOMEvent', 5001],
      // This is a longer marker starting at the same place, it should always be drawn
      ['DOMEvent', 5001, 7000],
    ]);

    const drawCalls = flushDrawLog();

    // We filter on height to get only 1 relevant fillRect operation for each marker.
    const fillRectOperations = drawCalls.filter<FillRectOperation>(
      // @ts-expect-error "must be a type predicate"
      ([operation, , , , height]) => operation === 'fillRect' && height > 1
    );

    // Here 2 markers should be drawn: the first dot, and the long marker.
    expect(fillRectOperations).toHaveLength(2);
    expect(
      fillRectOperations.every(
        ([, , , width]) => width >= MIN_MARKER_WIDTH / window.devicePixelRatio
      )
    ).toBe(true);

    // @ts-expect-error "must be optional"
    delete window.devicePixelRatio;
  });

  it('renders the first marker tooltip when hovered', () => {
    const { tryToGetMarkerTooltip, mouseOver } = setupWithMarkers(
      { rangeStart: 0, rangeEnd: 10 },
      [
        ['DOMEvent', 0, 3],
        ['Load', 6, 10, { type: 'tracing', category: 'Navigation' }],
      ]
    );

    // Tooltip should not be visible yet.
    expect(tryToGetMarkerTooltip()).not.toBeInTheDocument();

    // The "DOMEvent" marker is drawn from 0,0 to 5,60.
    mouseOver({ x: 30, y: 2 });

    // It should be visible after hovering the first marker.
    expect(tryToGetMarkerTooltip()).toBeInTheDocument();
  });

  describe('displays context menus', () => {
    beforeEach(() => {
      // Always use fake timers when dealing with context menus.
      jest.useFakeTimers();
    });

    it('when right clicking on a marker', () => {
      const { rightClick, getContextMenu, clickOnMenuItem } = setupWithMarkers(
        { rangeStart: 0, rangeEnd: 10 },
        [['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'mousedown' }]]
      );

      // The "DOMEvent" marker is drawn from 0,0 to 5,200.
      rightClick({ x: 50, y: 2 });

      act(() => jest.runAllTimers());

      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      clickOnMenuItem('Copy description');
      expect(copy).toHaveBeenLastCalledWith('DOMEvent — mousedown');
      expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

      act(() => jest.runAllTimers());

      expect(document.querySelector('react-contextmenu')).toBeFalsy();
    });

    it('when right clicking on markers in a sequence', () => {
      const { rightClick, getContextMenu, clickOnMenuItem } = setupWithMarkers(
        { rangeStart: 0, rangeEnd: 10 },
        [
          ['DOMEvent', 0, 3],
          ['Load', 6, 10, { type: 'tracing', category: 'Navigation' }],
        ]
      );

      // The "DOMEvent" marker is drawn from 0,0 to 5,60.
      rightClick({ x: 30, y: 2 });
      act(() => jest.runAllTimers());

      // The "Navigation" marker is drawn from 0,120 to 5,200.
      rightClick({ x: 160, y: 2 });
      act(() => jest.runAllTimers());

      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      clickOnMenuItem('Copy description');
      expect(copy).toHaveBeenLastCalledWith('Load');

      expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

      act(() => jest.runAllTimers());
      expect(document.querySelector('react-contextmenu')).toBeFalsy();
    });

    it('and still highlights other markers when hovering them', () => {
      const { rightClick, mouseOver, getContextMenu } = setupWithMarkers(
        { rangeStart: 0, rangeEnd: 10 },
        [
          ['DOMEvent', 0, 3],
          ['DOMEvent', 6, 10],
        ]
      );

      // The "DOMEvent" marker is drawn from 0,0 to 5,60.
      rightClick({ x: 30, y: 2 });
      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      flushDrawLog();
      // The "Marker B" marker is drawn from 0,120 to 5,200.
      mouseOver({ x: 160, y: 1 });

      const drawCalls = flushDrawLog();

      // Expect that we have one marker with hovered color
      const callsWithHoveredColor = drawCalls.filter(
        ([, argument]) => argument === overlayFills.HOVERED
      );
      expect(callsWithHoveredColor).toHaveLength(1);
    });
  });
});

describe('TimelineMarkers with intersection observer', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver(false);

  function setup() {
    const setupResults = setupWithMarkers({ rangeStart: 0, rangeEnd: 15 }, [
      ['DOMEvent', 0, 10],
      ['DOMEvent', 0, 10],
    ]);

    /**
     * Coordinate the flushing of the requestAnimationFrame and the draw calls.
     */
    function getContextDrawCalls() {
      setupResults.flushRafCalls();
      return flushDrawLog();
    }

    return { ...setupResults, getContextDrawCalls };
  }

  it('will not draw before the intersection observer', () => {
    const { getContextDrawCalls } = setup();
    const drawCalls = getContextDrawCalls();
    // Make sure that marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );
  });

  it('will not draw after the intersection observer if it is not intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // Make sure that marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it still
    // doesn't draw it.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );
  });

  it('will draw after the intersection observer if it is intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // Make sure that marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      true
    );
  });

  it('will redraw after it becomes visible again', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // Make sure that marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      true
    );

    // Now it goes out of view again. Make sure that we don't redraw.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH * 2, height: GRAPH_HEIGHT });
    triggerResizeObservers();
    drawCalls = getContextDrawCalls();
    // It should still be not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer again and make sure that it redraws.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      true
    );
  });
});
