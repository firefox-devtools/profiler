/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import './FilterNavigatorBar.css';

import { isReducedMotion } from 'firefox-profiler/utils/reduced-motion';

type FilterNavigatorBarListItemProps = {
  readonly onClick?:
    | null
    | ((index: number, event: React.MouseEvent<HTMLElement>) => unknown);
  readonly onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  readonly index: number;
  readonly isFirstItem: boolean;
  readonly isLastItem: boolean;
  readonly isSelectedItem: boolean;
  readonly title?: string;
  readonly additionalClassName?: string;
  readonly children: React.ReactNode;
};

class FilterNavigatorBarListItem extends React.PureComponent<FilterNavigatorBarListItemProps> {
  _onClick = (event: React.MouseEvent<HTMLElement>) => {
    const { index, onClick } = this.props;
    if (onClick) {
      onClick(index, event);
    }
  };

  override render() {
    const {
      isFirstItem,
      isLastItem,
      isSelectedItem,
      children,
      additionalClassName,
      onClick,
      onFocus,
      title,
    } = this.props;
    return (
      <li
        className={classNames('filterNavigatorBarItem', additionalClassName, {
          filterNavigatorBarRootItem: isFirstItem,
          filterNavigatorBarSelectedItem: isSelectedItem,
          filterNavigatorBarLeafItem: isLastItem,
        })}
        title={title}
        onClick={onClick ? this._onClick : undefined}
      >
        {onClick ? (
          <button
            type="button"
            className="filterNavigatorBarItemContent"
            onFocus={onFocus}
          >
            {children}
          </button>
        ) : (
          <span className="filterNavigatorBarItemContent">{children}</span>
        )}
      </li>
    );
  }
}

const AUTO_SCROLL_INTERVAL: number = 10;
const CLICK_SCROLL_AMOUNT: number = 200;
const DELAYED_SAVE_FILTER_SCROLL_POS_TIMEOUT: number = 100;
const AUTO_SCROLL_VELOCITY: number = 10;
const SCROLL_TO_DURATION: number = 300;

type ScrollTarget = {
  readonly scrollBy: (pos: number) => boolean;
  readonly scrollTo: (pos: number) => boolean;
  readonly onStopAutoScroll: () => void;
};

class AutoScrollBase {
  target: ScrollTarget;
  timer: NodeJS.Timeout | null = null;

  constructor(target: ScrollTarget) {
    this.target = target;
  }

  start() {
    this.timer = setInterval(this.callback, AUTO_SCROLL_INTERVAL);
    this.callback();
  }

  callback = () => {};

  scrollTo(pos: number) {
    this.target.scrollTo(pos);
  }

  scrollBy(velocity: number) {
    const stopped = this.target.scrollBy(velocity);
    if (stopped) {
      this.stopImmediate();
    }
  }

  stopGradually() {
    this.stopImmediate();
  }

  stopImmediate() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;

    this.target.onStopAutoScroll();
  }

  allowOverflowToLeft() {
    return false;
  }
}

class AutoScrollFromTo extends AutoScrollBase {
  fromPos: number;
  toPos: number;
  endTime: number;
  allowOverflow: boolean;

  constructor(
    target: ScrollTarget,
    fromPos: number,
    toPos: number,
    allowOverflow: boolean
  ) {
    super(target);

    this.fromPos = fromPos;
    this.toPos = toPos;
    this.endTime = Date.now() + SCROLL_TO_DURATION;
    this.allowOverflow = allowOverflow;
  }

  override callback = () => {
    const now = Date.now();
    const diff = this.endTime - now;
    if (diff <= 0) {
      this.scrollTo(this.toPos);
      this.stopImmediate();
      return;
    }

    const t = (diff / SCROLL_TO_DURATION) ** 2;
    const pos = this.fromPos * t + this.toPos * (1 - t);
    this.scrollTo(pos);
  };

  override allowOverflowToLeft() {
    return this.allowOverflow;
  }
}

class AutoScrollVelocity extends AutoScrollBase {
  velocity: number;
  stopping: boolean;

  constructor(target: ScrollTarget, velocity: number) {
    super(target);
    this.velocity = velocity;
    this.stopping = false;
  }

  override callback = () => {
    if (this.stopping) {
      this.velocity = this.velocity * 0.9;
    }

    if (Math.abs(this.velocity) < 1) {
      this.stopImmediate();
      return;
    }

    this.scrollBy(this.velocity);
  };

  override stopGradually() {
    this.stopping = true;
  }
}

type Props = {
  readonly className: string;
  readonly items: ReadonlyArray<React.ReactNode>;
  readonly onPop: (param: number) => void;
  readonly onFirstItemClick?: (event: React.MouseEvent<HTMLElement>) => void;
  readonly selectedItem: number;
  readonly uncommittedItem?: string;
  // The consumer can specify the scroll postion and the callback for the
  // update, to share the scroll position across multiple components.
  readonly filterScrollPos?: number;
  readonly setFilterScrollPos?: (pos: number) => void;
};

