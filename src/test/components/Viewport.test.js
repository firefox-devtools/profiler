/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import { withChartViewport } from '../../components/shared/chart/Viewport';
import {
  getCommittedRange,
  getPreviewSelection,
} from '../../reducers/profile-view';

import { changeSidebarOpenState } from '../../actions/app';

import explicitConnect from '../../utils/connect';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox, getMouseEvent } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

import type { Milliseconds } from '../../types/units';

// The following define the magic values used for the mocked bounding box of the
// the rendered component.
const BOUNDING_BOX_WIDTH = 300;
const BOUNDING_BOX_HEIGHT = 100;
const BOUNDING_BOX_LEFT = 5;
const BOUNDING_BOX_TOP = 7;

// The maximum zoom is required by the viewportProps, and is defined as 0.1 to be
// a reasonable (but arbitrary) limit to zoom in.
const MAXIMUM_ZOOM = 0.1;

// Various tests assert the behavior of the viewport depending on whether it's larger
// or smaller than the bounding box. Provide a larger viewport height, and a smaller
// one.
const MAX_VIEWPORT_HEIGHT = BOUNDING_BOX_HEIGHT * 3;
const SMALL_MAX_VIEWPORT_HEIGHT = BOUNDING_BOX_HEIGHT * 0.2;

