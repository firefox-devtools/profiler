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
import explicitConnect from '../../utils/connect';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox, getMouseEvent } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

// Define some magic sizing values to assert various properties of the viewport.
const COMPONENT_WIDTH = 300;
const COMPONENT_HEIGHT = 100;
const LEFT = 5;
const TOP = 7;
const MAXIMUM_ZOOM = 0.1;
const MAX_VIEWPORT_HEIGHT = COMPONENT_HEIGHT * 3;
const SMALL_MAX_VIEWPORT_HEIGHT = COMPONENT_HEIGHT * 0.2;

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
    const { getChartProps } = setup();
    const { viewport } = getChartProps();
    expect(viewport).toEqual({
      containerWidth: COMPONENT_WIDTH,
      containerHeight: COMPONENT_HEIGHT,
      viewportLeft: 0,
      viewportRight: 1,
      viewportTop: 0,
      viewportBottom: COMPONENT_HEIGHT,
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
      const { view, getChartProps } = setup();
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: COMPONENT_HEIGHT,
      });
      const deltaY = 10;
      view.find('.chartViewport').simulate('wheel', getMouseEvent({ deltaY }));
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: deltaY,
        viewportBottom: COMPONENT_HEIGHT + deltaY,
      });
    });

    it('cannot scroll past the bottom of the viewport', () => {
      const { view, getChartProps } = setup();
      const deltaY = 1000;
      view.find('.chartViewport').simulate('wheel', getMouseEvent({ deltaY }));
      view.update();
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: MAX_VIEWPORT_HEIGHT - COMPONENT_HEIGHT,
        viewportBottom: MAX_VIEWPORT_HEIGHT,
      });
    });

    it('cannot scroll past the top of the viewport', () => {
      const { view, getChartProps } = setup();
      const deltaY = -100;
      view.find('.chartViewport').simulate('wheel', getMouseEvent({ deltaY }));
      view.update();
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: COMPONENT_HEIGHT,
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
        const innerComponentWidth = COMPONENT_WIDTH - marginLeft - marginRight;

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
            clientX: LEFT + innerComponentWidth * 0.5 + marginLeft,
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
            viewportBottom: COMPONENT_HEIGHT + 0,
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
            clientX: LEFT + innerComponentWidth * 0.75 + marginLeft,
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
            clientX: LEFT + innerComponentWidth * 0.25 + marginLeft,
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
            clientX: LEFT + marginLeft,
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
            clientX: LEFT + innerComponentWidth + marginLeft,
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
            clientX: LEFT + innerComponentWidth * 0.5 + marginLeft,
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
    const middleX = COMPONENT_WIDTH * 0.5;
    const middleY = COMPONENT_HEIGHT * 0.5;

    it('can click and drag down', function() {
      const { getChartProps, clickAndDrag } = setup();

      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: COMPONENT_HEIGHT,
      });
      clickAndDrag(middleX, middleY, middleX, middleY - 50);
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 50,
        viewportBottom: COMPONENT_HEIGHT + 50,
      });
    });

    it('can click and drag up', function() {
      const { getChartProps, clickAndDrag } = setup();
      const middleX = COMPONENT_WIDTH * 0.5;
      const middleY = COMPONENT_HEIGHT * 0.5;

      clickAndDrag(middleX, middleY, middleX, middleY - 100);
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 100,
        viewportBottom: COMPONENT_HEIGHT + 100,
      });
      clickAndDrag(middleX, middleY, middleX, middleY + 50);
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 50,
        viewportBottom: COMPONENT_HEIGHT + 50,
      });
    });

    it('will not drag beyond the top of the window', function() {
      const { getChartProps, clickAndDrag } = setup();
      const middleX = COMPONENT_WIDTH * 0.5;
      const middleY = COMPONENT_HEIGHT * 0.5;

      clickAndDrag(middleX, middleY, middleX, middleY + 50);
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: COMPONENT_HEIGHT,
      });
    });

    it('will not drag beyond the bottom of the window', function() {
      const { getChartProps, clickAndDrag } = setup();
      const middleX = COMPONENT_WIDTH * 0.5;
      const middleY = COMPONENT_HEIGHT * 0.5;

      clickAndDrag(
        middleX,
        middleY,
        middleX,
        middleY - MAX_VIEWPORT_HEIGHT * 2
      );
      expect(getChartProps().viewport).toMatchObject({
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: MAX_VIEWPORT_HEIGHT - COMPONENT_HEIGHT,
        viewportBottom: MAX_VIEWPORT_HEIGHT,
      });
    });

    it('will anchor small content at the top', function() {
      const { getChartProps, clickAndDrag } = setup({
        maxViewportHeight: SMALL_MAX_VIEWPORT_HEIGHT,
        startsAtBottom: false,
      });
      const anchoredViewport = {
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        viewportBottom: COMPONENT_HEIGHT,
      };
      expect(getChartProps().viewport).toMatchObject(anchoredViewport);

      // It will not move the viewport.
      clickAndDrag(middleX, middleY, middleX, middleY - 10);
      expect(getChartProps().viewport).toMatchObject(anchoredViewport);
      clickAndDrag(middleX, middleY, middleX, middleY + 10);
      expect(getChartProps().viewport).toMatchObject(anchoredViewport);
    });

    it('will anchor small content at the bottom', function() {
      const { getChartProps, clickAndDrag } = setup({
        maxViewportHeight: SMALL_MAX_VIEWPORT_HEIGHT,
        startsAtBottom: true,
      });
      const anchoredViewport = {
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: SMALL_MAX_VIEWPORT_HEIGHT - COMPONENT_HEIGHT,
        viewportBottom: SMALL_MAX_VIEWPORT_HEIGHT,
      };
      expect(getChartProps().viewport).toMatchObject(anchoredViewport);

      // It will not move the viewport.
      clickAndDrag(middleX, middleY, middleX, middleY - 10);
      expect(getChartProps().viewport).toMatchObject(anchoredViewport);
      clickAndDrag(middleX, middleY, middleX, middleY + 10);
      expect(getChartProps().viewport).toMatchObject(anchoredViewport);
    });

    it('can click and drag left/right', function() {
      const { scrollAndGetViewport, getChartProps, clickAndDrag } = setup();

      // Assert the initial values.
      const { viewportLeft, viewportRight } = scrollAndGetViewport({
        // Zoom in some large arbitrary amount:
        deltaY: -5000,
        shiftKey: true,
        clientX: LEFT + COMPONENT_WIDTH * 0.5,
      });

      // These values are arbitrary, but show that the viewport was zoomed in.
      expect(viewportLeft).toBeGreaterThan(0.3);
      expect(viewportRight).toBeLessThan(0.7);

      // Perform the dragging action.
      clickAndDrag(middleX, middleY, middleX + 500, middleY);
      expect(getChartProps().viewport.viewportLeft).toBeLessThan(viewportLeft);
      expect(getChartProps().viewport.viewportRight).toBeLessThan(
        viewportRight
      );

      // Drag back the other way.
      clickAndDrag(middleX, middleY, middleX - 1000, middleY);
      expect(getChartProps().viewport.viewportLeft).toBeGreaterThan(
        viewportLeft
      );
      expect(getChartProps().viewport.viewportRight).toBeGreaterThan(
        viewportRight
      );
    });

    it('will not scroll off to the left of the viewport bounds', function() {
      const { scrollAndGetViewport, getChartProps, clickAndDrag } = setup();
      scrollAndGetViewport({
        // Zoom in some large arbitrary amount:
        deltaY: -5000,
        shiftKey: true,
        clientX: LEFT + COMPONENT_WIDTH * 0.5,
      });

      // Perform the dragging action some arbitrarily large distance..
      clickAndDrag(middleX, middleY, middleX + 10000, middleY);
      expect(getChartProps().viewport.viewportLeft).toBe(0);
      expect(getChartProps().viewport.viewportRight).toBeLessThan(0.4);
    });

    it('will not scroll off to the right of the viewport bounds', function() {
      const { scrollAndGetViewport, getChartProps, clickAndDrag } = setup();

      scrollAndGetViewport({
        // Zoom in some large arbitrary amount:
        deltaY: -5000,
        shiftKey: true,
        clientX: LEFT + COMPONENT_WIDTH * 0.5,
      });

      // Perform the dragging action some arbitrarily large distance.
      clickAndDrag(middleX, middleY, middleX - 10000, middleY);
      expect(getChartProps().viewport.viewportLeft).toBeGreaterThan(0.6);
      expect(getChartProps().viewport.viewportRight).toBe(1);
    });
  });
});