type StateProps = {
  readonly canScrollLeft: boolean;
  readonly canScrollRight: boolean;
};

export class FilterNavigatorBar extends React.PureComponent<Props, StateProps> {
  // Elements for the scrolling.
  _scrollContent: HTMLElement | null = null;
  _scrollParent: HTMLElement | null = null;

  // In order to avoid re-rendering for each scroll, cache the scroll position
  // in this class, and save the scroll position to the parent component only
  // after the scroll finishses.
  _scrollLeft = 0;
  _scrollLeftInitialized = false;

  // In order to coalesce successive requests to save the scroll position,
  // use a timer callback with a flag to delay it again.
  _saveFilterScrollPosTimer: NodeJS.Timeout | null = null;
  _saveFilterScrollPosDelayAgain = false;

  // A reference to the currently-ongoing auto-scroll.
  // Auto-scroll is used for three purposes:
  //   * Keep scrolling while the scroll buttons are pressed
  //     (initiated by _startAutoScrollWithVelocity)
  //   * Scroll to the focused item
  //     (initiated by _startAutoScrollTo)
  //   * Scroll to thelast item when items are added or removed
  //     (also initiated by _startAutoScrollTo)
  _autoScroll: AutoScrollBase | null = null;

  // The scroll button listen to both mousedown/mouseup and click, in order to
  // perform the auto-scroll for mousedown/mouseup, and also perform an oneshot
  // scroll for other click events, such as keyboard access.
  // In order to avoid performing scroll twice, suppress the click event for
  // mouse click which is already handled by mousedown/mouseup.
  _ignoreNextClick = false;

  // Observe the resize of the bar, in order to update the scroll position
  // and the scroll buttons' state.
  _resizeObserver: ResizeObserver | null = null;

  override state = {
    canScrollLeft: false,
    canScrollRight: false,
  };

  _takeScrollContentRef = (scrollContent: HTMLElement | null) => {
    this._scrollContent = scrollContent;
    if (!this._scrollContent) {
      return;
    }
    this._scrollParent = this._scrollContent.parentNode as HTMLElement;
    if (!this._scrollParent) {
      return;
    }

    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(this._scrollParent);

    this._updateScrollLayout();
    this._updateScrollButtonState();
  };