describe('Viewport', function() {
  it('matches the component snapshot', () => {
    const { view } = setup();
    expect(view).toMatchSnapshot();
    // Trigger any unmounting behavior handlers, just make sure it doesn't
    // throw any errors.
    view.unmount();
  });

  it('renders the wrapped chart component', () => {
    const { view } = setup();
    expect(view.find('#dummy-chart').length).toBe(1);
  });

  it('provides a viewport', () => {
    const { getChartViewport } = setup();
    const viewport = getChartViewport();
    expect(viewport).toEqual({
      containerWidth: BOUNDING_BOX_WIDTH,
      containerHeight: BOUNDING_BOX_HEIGHT,
      viewportLeft: 0,
      viewportRight: 1,
      viewportTop: 0,
      viewportBottom: BOUNDING_BOX_HEIGHT,
      isDragging: false,
      isSizeSet: true,
      // Just pass the function through.
      moveViewport: viewport.moveViewport,
    });
  });

  describe('scrolling hint', function() {
    it('can show a shift scrolling hint', function() {
      jest.useFakeTimers();
      const { view, scroll } = setup();
      const isTimerVisible = () =>
        !view.find('.chartViewportShiftScroll').hasClass('hidden');

      // No hint is shown.
      expect(isTimerVisible()).toBe(false);

      // Scroll a bit to show the menu
      scroll({ deltaY: 10 });
      expect(isTimerVisible()).toBe(true);

      // Run the setTimeout, the menu should disappear.
      jest.runAllTimers();
      view.update();
      expect(isTimerVisible()).toBe(false);
    });

    it('will not show a shift scrolling hint after zooming once', function() {
      const { view, scroll } = setup();
      const isTimerVisible = () =>
        !view.find('.chartViewportShiftScroll').hasClass('hidden');

      // No hint is shown at the beginning.
      expect(isTimerVisible()).toBe(false);

      // Zoom in a bit.
      scroll({ deltaY: 10, shiftKey: true });
      expect(isTimerVisible()).toBe(false);

      // Now scroll, no hint should show.
      scroll({ deltaY: 10 });
      expect(isTimerVisible()).toBe(false);
    });
  });

  describe('scrolling up and down', function() {
    it('scrolls the viewport down using the mousewheel', () => {
      const { scrollAndGetViewport, getChartViewport } = setup();
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: BOUNDING_BOX_HEIGHT,
      });
      const deltaY = 10;
      expect(scrollAndGetViewport({ deltaY: 10 })).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: deltaY,
        viewportBottom: BOUNDING_BOX_HEIGHT + deltaY,
      });
    });

    it('cannot scroll past the bottom of the viewport', () => {
      const { scrollAndGetViewport } = setup();
      expect(scrollAndGetViewport({ deltaY: 1000 })).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: MAX_VIEWPORT_HEIGHT - BOUNDING_BOX_HEIGHT,
        viewportBottom: MAX_VIEWPORT_HEIGHT,
      });
    });

    it('cannot scroll past the top of the viewport', () => {
      const { scrollAndGetViewport } = setup();
      expect(scrollAndGetViewport({ deltaY: -100 })).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: BOUNDING_BOX_HEIGHT,
      });
    });
  });

  describe('mousewheel zooming using shift + mousewheel', function() {
    // These series of tests are very particular to margin differences, so check
    // different margin combinations separately.
    const marginTests = [
      { marginLeft: 0, marginRight: 0, description: 'no margins' },
      { marginLeft: 33, marginRight: 0, description: 'with a left margin' },
      { marginLeft: 0, marginRight: 33, description: 'with a right margin' },
      { marginLeft: 33, marginRight: 55, description: 'with both margins' },
    ];

    // Run through the tests.
    for (const { marginLeft, marginRight, description } of marginTests) {
      describe(description, function() {
        // Take into account the margins and the component width to find the inner
        // component width, which is the active viewport area. All mouse events should
        // be relative to this space.
        const innerComponentWidth =
          BOUNDING_BOX_WIDTH - marginLeft - marginRight;

        // |        Viewport        |
        // |-----------*------------|
        //             ^
        //             Mouse position
        it('zooms the preview selection equally when the mouse is centered', () => {
          const { scrollAndGetViewport } = setup({
            marginLeft,
            marginRight,
          });
          const viewport = scrollAndGetViewport({
            deltaY: -100,
            shiftKey: true,
            clientX: BOUNDING_BOX_LEFT + innerComponentWidth * 0.5 + marginLeft,
          });

          // Assert that this zooms in equally.
          expect(viewport.viewportLeft).toBeGreaterThan(0);
          expect(viewport.viewportRight).toBeLessThan(1);
          expect(1 - viewport.viewportRight).toBeCloseTo(
            viewport.viewportLeft,
            7
          );

          // Only do an additional viewport top/bottom check here.
          expect(viewport).toMatchObject({
            viewportTop: 0,
            viewportBottom: BOUNDING_BOX_HEIGHT,
          });
        });

        // |        Viewport        |
        // |------------------*-----|
        //                    ^
        //                    Mouse position
        it('zooms the preview selection in a direction when the mouse is to the right', () => {
          const { scrollAndGetViewport } = setup({
            marginLeft,
            marginRight,
          });
          const viewport = scrollAndGetViewport({
            deltaY: -10,
            shiftKey: true,
            clientX:
              BOUNDING_BOX_LEFT + innerComponentWidth * 0.75 + marginLeft,
          });

          // Assert that the left hand side zooms in more.
          const changeInLeft = viewport.viewportLeft;
          const changeInRight = 1 - viewport.viewportRight;
          expect(viewport.viewportLeft).toBeGreaterThan(0);
          expect(viewport.viewportRight).toBeLessThan(1);
          expect(changeInLeft).toBeGreaterThan(changeInRight);
        });

        // |        Viewport        |
        // |----*-------------------|
        //      ^
        //      Mouse position
        it('zooms the preview selection in a direction when the mouse is to the left', () => {
          const { scrollAndGetViewport } = setup({
            marginLeft,
            marginRight,
          });
          const viewport = scrollAndGetViewport({
            deltaY: -10,
            shiftKey: true,
            clientX:
              BOUNDING_BOX_LEFT + innerComponentWidth * 0.25 + marginLeft,
          });

          // Assert that the left hand side zooms in more.
          const changeInLeft = viewport.viewportLeft;
          const changeInRight = 1 - viewport.viewportRight;
          expect(viewport.viewportLeft).toBeGreaterThan(0);
          expect(viewport.viewportRight).toBeLessThan(1);
          expect(changeInLeft).toBeLessThan(changeInRight);
        });

        // |        Viewport        |
        // |*-----------------------|
        //  ^
        //  Mouse position
        it('does not scroll the viewport left when the mouse is centered on the left.', () => {
          const { scrollAndGetViewport } = setup({
            marginLeft,
            marginRight,
          });
          const viewport = scrollAndGetViewport({
            deltaY: -10,
            shiftKey: true,
            clientX: BOUNDING_BOX_LEFT + marginLeft,
          });
          expect(viewport.viewportLeft).toBe(0);
          expect(viewport.viewportRight).toBeLessThan(1);
        });

        // |        Viewport        |
        // |-----------------------*|
        //                         ^
        //                         Mouse position
        it('does not scroll the viewport right when the mouse is centered on the right.', () => {
          const { scrollAndGetViewport } = setup({
            marginLeft,
            marginRight,
          });
          const viewport = scrollAndGetViewport({
            deltaY: -10,
            shiftKey: true,
            clientX: BOUNDING_BOX_LEFT + innerComponentWidth + marginLeft,
          });
          expect(viewport.viewportLeft).toBeGreaterThan(0);
          expect(viewport.viewportRight).toBe(1);
        });

        it('cannot zoom out beyond the bounds', () => {
          const { scrollAndGetViewport } = setup({
            marginLeft,
            marginRight,
          });
          const viewport = scrollAndGetViewport({
            deltaY: 100,
            shiftKey: true,
            clientX: BOUNDING_BOX_LEFT + innerComponentWidth * 0.5 + marginLeft,
          });
          expect(viewport).toMatchObject({
            viewportLeft: 0,
            viewportRight: 1,
          });
        });
      });
    }
  });

  describe('dragging around', function() {
    const middleX = BOUNDING_BOX_WIDTH * 0.5;
    const middleY = BOUNDING_BOX_HEIGHT * 0.5;

    it('can click and drag down', function() {
      const { getChartViewport, clickAndDrag } = setup();

      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: BOUNDING_BOX_HEIGHT,
      });
      clickAndDrag(middleX, middleY, middleX, middleY - 50);
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 50,
        viewportBottom: BOUNDING_BOX_HEIGHT + 50,
      });
    });

    it('can click and drag up', function() {
      const { getChartViewport, clickAndDrag } = setup();
      const middleX = BOUNDING_BOX_WIDTH * 0.5;
      const middleY = BOUNDING_BOX_HEIGHT * 0.5;

      clickAndDrag(middleX, middleY, middleX, middleY - 100);
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 100,
        viewportBottom: BOUNDING_BOX_HEIGHT + 100,
      });
      clickAndDrag(middleX, middleY, middleX, middleY + 50);
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 50,
        viewportBottom: BOUNDING_BOX_HEIGHT + 50,
      });
    });

    it('will not drag beyond the top of the window', function() {
      const { getChartViewport, clickAndDrag } = setup();
      const middleX = BOUNDING_BOX_WIDTH * 0.5;
      const middleY = BOUNDING_BOX_HEIGHT * 0.5;

      clickAndDrag(middleX, middleY, middleX, middleY + 50);
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: BOUNDING_BOX_HEIGHT,
      });
    });

    it('will not drag beyond the bottom of the window', function() {
      const { getChartViewport, clickAndDrag } = setup();
      const middleX = BOUNDING_BOX_WIDTH * 0.5;
      const middleY = BOUNDING_BOX_HEIGHT * 0.5;

      clickAndDrag(
        middleX,
        middleY,
        middleX,
        middleY - MAX_VIEWPORT_HEIGHT * 2
      );
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: MAX_VIEWPORT_HEIGHT - BOUNDING_BOX_HEIGHT,
        viewportBottom: MAX_VIEWPORT_HEIGHT,
      });
    });

    it('will place the contents of a small viewport at the top of the bounding box', function() {
      const { getChartViewport, clickAndDrag } = setup({
        maxViewportHeight: SMALL_MAX_VIEWPORT_HEIGHT,
        startsAtBottom: false,
      });
      const anchoredViewport = {
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: BOUNDING_BOX_HEIGHT,
      };
      expect(getChartViewport()).toMatchObject(anchoredViewport);

      // It will not move the viewport.
      clickAndDrag(middleX, middleY, middleX, middleY - 10);
      expect(getChartViewport()).toMatchObject(anchoredViewport);
      clickAndDrag(middleX, middleY, middleX, middleY + 10);
      expect(getChartViewport()).toMatchObject(anchoredViewport);
    });

    it('will place the contents of a small viewport at the bottom of the bounding box', function() {
      const { getChartViewport, clickAndDrag } = setup({
        maxViewportHeight: SMALL_MAX_VIEWPORT_HEIGHT,
        startsAtBottom: true,
      });
      const anchoredViewport = {
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: SMALL_MAX_VIEWPORT_HEIGHT - BOUNDING_BOX_HEIGHT,
        viewportBottom: SMALL_MAX_VIEWPORT_HEIGHT,
      };
      expect(getChartViewport()).toMatchObject(anchoredViewport);

      // It will not move the viewport.
      clickAndDrag(middleX, middleY, middleX, middleY - 10);
      expect(getChartViewport()).toMatchObject(anchoredViewport);
      clickAndDrag(middleX, middleY, middleX, middleY + 10);
      expect(getChartViewport()).toMatchObject(anchoredViewport);
    });

    it('can click and drag left/right', function() {
      const { scrollAndGetViewport, getChartViewport, clickAndDrag } = setup();

      // Assert the initial values.
      const { viewportLeft, viewportRight } = scrollAndGetViewport({
        // Zoom in some large arbitrary amount:
        deltaY: -5000,
        shiftKey: true,
        clientX: BOUNDING_BOX_LEFT + BOUNDING_BOX_WIDTH * 0.5,
      });

      // These values are arbitrary, but show that the viewport was zoomed in.
      expect(viewportLeft).toBeGreaterThan(0.3);
      expect(viewportRight).toBeLessThan(0.7);

      // Perform the dragging action.
      clickAndDrag(middleX, middleY, middleX + 500, middleY);
      expect(getChartViewport().viewportLeft).toBeLessThan(viewportLeft);
      expect(getChartViewport().viewportRight).toBeLessThan(viewportRight);

      // Drag back the other way.
      clickAndDrag(middleX, middleY, middleX - 1000, middleY);
      expect(getChartViewport().viewportLeft).toBeGreaterThan(viewportLeft);
      expect(getChartViewport().viewportRight).toBeGreaterThan(viewportRight);
    });

    it('will not scroll off to the left of the viewport bounds', function() {
      const { scroll, getChartViewport, clickAndDrag } = setup();
      scroll({
        // Zoom in some large arbitrary amount:
        deltaY: -5000,
        shiftKey: true,
        clientX: BOUNDING_BOX_LEFT + BOUNDING_BOX_WIDTH * 0.5,
      });

      // Perform the dragging action some arbitrarily large distance..
      clickAndDrag(middleX, middleY, middleX + 10000, middleY);
      expect(getChartViewport().viewportLeft).toBe(0);
      expect(getChartViewport().viewportRight).toBeLessThan(0.4);
    });

    it('will not scroll off to the right of the viewport bounds', function() {
      const { scroll, getChartViewport, clickAndDrag } = setup();

      scroll({
        // Zoom in some large arbitrary amount:
        deltaY: -5000,
        shiftKey: true,
        clientX: BOUNDING_BOX_LEFT + BOUNDING_BOX_WIDTH * 0.5,
      });

      // Perform the dragging action some arbitrarily large distance.
      clickAndDrag(middleX, middleY, middleX - 10000, middleY);
      expect(getChartViewport().viewportLeft).toBeGreaterThan(0.6);
      expect(getChartViewport().viewportRight).toBe(1);
    });
  });

  describe('keyboard navigation', function() {
    it('zooms in and out at center', () => {
      const { getChartViewport, depressKey } = setup();

      // Zoom in.
      depressKey('KeyQ', 500);
      expect(getChartViewport().viewportLeft).toBeGreaterThan(0);
      expect(getChartViewport().viewportRight).toBeLessThan(1);
      // Assert we're centered.
      expect(1 - getChartViewport().viewportRight).toBeCloseTo(
        getChartViewport().viewportLeft,
        7
      );

      // Remember where we are so that we can compare after zoom out.
      const { viewportLeft, viewportRight } = getChartViewport();

      // Zoom out.
      depressKey('KeyE', 200);
      expect(getChartViewport().viewportLeft).toBeLessThan(viewportLeft);
      expect(getChartViewport().viewportRight).toBeGreaterThan(viewportRight);
      // Assert we're still in the middle.
      expect(1 - getChartViewport().viewportRight).toBeCloseTo(
        getChartViewport().viewportLeft,
        7
      );
    });

    it('moves viewport down and up', () => {
      const { getChartViewport, depressKey } = setup();

      depressKey('KeyS', 100);
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 200,
        viewportBottom: BOUNDING_BOX_HEIGHT + 200,
      });
      depressKey('KeyW', 50);
      expect(getChartViewport()).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 100,
        viewportBottom: BOUNDING_BOX_HEIGHT + 100,
      });
    });

    it('moves viewport left and right', () => {
      const { getChartViewport, depressKey } = setup();
      // Zoom in a bit to enable panning horizontally.
      depressKey('KeyQ', 1000);
      const { viewportLeft, viewportRight } = getChartViewport();

      // Move to the left.
      depressKey('KeyA', 100);
      expect(getChartViewport().viewportLeft).toBeLessThan(viewportLeft);
      expect(getChartViewport().viewportRight).toBeLessThan(viewportRight);

      // Move to the right.
      depressKey('KeyD', 200);
      expect(getChartViewport().viewportLeft).toBeGreaterThan(viewportLeft);
      expect(getChartViewport().viewportRight).toBeGreaterThan(viewportRight);
    });
  });

  it('reacts to changes to the panel layout generation', function() {
    const {
      dispatch,
      setBoundingBoxMock,
      getChartViewport,
      flushRafCalls,
      view,
    } = setup();

    expect(getChartViewport()).toMatchObject({
      containerWidth: BOUNDING_BOX_WIDTH,
      containerHeight: BOUNDING_BOX_HEIGHT,
      viewportLeft: 0,
      viewportRight: 1,
      viewportTop: 0,
      viewportBottom: BOUNDING_BOX_HEIGHT,
    });

    const boundingWidthDiff = 15;
    setBoundingBoxMock({ width: BOUNDING_BOX_WIDTH - boundingWidthDiff });
    dispatch(changeSidebarOpenState('calltree', true));
    flushRafCalls();
    view.update();

    expect(getChartViewport()).toMatchObject({
      containerWidth: BOUNDING_BOX_WIDTH - boundingWidthDiff,
      containerHeight: BOUNDING_BOX_HEIGHT,
      viewportLeft: 0,
      viewportRight: 1,
      viewportTop: 0,
      viewportBottom: BOUNDING_BOX_HEIGHT,
    });
  });
});

