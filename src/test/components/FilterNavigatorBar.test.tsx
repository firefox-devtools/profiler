/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { FilterNavigatorBar } from 'firefox-profiler/components/shared/FilterNavigatorBar';
import { ProfileFilterNavigator } from '../../components/app/ProfileFilterNavigator';
import * as ProfileView from '../../actions/profile-view';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/types';
import { resetIsReducedMotionSetupForTest } from '../../utils/reduced-motion';

describe('shared/FilterNavigatorBar', () => {
  it(`pops the item unless the last one is clicked`, () => {
    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    // We don't use getByRole because this isn't a button.
    const lastElement = screen.getByText('bar');
    fireEvent.click(lastElement);
    expect(onPop).not.toHaveBeenCalled();

    const firstElement = screen.getByRole('button', { name: 'foo' });
    fireEvent.click(firstElement);
    expect(onPop).toHaveBeenCalledWith(0);
  });

  it(`pops the last item if there's an uncommited item`, () => {
    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        uncommittedItem="baz"
        onPop={onPop}
      />
    );

    // We don't use getByRole because this isn't a button.
    const lastElement = screen.getByText('bar');
    fireEvent.click(lastElement);
    expect(onPop).toHaveBeenCalledWith(1);
  });

  let parentWidth_ = 100,
    contentWidth_ = 50;
  const additionalRects = new Map();
  function initBoundingClientRect(parentWidth: number, contentWidth: number) {
    parentWidth_ = parentWidth;
    contentWidth_ = contentWidth;
    additionalRects.clear();

    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      jest.fn(function () {
        // eslint-disable-next-line @babel/no-invalid-this
        if (this.classList.contains('filterNavigatorBarScrollParent')) {
          return new DOMRect(0, 0, parentWidth_, 24);
        }
        // eslint-disable-next-line @babel/no-invalid-this
        if (this.classList.contains('filterNavigatorBarScrollContent')) {
          return new DOMRect(0, 0, contentWidth_, 24);
        }
        for (const [className, rect] of additionalRects.entries()) {
          // eslint-disable-next-line @babel/no-invalid-this
          if (this.classList.contains(className)) {
            return rect;
          }
        }
        return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
      })
    );
  }
  function updateBoundingClientRect(parentWidth: number, contentWidth: number) {
    parentWidth_ = parentWidth;
    contentWidth_ = contentWidth;
  }
  function addBoundingClientRect(
    className: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    additionalRects.set(className, new DOMRect(x, y, width, height));
  }

  let matchMediaListener: ((result: MediaQueryList) => void) | null = null;
  function initReduceMotion(reduce: boolean) {
    matchMediaListener = null;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => {
        return {
          matches: !reduce,
          set onchange(listener: ((result: MediaQueryList) => void) | null) {
            matchMediaListener = listener;
          },
        };
      },
    });
    resetIsReducedMotionSetupForTest();
  }
  function updateReduceMotion(reduce: boolean) {
    matchMediaListener!({
      matches: !reduce,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: (_: Event) => false,
    });
  }

  it(`cannot be scrolled if the content does not overflow`, () => {
    initBoundingClientRect(100, 50);
    initReduceMotion(false);

    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    const parent = screen.getByTestId('FilterNavigatorBarScrollParent');
    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    // No buttons should be rendered.
    expect(parent.previousElementSibling).toBeNull();
    expect(parent.nextElementSibling).toBeNull();

    expect(content).toHaveStyle({ left: '0px' });

    fireEvent.wheel(parent, {
      deltaX: 0,
      deltaY: 5,
    });
    expect(content).toHaveStyle({ left: '0px' });

    fireEvent.wheel(parent, {
      deltaX: 0,
      deltaY: -5,
    });
    expect(content).toHaveStyle({ left: '0px' });
  });

  it(`can be scrolled with buttons if the content overflows`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(false);

    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    const leftButton = screen.getByText('<');
    const rightButton = screen.getByText('>');

    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '0px' });

    fireEvent.mouseDown(rightButton);

    // The scroll should have an immediate effect.
    expect(content).toHaveStyle({ left: '-10px' });

    // The button state is not immediately updated.
    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-20px' });

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-30px' });

    // The scroll gradually stops.
    fireEvent.mouseUp(rightButton);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-110px' });

    // The button state is updated once the scroll finishes.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    // The successive click event should be ignored.
    fireEvent.click(rightButton);
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-110px' });

    // Keyboard-initiated click should also scroll.
    fireEvent.click(rightButton);
    expect(content).toHaveStyle({ left: '-120px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-200px' });

    // Leaving the button stops the scroll.
    fireEvent.mouseDown(rightButton);
    fireEvent.mouseLeave(rightButton);
    expect(content).toHaveStyle({ left: '-210px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-290px' });

    // Press the scroll button until it hits the end.
    fireEvent.mouseDown(rightButton);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);

    expect(content).toHaveStyle({ left: '-900px' });

    // When the scroll hits the end, the scroll immediately stops and the
    // button state is immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // Do the same for the left scroll.

    fireEvent.mouseDown(leftButton);

    // The scroll should have an immediate effect.
    expect(content).toHaveStyle({ left: '-890px' });

    // The button state is not immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-880px' });

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-870px' });

    // The scroll gradually stops.
    fireEvent.mouseUp(leftButton);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-790px' });

    // The button state is updated once the scroll finishes.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    // The successive click event should be ignored.
    fireEvent.click(leftButton);
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-790px' });

    // Keyboard-initiated click should also scroll.
    fireEvent.click(leftButton);
    expect(content).toHaveStyle({ left: '-780px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-700px' });

    // Leaving the button stops the scroll.
    fireEvent.mouseDown(leftButton);
    fireEvent.mouseLeave(leftButton);
    expect(content).toHaveStyle({ left: '-690px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-610px' });

    // Press the scroll button until it hits the end.
    fireEvent.mouseDown(leftButton);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    fireEvent.mouseUp(leftButton);
    fireEvent.click(leftButton);

    expect(content).toHaveStyle({ left: '0px' });

    // When the scroll hits the end, the scroll immediately stops and the
    // button state is immediately updated.
    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();
  });

  it(`can be scrolled with the wheel if the content overflows`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(false);

    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    const leftButton = screen.getByText('<');
    const rightButton = screen.getByText('>');

    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    const parent = screen.getByTestId('FilterNavigatorBarScrollParent');
    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '0px' });

    fireEvent.wheel(parent, {
      deltaX: 0,
      deltaY: 5,
    });

    // The scroll should have an immediate effect.
    expect(content).toHaveStyle({ left: '-5px' });

    // The button state is immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    // It uses the delta that has larger magintude.
    fireEvent.wheel(parent, {
      deltaX: 5,
      deltaY: -1,
    });
    expect(content).toHaveStyle({ left: '-10px' });
    fireEvent.wheel(parent, {
      deltaX: 5,
      deltaY: 1,
    });
    expect(content).toHaveStyle({ left: '-15px' });

    // The scroll stops at the end.
    fireEvent.wheel(parent, {
      deltaX: 2000,
      deltaY: 1,
    });
    expect(content).toHaveStyle({ left: '-900px' });

    // The button state is immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // Do the same for the left scroll.

    fireEvent.wheel(parent, {
      deltaX: -5,
      deltaY: 0,
    });
    expect(content).toHaveStyle({ left: '-895px' });

    // The button state is immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    fireEvent.wheel(parent, {
      deltaX: -5,
      deltaY: 1,
    });
    expect(content).toHaveStyle({ left: '-890px' });
    fireEvent.wheel(parent, {
      deltaX: -5,
      deltaY: -1,
    });
    expect(content).toHaveStyle({ left: '-885px' });

    // The scroll stops at the end.
    fireEvent.wheel(parent, {
      deltaX: -2000,
      deltaY: 1,
    });
    expect(content).toHaveStyle({ left: '0px' });

    // The button state is immediately updated.
    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();
  });

  it(`reduces the button scroll motion if preferred`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(true);

    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    const leftButton = screen.getByText('<');
    const rightButton = screen.getByText('>');

    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '0px' });

    fireEvent.mouseDown(rightButton);

    // The scroll should have an immediate effect.
    expect(content).toHaveStyle({ left: '-10px' });

    // The button state is not immediately updated
    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-20px' });

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-30px' });

    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);

    // The scroll should immediately finish in the reduced motion mode,
    // and the button state is immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-30px' });

    // Keyboard-initiated click scrolls large amount.
    fireEvent.click(rightButton);
    expect(content).toHaveStyle({ left: '-230px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-230px' });

    // Scroll to the end, as a preparation for the next test.
    fireEvent.mouseDown(rightButton);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);

    expect(content).toHaveStyle({ left: '-900px' });

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // Do the same for the left scroll.

    fireEvent.mouseDown(leftButton);

    // The scroll should have an immediate effect.
    expect(content).toHaveStyle({ left: '-890px' });

    // The button state is not immediately updated
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-880px' });

    // The subsequent scroll should be performed by timer.
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-870px' });

    fireEvent.mouseUp(leftButton);
    fireEvent.click(leftButton);

    // The scroll should immediately finish in the reduced motion mode,
    // and the button state is immediately updated.
    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-870px' });

    // Keyboard-initiated click scrolls large amount.
    fireEvent.click(leftButton);
    expect(content).toHaveStyle({ left: '-670px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '-670px' });

    // It should reflect the change to enable the motion.
    updateReduceMotion(false);

    fireEvent.mouseDown(leftButton);
    fireEvent.mouseUp(leftButton);
    fireEvent.click(leftButton);
    expect(content).toHaveStyle({ left: '-660px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-580px' });

    fireEvent.mouseDown(rightButton);
    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);
    expect(content).toHaveStyle({ left: '-590px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-670px' });

    // It should reflect the change to disable the motion.
    updateReduceMotion(true);

    fireEvent.mouseDown(leftButton);
    fireEvent.mouseUp(leftButton);
    fireEvent.click(leftButton);
    expect(content).toHaveStyle({ left: '-660px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-660px' });

    fireEvent.mouseDown(rightButton);
    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);
    expect(content).toHaveStyle({ left: '-670px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-670px' });
  });

  it(`scrolls to the right end if items are added/removed`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 100);
    initReduceMotion(false);

    const onPop = jest.fn();
    const { rerender } = render(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    // Add an item.
    updateBoundingClientRect(100, 1000);
    rerender(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2', 'item3']}
        selectedItem={3}
        onPop={onPop}
      />
    );

    const leftButton = screen.getByText('<');
    const rightButton = screen.getByText('>');

    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(leftButton).toBeDisabled();
    expect(rightButton).toBeEnabled();

    // The scroll should happen gradually.
    expect(content).toHaveStyle({ left: '0px' });
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-59px' });
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-116px' });
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(content).toHaveStyle({ left: '-900px' });

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // Add an item again.
    updateBoundingClientRect(100, 2000);
    rerender(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2', 'item3', 'item4']}
        selectedItem={4}
        onPop={onPop}
      />
    );

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeEnabled();

    expect(content).toHaveStyle({ left: '-900px' });
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-966px' });
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-1029px' });
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(content).toHaveStyle({ left: '-1900px' });

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // Remove an item.
    updateBoundingClientRect(100, 1000);
    rerender(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2', 'item3']}
        selectedItem={3}
        onPop={onPop}
      />
    );

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    expect(content).toHaveStyle({ left: '-1900px' });
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-1834px' });
    jest.advanceTimersByTime(10);
    expect(content).toHaveStyle({ left: '-1771px' });
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(content).toHaveStyle({ left: '-900px' });

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();

    // It should reflect the "reduce motion" change.
    updateReduceMotion(true);

    updateBoundingClientRect(100, 2000);
    rerender(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2', 'item3', 'item4']}
        selectedItem={4}
        onPop={onPop}
      />
    );

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();
    expect(content).toHaveStyle({ left: '-1900px' });

    updateBoundingClientRect(100, 1000);
    rerender(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2', 'item3']}
        selectedItem={3}
        onPop={onPop}
      />
    );

    expect(leftButton).toBeEnabled();
    expect(rightButton).toBeDisabled();
    expect(content).toHaveStyle({ left: '-900px' });
  });

  it(`saves and restores the provided scroll position`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(false);

    const onPop = jest.fn();
    const setFilterScrollPos = jest.fn();
    const { rerender } = render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
        filterScrollPos={-50}
        setFilterScrollPos={setFilterScrollPos}
      />
    );

    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '-50px' });

    const rightButton = screen.getByText('>');
    fireEvent.mouseDown(rightButton);
    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);

    expect(content).toHaveStyle({ left: '-60px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-140px' });
    expect(setFilterScrollPos).toHaveBeenCalledWith(-140);

    // Given the setFilterScrollPos is called asynchronously and the
    // rerendering can happen in between the scroll and the setFilterScrollPos
    // call, the filterScrollPos value comes from rerendering should be ignored.

    rerender(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
        filterScrollPos={-100}
        setFilterScrollPos={setFilterScrollPos}
      />
    );

    // The scroll position should be unchanged.
    expect(content).toHaveStyle({ left: '-140px' });

    fireEvent.mouseDown(rightButton);
    fireEvent.mouseUp(rightButton);
    fireEvent.click(rightButton);
    expect(content).toHaveStyle({ left: '-150px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-230px' });
    expect(setFilterScrollPos).toHaveBeenNthCalledWith(2, -230);
  });

  it(`coalesces setFilterScrollPos calls on wheel scroll`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(false);

    const onPop = jest.fn();
    const setFilterScrollPos = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
        filterScrollPos={0}
        setFilterScrollPos={setFilterScrollPos}
      />
    );

    const parent = screen.getByTestId('FilterNavigatorBarScrollParent');
    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '-0px' });

    fireEvent.wheel(parent, {
      deltaX: 10,
      deltaY: 0,
    });
    expect(content).toHaveStyle({ left: '-10px' });

    jest.advanceTimersByTime(50);

    fireEvent.wheel(parent, {
      deltaX: 10,
      deltaY: 0,
    });
    expect(content).toHaveStyle({ left: '-20px' });

    jest.advanceTimersByTime(50);

    fireEvent.wheel(parent, {
      deltaX: 10,
      deltaY: 0,
    });
    expect(content).toHaveStyle({ left: '-30px' });

    jest.advanceTimersByTime(50);

    fireEvent.wheel(parent, {
      deltaX: 10,
      deltaY: 0,
    });
    expect(content).toHaveStyle({ left: '-40px' });

    jest.advanceTimersByTime(300);

    // setFilterScrollPos should be called only once for the last position.
    expect(setFilterScrollPos).toHaveBeenCalledWith(-40);
  });

  it(`scrolls to the focused item`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(false);

    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2', 'item3', 'item4']}
        selectedItem={4}
        onPop={onPop}
      />
    );

    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '0px' });

    // The scrollTo method does not exist in the test env.
    const scrollTo = jest.fn();
    Element.prototype.scrollTo = scrollTo;

    // Focus the 3rd item which overflows to the right.
    addBoundingClientRect('filterNavigatorBarItemContent', 300, 0, 100, 24);
    const item3 = screen.getByText('item3');
    fireEvent.focus(item3);

    expect(content).toHaveStyle({ left: '0px' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    // 356 == ITEM_WIDTH + BUTTON_WIDTH + SCROLL_MARGIN
    //     == 300 + 24 + 32
    expect(content).toHaveStyle({ left: '-356px' });

    // In order to prevent the browser's automatic scroll on the
    // "overflow: hidden" element, the scrollTo must be called.
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    // Focus the 1st item which overflows to the left.
    addBoundingClientRect('filterNavigatorBarItemContent', -300, 0, 100, 24);
    const item1 = screen.getByText('item1');
    fireEvent.focus(item1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(content).toHaveStyle({ left: '0px' });

    expect(scrollTo).toHaveBeenNthCalledWith(2, 0, 0);

    // The scroll should happen immediately if motion is reduced.
    updateReduceMotion(true);

    addBoundingClientRect('filterNavigatorBarItemContent', 300, 0, 100, 24);
    fireEvent.focus(item3);

    expect(content).toHaveStyle({ left: '-356px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '-356px' });

    expect(scrollTo).toHaveBeenNthCalledWith(3, 0, 0);

    addBoundingClientRect('filterNavigatorBarItemContent', -300, 0, 100, 24);
    fireEvent.focus(item1);

    expect(content).toHaveStyle({ left: '0px' });
    jest.advanceTimersByTime(1000);
    expect(content).toHaveStyle({ left: '0px' });

    expect(scrollTo).toHaveBeenNthCalledWith(4, 0, 0);
  });

  it(`updates the scroll position and the button state on resize`, () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    initBoundingClientRect(100, 1000);
    initReduceMotion(false);

    let callResizeCallback: (() => void) | null = null;
    jest.spyOn(window, 'ResizeObserver').mockImplementation(
      jest.fn(function (callback: ResizeObserverCallback): ResizeObserver {
        const observer = {
          observe() {},
          unobserve() {},
          disconnect() {},
        };

        callResizeCallback = () => {
          callback([], observer);
        };

        return observer;
      })
    );

    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['item1', 'item2']}
        selectedItem={3}
        onPop={onPop}
      />
    );

    const parent = screen.getByTestId('FilterNavigatorBarScrollParent');
    const content = screen.getByTestId('FilterNavigatorBarScrollContent');

    expect(content).toHaveStyle({ left: '0px' });

    {
      const leftButton = screen.getByText('<');
      const rightButton = screen.getByText('>');

      expect(leftButton).toBeDisabled();
      expect(rightButton).toBeEnabled();

      fireEvent.click(rightButton);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(content).toHaveStyle({ left: '-90px' });
    }

    // The parent becomes larger than the content,
    updateBoundingClientRect(2000, 1000);
    act(() => {
      callResizeCallback!();
    });

    // No buttons should be rendered.
    expect(parent.previousElementSibling).toBeNull();
    expect(parent.nextElementSibling).toBeNull();

    // The scroll position should be reset.
    expect(content).toHaveStyle({ left: '0px' });

    // The parent becomes smaller than the content,
    updateBoundingClientRect(100, 1000);
    act(() => {
      callResizeCallback!();
    });

    {
      // The buttons should be rendered.
      const leftButton = screen.getByText('<');
      const rightButton = screen.getByText('>');

      expect(leftButton).toBeDisabled();
      expect(rightButton).toBeEnabled();

      expect(content).toHaveStyle({ left: '0px' });
    }
  });
});