  _onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    this._stopAutoScroll();

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      this.scrollBy(e.deltaX);
    } else {
      this.scrollBy(e.deltaY);
    }

    this._updateScrollButtonState();
    this._delayedSaveFilterScrollPos();
  };

  _onScrollLeftMouseDown = () => {
    this._onScrollMouseDown(-1);
  };
  _onScrollRightMouseDown = () => {
    this._onScrollMouseDown(1);
  };

  _onScrollMouseDown = (sign: number) => {
    this._ignoreNextClick = true;
    this._startAutoScrollWithVelocity(sign * AUTO_SCROLL_VELOCITY);
  };

  _onScrollLeftClick = () => {
    this._onScrollClick(-1);
  };
  _onScrollRightClick = () => {
    this._onScrollClick(1);
  };
  _onScrollClick = (sign: number) => {
    if (this._ignoreNextClick) {
      this._ignoreNextClick = false;
      return;
    }

    if (isReducedMotion()) {
      this.scrollBy(sign * CLICK_SCROLL_AMOUNT);

      this._updateScrollButtonState();
      this._delayedSaveFilterScrollPos();
    } else {
      this._startAutoScrollWithVelocity(sign * AUTO_SCROLL_VELOCITY);
      if (this._autoScroll) {
        this._autoScroll.stopGradually();
      }
    }
  };

  _onScrollMouseUp = () => {
    if (!this._autoScroll) {
      return;
    }

    if (isReducedMotion()) {
      this._stopAutoScroll();
    } else {
      this._autoScroll.stopGradually();
    }
  };

  _startAutoScrollWithVelocity = (velocity: number) => {
    this._stopAutoScroll();

    this._autoScroll = new AutoScrollVelocity(this, velocity);
    this._autoScroll.start();
  };
  _startAutoScrollTo = (pos: number, allowOverflow: boolean) => {
    this._stopAutoScroll();

    this._autoScroll = new AutoScrollFromTo(
      this,
      this._scrollLeft,
      pos,
      allowOverflow
    );
    this._autoScroll.start();
  };
  _stopAutoScroll = () => {
    if (!this._autoScroll) {
      return;
    }

    this._autoScroll.stopImmediate();
    this._autoScroll = null;
  };

  /* This method is used by AutoScrollBase. */
  scrollBy = (delta: number): boolean => {
    this._scrollLeft -= delta;
    const stopped = this._updateScrollLayout();
    if (stopped) {
      this._updateScrollButtonState();
    }
    return stopped;
  };

  /* This method is used by AutoScrollBase. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  scrollTo = (pos: number): boolean => {
    this._scrollLeft = pos;
    const stopped = this._updateScrollLayout();
    if (stopped) {
      this._updateScrollButtonState();
    }
    return stopped;
  };

  /* This method is used by AutoScrollBase. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  onStopAutoScroll = () => {
    this._autoScroll = null;
    this._updateScrollButtonState();
    this._delayedSaveFilterScrollPos();
  };

  _allowScrollOverflowToLeft = (): boolean => {
    if (!this._autoScroll) {
      return false;
    }

    return this._autoScroll.allowOverflowToLeft();
  };

  _updateScrollLayout = () => {
    if (!this._scrollContent || !this._scrollParent) {
      return true;
    }

    const contentWidth = this._scrollContent.getBoundingClientRect().width;
    const parentWidth = this._scrollParent.getBoundingClientRect().width;

    let stopped = false;

    if (contentWidth <= parentWidth) {
      this._scrollLeft = 0;
      stopped = true;
    } else {
      if (this._scrollLeft >= 0) {
        this._scrollLeft = 0;
        stopped = true;
      }
      if (
        !this._allowScrollOverflowToLeft() &&
        this._scrollLeft + contentWidth <= parentWidth
      ) {
        this._scrollLeft = parentWidth - contentWidth;
        stopped = true;
      }
    }

    this._scrollContent.style.left = Math.round(this._scrollLeft) + 'px';

    return stopped;
  };

  _updateScrollButtonState = () => {
    if (!this._scrollContent || !this._scrollParent) {
      return;
    }

    let canScrollLeft = true;
    let canScrollRight = true;

    if (this._scrollLeft === 0) {
      canScrollLeft = false;
    }

    const contentWidth = this._scrollContent.getBoundingClientRect().width;
    const parentWidth = this._scrollParent.getBoundingClientRect().width;

    if (contentWidth <= parentWidth) {
      canScrollLeft = false;
      canScrollRight = false;
    }

    if (this._scrollLeft + contentWidth <= parentWidth) {
      canScrollRight = false;
    }

    if (
      canScrollLeft === this.state.canScrollLeft &&
      canScrollRight === this.state.canScrollRight
    ) {
      return;
    }

    this.setState({
      canScrollLeft,
      canScrollRight,
    });
  };

  _delayedSaveFilterScrollPos = () => {
    const { setFilterScrollPos } = this.props;
    if (!setFilterScrollPos) {
      return;
    }

    if (this._saveFilterScrollPosTimer) {
      this._saveFilterScrollPosDelayAgain = true;
      return;
    }

    this._saveFilterScrollPosTimer = setTimeout(() => {
      this._saveFilterScrollPosTimer = null;

      if (this._saveFilterScrollPosDelayAgain) {
        this._saveFilterScrollPosDelayAgain = false;
        this._delayedSaveFilterScrollPos();
        return;
      }

      this._saveFilterScrollPos();
    }, DELAYED_SAVE_FILTER_SCROLL_POS_TIMEOUT);
  };

  _saveFilterScrollPos = () => {
    const { setFilterScrollPos, filterScrollPos } = this.props;
    if (setFilterScrollPos && filterScrollPos !== this._scrollLeft) {
      setFilterScrollPos(Math.round(this._scrollLeft));
    }
  };

  override componentWillUnmount() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _onResize = () => {
    const prev = this._scrollLeft;
    this._updateScrollLayout();
    if (prev !== this._scrollLeft) {
      this._delayedSaveFilterScrollPos();
    }
    this._updateScrollButtonState();
  };

  override componentDidUpdate = (prevProps: Props) => {
    if (!this._scrollContent || !this._scrollParent) {
      return;
    }

    const currentItems = this.props.items;
    const prevItems = prevProps.items;

    if (prevItems.length !== currentItems.length) {
      const contentWidth = this._scrollContent.getBoundingClientRect().width;
      const parentWidth = this._scrollParent.getBoundingClientRect().width;

      const expectedLeft = parentWidth - contentWidth;
      if (isReducedMotion()) {
        this._scrollLeft = parentWidth - contentWidth;
      } else {
        this._startAutoScrollTo(expectedLeft, true);
      }
    }

    const prev = this._scrollLeft;
    this._updateScrollLayout();
    if (prev !== this._scrollLeft) {
      this._delayedSaveFilterScrollPos();
    }
    this._updateScrollButtonState();
  };

  _onItemFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (!this._scrollParent || !this._scrollContent) {
      return;
    }

    // Focusing the element can scroll the "overflow: hidden" element.
    // Reset the scroll, so that the following code can properly scroll to
    // the focused element.
    this._scrollParent.scrollTo(0, 0);

    const BUTTON_WIDTH = 24;
    const SCROLL_MARGIN = 32;

    const itemRect = e.target.getBoundingClientRect();
    const parentRect = this._scrollParent.getBoundingClientRect();
    if (itemRect.left < parentRect.left + BUTTON_WIDTH) {
      const diff = itemRect.left - (parentRect.left + BUTTON_WIDTH);
      if (isReducedMotion()) {
        this.scrollBy(diff - SCROLL_MARGIN);

        this._updateScrollButtonState();
        this._delayedSaveFilterScrollPos();
      } else {
        this._startAutoScrollTo(this._scrollLeft - diff + SCROLL_MARGIN, false);
      }
    } else if (itemRect.right > parentRect.right - BUTTON_WIDTH) {
      const diff = itemRect.right - (parentRect.right - BUTTON_WIDTH);
      if (isReducedMotion()) {
        this.scrollBy(diff + SCROLL_MARGIN);

        this._updateScrollButtonState();
        this._delayedSaveFilterScrollPos();
      } else {
        this._startAutoScrollTo(this._scrollLeft - diff - SCROLL_MARGIN, false);
      }
    }
  };

  _onPop = (index: number, _event: React.MouseEvent<HTMLElement>) => {
    const { onPop } = this.props;
    onPop(index);
  };

  _onFirstItemClick = (_: number, event: React.MouseEvent<HTMLElement>) => {
    const { onFirstItemClick } = this.props;
    if (onFirstItemClick) {
      onFirstItemClick(event);
    }
  };

  override render() {
    const {
      className,
      items,
      selectedItem,
      uncommittedItem,
      onFirstItemClick,
      filterScrollPos,
    } = this.props;
    const { canScrollLeft, canScrollRight } = this.state;

    if (!this._scrollLeftInitialized) {
      this._scrollLeftInitialized = true;
      this._scrollLeft = filterScrollPos ?? 0;
    }

    const bar = (
      <ol className={classNames('filterNavigatorBar', className)}>
        {items.map((item, i) => {
          let onClick = null;
          if (i === 0 && !uncommittedItem && onFirstItemClick) {
            onClick = this._onFirstItemClick;
          } else if (i === items.length - 1 && !uncommittedItem) {
            onClick = null;
          } else {
            onClick = this._onPop;
          }

          return (
            <FilterNavigatorBarListItem
              key={i}
              index={i}
              onClick={onClick}
              onFocus={this._onItemFocus}
              isFirstItem={i === 0}
              isLastItem={i === items.length - 1}
              isSelectedItem={i === selectedItem}
            >
              {item}
            </FilterNavigatorBarListItem>
          );
        })}
        {uncommittedItem ? (
          <FilterNavigatorBarListItem
            index={items.length}
            isFirstItem={false}
            isLastItem={true}
            isSelectedItem={false}
            additionalClassName="filterNavigatorBarUncommittedItem"
            title={uncommittedItem}
          >
            {uncommittedItem}
          </FilterNavigatorBarListItem>
        ) : null}
      </ol>
    );

    const canScroll = canScrollLeft || canScrollRight;

    return (
      <div className="filterNavigatorBarScrollContainer">
        {canScroll ? (
          <button
            type="button"
            className={
              'filterNavigatorBarScrollButtonLeft' +
              (canScrollLeft ? '' : ' disabled')
            }
            onClick={this._onScrollLeftClick}
            onMouseDown={this._onScrollLeftMouseDown}
            onMouseUp={this._onScrollMouseUp}
            onMouseLeave={this._onScrollMouseUp}
            disabled={!canScrollLeft}
          >
            &lt;
          </button>
        ) : null}
        <div
          className={classNames('filterNavigatorBarScrollParent', className)}
          onWheel={this._onWheel}
          data-testid="FilterNavigatorBarScrollParent"
        >
          <div
            className="filterNavigatorBarScrollContent"
            style={{ left: Math.round(this._scrollLeft) + 'px' }}
            ref={this._takeScrollContentRef}
            data-testid="FilterNavigatorBarScrollContent"
          >
            {bar}
          </div>
        </div>
        {canScroll ? (
          <button
            type="button"
            className={
              'filterNavigatorBarScrollButtonRight' +
              (canScrollRight ? '' : ' disabled')
            }
            onClick={this._onScrollRightClick}
            onMouseDown={this._onScrollRightMouseDown}
            onMouseUp={this._onScrollMouseUp}
            onMouseLeave={this._onScrollMouseUp}
            disabled={!canScrollRight}
          >
            &gt;
          </button>
        ) : null}
      </div>
    );
  }
}