type BoundingBoxOverride = {
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
};

function getBoundingBoxForViewport(override: $Shape<BoundingBoxOverride> = {}) {
  const values: BoundingBoxOverride = Object.assign(
    {
      width: BOUNDING_BOX_WIDTH,
      height: BOUNDING_BOX_HEIGHT,
      offsetX: BOUNDING_BOX_LEFT,
      offsetY: BOUNDING_BOX_TOP,
    },
    override
  );

  const rect = getBoundingBox(values.width, values.height);
  // Add some arbitrary offset to the bounding box to ensure that we
  // are doing the correct thing when doing sizing calculations.
  rect.left += values.offsetX;
  rect.right += values.offsetX;
  rect.x += values.offsetX;
  rect.y += values.offsetY;
  rect.top += values.offsetY;
  rect.bottom += values.offsetY;
  return rect;
}

function setup(profileOverrides: Object = {}) {
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();

  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => getBoundingBoxForViewport());

  // Hook up a dummy chart with a viewport.
  const DummyChart = () => <div id="dummy-chart" />;
  const ChartWithViewport = withChartViewport(DummyChart);

  // The viewport component started out as an unconnected component, but then it
  // started subscribing to the store an dispatching its own actions. This migration
  // wasn't completely done, so it still has a few pieces of state passed in through
  // its OwnProps. In order to ensure that the component is consistent, make it
  // a connected component.
  const ConnectedChartWithViewport = explicitConnect({
    mapStateToProps: state => ({
      timeRange: getCommittedRange(state),
      previewSelection: getPreviewSelection(state),
    }),
    mapDispatchToProps: {},
    // eslint-disable-next-line react/display-name
    component: (props: Object) => (
      <ChartWithViewport
        viewportProps={{
          previewSelection: props.previewSelection,
          timeRange: props.timeRange,
          maxViewportHeight: props.maxViewportHeight || MAX_VIEWPORT_HEIGHT,
          startsAtBottom: props.startsAtBottom,
          viewportNeedsUpdate: () => false,
          marginLeft: 0,
          marginRight: 0,
          maximumZoom: MAXIMUM_ZOOM,
          ...profileOverrides,
        }}
        chartProps={
          {
            // None used in dummy component.
          }
        }
      />
    ),
  });

  const store = storeWithProfile(getProfileFromTextSamples('A').profile);
  const view = mount(
    <Provider store={store}>
      <ConnectedChartWithViewport />
    </Provider>
  );

  // WithSize uses requestAnimationFrame.
  flushRafCalls();
  view.update();

  // The following functions are helpers for the tests, to provide a nicer functional
  // interface to drive changes to the components.

  function moveMouseAndGetLeft(pageX: number): number {
    view.simulate('mousemove', { pageX });
    view.update();
    return view.find('.timelineTrackScreenshotHover').prop('style').left;
  }

  function getChartViewport() {
    return view.find(DummyChart).props().viewport;
  }

  function scroll(eventOverrides) {
    view
      .find('.chartViewport')
      .simulate('wheel', getMouseEvent(eventOverrides));
    flushRafCalls();
    view.update();
  }

  /**
   * Send a keydown and keyup event with a specified duration in
   * between.
   *
   * Assumes and relies on the fact that time is measured with
   * `performance.now` and the timestamps sent to the
   * requestAnimationFrame `_keyboardNavigation` callback.
   */
  function depressKey(code: string, duration: Milliseconds) {
    jest.spyOn(performance, 'now').mockReturnValue(0);
    view.simulate('keydown', { nativeEvent: { code } });
    flushRafCalls([duration]);
    view.simulate('keyup', { nativeEvent: { code } });
    flushRafCalls();
    view.update();
  }

  function scrollAndGetViewport(eventOverrides) {
    scroll(eventOverrides);
    return getChartViewport();
  }

  // Dispatch events to the window, which isn't available through the enzyme
  // simulate interface. Instead use JSDOM.
  function _dispatchToJsdomWindow(eventType: string, overrides: Object) {
    window.dispatchEvent(
      // Flow doesn't like us adding unknown mouse properties to Event, and also
      // doesn't like us modifying a MouseEvent, so opt out of type checks here.
      Object.assign((new Event(eventType): Object), getMouseEvent(overrides))
    );
  }

  function clickAndDrag(fromX, fromY, toX, toY) {
    const from = { clientX: fromX, clientY: fromY };
    const to = { clientX: toX, clientY: toY };

    view.find('.chartViewport').simulate('mousedown', getMouseEvent(from));
    _dispatchToJsdomWindow('mousemove', from);
    _dispatchToJsdomWindow('mousemove', to);
    _dispatchToJsdomWindow('mouseup', to);
    // Flush any batched updates.
    flushRafCalls();
    view.update();
  }

  function setBoundingBoxMock(override: $Shape<BoundingBoxOverride>): void {
    HTMLElement.prototype.getBoundingClientRect.mockImplementation(() =>
      getBoundingBoxForViewport(override)
    );
  }

  return {
    view,
    moveMouseAndGetLeft,
    flushRafCalls,
    getChartViewport,
    scrollAndGetViewport,
    scroll,
    depressKey,
    clickAndDrag,
    setBoundingBoxMock,
    dispatch: store.dispatch,
  };
}
