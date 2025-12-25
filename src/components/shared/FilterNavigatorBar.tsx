/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import './FilterNavigatorBar.css';

type FilterNavigatorBarListItemProps = {
  readonly onClick?: null | ((index: number) => unknown);
  readonly index: number;
  readonly isFirstItem: boolean;
  readonly isLastItem: boolean;
  readonly isSelectedItem: boolean;
  readonly title?: string;
  readonly additionalClassName?: string;
  readonly children: React.ReactNode;
};

class FilterNavigatorBarListItem extends React.PureComponent<FilterNavigatorBarListItemProps> {
  _onClick = () => {
    const { index, onClick } = this.props;
    if (onClick) {
      onClick(index);
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
          <button type="button" className="filterNavigatorBarItemContent">
            {children}
          </button>
        ) : (
          <span className="filterNavigatorBarItemContent">{children}</span>
        )}
      </li>
    );
  }
}

type Props = {
  readonly className: string;
  readonly items: ReadonlyArray<React.ReactNode>;
  readonly onPop: (param: number) => void;
  readonly selectedItem: number;
  readonly uncommittedItem?: string;
};

type StateProps = {
  readonly canScrollLeft: boolean;
  readonly canScrollRight: boolean;
};

export class FilterNavigatorBar extends React.PureComponent<Props, StateProps> {
  _scrollContent: HTMLElement | null = null;
  _scrollParent: HTMLElement | null = null;
  _scrollLeft = 0;
  _autoScrollVelocity = 0;
  _autoScrollStopping = false;
  _autoScrollTimer: NodeJS.Timeout | null = null;

  override state = {
    canScrollLeft: false,
    canScrollRight: false,
  };

  _takeScrollParentRef = (scrollParent: HTMLElement | null) => {
    this._scrollParent = scrollParent;
  };
  _takeScrollContentRef = (scrollContent: HTMLElement | null) => {
    this._scrollContent = scrollContent;
  };

  _onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      this._scrollBy(e.deltaX);
    } else {
      this._scrollBy(e.deltaY);
    }
  };

  _onScrollLeftMouseDown = () => {
    this._startAutoScroll(-10);
  };
  _onScrollRightMouseDown = () => {
    this._startAutoScroll(10);
  };

  _onScrollMouseUp = () => {
    this._stopAutoScroll();
  };
  _onScrollMouseLeave = () => {
    this._stopAutoScroll();
  };

  _startAutoScroll = (velocity: number) => {
    this._autoScrollVelocity = velocity;
    this._autoScrollStopping = false;
    if (!this._autoScrollTimer) {
      this._autoScrollTimer = setInterval(this._autoScroll, 10);
    }
    this._scrollBy(this._autoScrollVelocity);
  };
  _stopAutoScroll = () => {
    this._autoScrollStopping = true;
  };
  _clearAutoScrollTimer = () => {
    this._autoScrollStopping = false;
    this._autoScrollVelocity = 0;
    if (this._autoScrollTimer) {
      clearInterval(this._autoScrollTimer);
      this._autoScrollTimer = null;
    }
  };

  _autoScroll = () => {
    const stopped = this._scrollBy(this._autoScrollVelocity);
    if (stopped) {
      this._clearAutoScrollTimer();
      return;
    }

    if (!this._autoScrollStopping) {
      return;
    }

    this._autoScrollVelocity = this._autoScrollVelocity * 0.9;
    if (Math.abs(this._autoScrollVelocity) < 1) {
      this._clearAutoScrollTimer();
    }
  };

  _scrollBy = (delta: number): boolean => {
    if (!this._scrollContent || !this._scrollParent) {
      return true;
    }
    let stopped = false;
    const contentWidth = this._scrollContent.getBoundingClientRect().width;
    const parentWidth = this._scrollParent.getBoundingClientRect().width;
    if (contentWidth <= parentWidth) {
      this._scrollLeft = 0;
      stopped = true;
      this._updateScrollButtonState();
    } else {
      this._scrollLeft -= delta;
      if (this._scrollLeft > 0) {
        this._scrollLeft = 0;
        stopped = true;
        this._updateScrollButtonState();
      }
      if (this._scrollLeft + contentWidth < parentWidth) {
        this._scrollLeft = parentWidth - contentWidth;
        stopped = true;
        this._updateScrollButtonState();
      }
    }
    this._scrollContent.style.left = this._scrollLeft + 'px';
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

  override componentDidUpdate = (prevProps: Props) => {
    this._updateScrollButtonState();

    const currentItems = this.props.items;
    const prevItems = prevProps.items;
    if (prevItems.length !== currentItems.length) {
      this._startAutoScroll(100);
    }
  };

  override render() {
    const { className, items, selectedItem, uncommittedItem, onPop } =
      this.props;
    const { canScrollLeft, canScrollRight } = this.state;

    const bar = (
      <ol className="filterNavigatorBar">
        {items.map((item, i) => (
          <FilterNavigatorBarListItem
            key={i}
            index={i}
            onClick={i === items.length - 1 && !uncommittedItem ? null : onPop}
            isFirstItem={i === 0}
            isLastItem={i === items.length - 1}
            isSelectedItem={i === selectedItem}
          >
            {item}
          </FilterNavigatorBarListItem>
        ))}
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
              'filterNavigatorBarScrollButton' +
              (canScrollLeft ? '' : ' disabled')
            }
            onMouseDown={this._onScrollLeftMouseDown}
            onMouseUp={this._onScrollMouseUp}
            onMouseLeave={this._onScrollMouseLeave}
            disabled={!canScrollLeft}
          >
            &lt;
          </button>
        ) : null}
        <div
          className={classNames('filterNavigatorBarScrollParent', className)}
          onWheel={this._onWheel}
          ref={this._takeScrollParentRef}
        >
          <div
            className="filterNavigatorBarScrollContent"
            ref={this._takeScrollContentRef}
          >
            {bar}
          </div>
        </div>
        {canScroll ? (
          <button
            type="button"
            className={
              'filterNavigatorBarScrollButton' +
              (canScrollRight ? '' : ' disabled')
            }
            onMouseDown={this._onScrollRightMouseDown}
            onMouseUp={this._onScrollMouseUp}
            onMouseLeave={this._onScrollMouseLeave}
            disabled={!canScrollRight}
          >
            &gt;
          </button>
        ) : null}
      </div>
    );
  }
}