function setup(profileOverrides: Object = {}) {
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();

  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => {
      const rect = getBoundingBox(COMPONENT_WIDTH, COMPONENT_HEIGHT);
      // Add some arbitrary X offset.
      rect.left += LEFT;
      rect.right += LEFT;
      rect.x += LEFT;
      rect.y += TOP;
      rect.top += TOP;
      rect.bottom += TOP;
      return rect;
    });

  // Hook up a dummy chart with a viewport.
  const DummyChart = () => <div id="dummy-chart" />;
  const ChartWithViewport = withChartViewport(DummyChart);

  // This component assumes that it is inside of a connected component, so go
  // ahead and mock that out here.
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

  const view = mount(
    <Provider store={storeWithProfile(getProfileFromTextSamples('A').profile)}>
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

  function getChartProps() {
    return view.find(DummyChart).props();
  }

  function scroll(eventOverrides) {
    view
      .find('.chartViewport')
      .simulate('wheel', getMouseEvent(eventOverrides));
    flushRafCalls();
    view.update();
  }

  function scrollAndGetViewport(eventOverrides) {
    scroll(eventOverrides);
    return getChartProps().viewport;
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

  return {
    view,
    moveMouseAndGetLeft,
    flushRafCalls,
    getChartProps,
    scrollAndGetViewport,
    scroll,
    clickAndDrag,
  };
}