describe('app/ProfileFilterNavigator', () => {
  const tabID = 123123;
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
      `);
    profile.pages = [
      {
        tabID: tabID,
        innerWindowID: 1,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
    ];
    profile.meta.configuration = {
      threads: [],
      features: [],
      capacity: 1000000,
      activeTabID: tabID,
    };

    // Change the root range for testing.
    const samples = profile.threads[0].samples;
    ensureExists(samples.time)[samples.length - 1] = 50;

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileFilterNavigator />
      </Provider>
    );

    return {
      ...store,
      ...renderResult,
    };
  }

  it('renders ProfileFilterNavigator properly', () => {
    const { container, dispatch } = setup();
    // Just root range
    expect(container.firstChild).toMatchSnapshot();

    // With committed range
    act(() => {
      dispatch(ProfileView.commitRange(0, 40));
    });
    expect(container.firstChild).toMatchSnapshot();

    // With preview selection
    act(() => {
      dispatch(
        ProfileView.updatePreviewSelection({
          isModifying: false,
          selectionStart: 10,
          selectionEnd: 10.1,
        })
      );
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the "Full Range" text as its first element', () => {
    const { getByText } = setup();
    expect(getByText(/Full Range/)).toBeInTheDocument();
  });

  it('opens a menu when the first item is clicked', () => {
    const { getByText } = setup();

    const item = getByText(/Full Range/).closest('.filterNavigatorBarItem');

    const listener = jest.fn();
    window.addEventListener('REACT_CONTEXTMENU_SHOW', listener);
    fireEvent.click(item!);
    window.removeEventListener('REACT_CONTEXTMENU_SHOW', listener);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REACT_CONTEXTMENU_SHOW',
      })
    );
  });
});
