/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * VirtualList implements a virtualized component. This means it doesn't
 * render only the items that are currently displayed, and makes long list
 * manageable in the Web platform.
 * This implementation has some unique features that make it especially
 * performant, but also comes with constraints.
 *
 * The items are organized in chunks:
 *
 * .
 * | 16 items
 * |
 * -
 * |
 * | 16 items
 * |
 * -
 * |
 * | 16 items
 * .
 *
 * Depending on the current scroll position, the logic decides which chunk(s)
 * will be rendered. If `disableOverscan` is false (this is the default) we
 * render more items before and after the visible part so that when scrolling
 * the user doesn't see a white background while the app catches up.
 *
 * Using chunks avoids the need to render often, and thus improves performance.
 */

import * as React from 'react';
import classNames from 'classnames';
import range from 'array-range';
import { getResizeObserverWrapper } from 'firefox-profiler/utils/resize-observer-wrapper';

import type { CssPixels } from 'firefox-profiler/types';

type RenderItem<Item> = (Item, number, number) => React.Node;

type VirtualListRowProps<Item> = {
  readonly renderItem: RenderItem<Item>,
  readonly item: Item,
  readonly index: number,
  readonly columnIndex: number,
  // These properties are not used directly, but are needed for strict equality
  // checks so that the components update correctly.
  // * `forceRenderControl` is used when we want to update one row or a few rows only,
  //   this is typically when the selection changes and both the old and the new
  //   selection need to be changed.
  //   It needs to change whenever the row should be updated, so it should be
  //   computed from the values that control these update.
  readonly forceRenderItem: string,
  // * `items` contains the full items, so that we update the whole list
  //   whenever the source changes. This is necessary because often `item` is a
  //   native value (eg a number), and shallow checking only `item` won't always
  //   give the expected behavior.
  readonly items: $ReadOnlyArray<Item>,
  // * `forceRender` is passed through directly from the main VirtualList
  //   component to the row as a way to update the full list for reasons
  //   unbeknownst to this component. This can be used for example in chart-like
  //   panels where we'd want to redraw if some source value necessary to the
  //   computation changes.
  +forceRender?: number | string,
};

class VirtualListRow<Item> extends React.PureComponent<
  VirtualListRowProps<Item>,
> {
  render() {
    const { renderItem, item, index, columnIndex } = this.props;
    return renderItem(item, index, columnIndex);
  }
}

type VirtualListInnerChunkProps<Item> = {
  readonly className: string,
  readonly renderItem: RenderItem<Item>,
  readonly items: $ReadOnlyArray<Item>,
  readonly specialItems: $ReadOnlyArray<Item | void>,
  readonly visibleRangeStart: number,
  readonly visibleRangeEnd: number,
  readonly columnIndex: number,
  +forceRender?: number | string,
};

class VirtualListInnerChunk<Item> extends React.PureComponent<
  VirtualListInnerChunkProps<Item>,
> {
  render() {
    const {
      className,
      renderItem,
      items,
      specialItems,
      visibleRangeStart,
      visibleRangeEnd,
      columnIndex,
      forceRender,
    } = this.props;

    return (
      <div className={className}>
        {range(
          visibleRangeStart,
          Math.max(visibleRangeStart, visibleRangeEnd)
        ).map((i) => {
          const item = items[i];

          // We compute forceRenderItem from the first position of item in the list,
          // and the number of occurrences. Indeed we want to rerender this
          // specific item whenever one of these values changes.
          const firstPosOfItem = specialItems.indexOf(item);
          const countOfItem = specialItems.reduce(
            (acc, specialItem) => (specialItem === item ? acc + 1 : acc),
            0
          );
          const forceRenderItem = `${firstPosOfItem}|${countOfItem}`;

          return (
            <VirtualListRow
              key={i}
              index={i}
              columnIndex={columnIndex}
              renderItem={renderItem}
              item={item}
              items={items}
              forceRenderItem={forceRenderItem}
              forceRender={forceRender}
            />
          );
        })}
      </div>
    );
  }
}

type VirtualListInnerProps<Item> = {
  readonly itemHeight: CssPixels,
  readonly className: string,
  readonly renderItem: RenderItem<Item>,
  readonly items: $ReadOnlyArray<Item>,
  readonly specialItems: $ReadOnlyArray<Item | void>,
  readonly visibleRangeStart: number,
  readonly visibleRangeEnd: number,
  readonly columnIndex: number,
  readonly containerWidth: CssPixels,
  +forceRender?: number | string,
};

class VirtualListInner<Item> extends React.PureComponent<
  VirtualListInnerProps<Item>,
> {
  render() {
    const {
      itemHeight,
      className,
      renderItem,
      items,
      specialItems,
      visibleRangeStart,
      visibleRangeEnd,
      columnIndex,
      containerWidth,
      forceRender,
    } = this.props;

    const chunkSize = 16;
    const startChunkIndex = Math.floor(visibleRangeStart / chunkSize);
    const endChunkIndex = Math.ceil(visibleRangeEnd / chunkSize);
    const chunks = range(
      startChunkIndex,
      Math.max(startChunkIndex, endChunkIndex)
    ).map((c) => c * chunkSize);

    return (
      <div
        className={className}
        // Add padding to list height to account for overlay scrollbars.
        style={{
          height: `${(items.length + 1) * itemHeight}px`,
          minWidth: columnIndex === 1 ? containerWidth : undefined,
        }}
      >
        <div
          className={`${className}TopSpacer`}
          key={-1}
          style={{ height: Math.max(0, visibleRangeStart) * itemHeight + 'px' }}
        />
        {chunks.map((chunkStart) => {
          return (
            <VirtualListInnerChunk
              className={`${className}InnerChunk`}
              key={chunkStart}
              visibleRangeStart={Math.max(chunkStart, visibleRangeStart)}
              visibleRangeEnd={Math.min(
                chunkStart + chunkSize,
                visibleRangeEnd
              )}
              columnIndex={columnIndex}
              renderItem={renderItem}
              items={items}
              specialItems={specialItems}
              forceRender={forceRender}
            />
          );
        })}
      </div>
    );
  }
}

type VirtualListProps<Item> = {
  readonly itemHeight: CssPixels,
  readonly className: string,
  readonly renderItem: RenderItem<Item>,
  readonly items: $ReadOnlyArray<Item>,
  readonly focusable: boolean,
  readonly specialItems: $ReadOnlyArray<Item | void>,
  +onKeyDown?: (SyntheticKeyboardEvent<>) => void,
  +onCopy?: (ClipboardEvent) => void,
  // This is called when the mouse leaves the list as it is rendered. That is if
  // there isn't enough item to fill the component's height, and the user moves
  // the mouse below the items, this callback would be called.
  +onMouseLeaveRenderedList?: () => void,
  // Set `disableOverscan` to `true` when you expect a lot of updates in a short
  // time: this will render only the visible part, which makes each update faster.
  readonly disableOverscan: boolean,
  readonly columnCount: number,
  readonly containerWidth: CssPixels,
  // `forceRender` is passed through directly from the main VirtualList
  // component to the row as a way to update the full list for reasons
  // unbeknownst to this component. This can be used for example in chart-like
  // panels where we'd want to redraw if some source value necessary to the
  // computation changes.
  +forceRender?: number | string,
  // The next 3 props will be applied to the underlying DOM element.
  // They're important for accessibility (especially focus and navigation).
  +ariaLabel?: string,
  +ariaRole?: string,
  // Aria-activedescendant specifies the children's "virtual" focus.
  +ariaActiveDescendant?: null | string,
};

type VirtualListState = {
  // This value is updated from the scroll event.
  scrollTop: CssPixels,
  // This is updated from a resize observer.
  containerHeight: CssPixels,
};

export class VirtualList<Item> extends React.PureComponent<
  VirtualListProps<Item>,
  VirtualListState,
> {
  _container: { current: HTMLDivElement | null } = React.createRef();
  state = { scrollTop: 0, containerHeight: 0 };

  componentDidMount() {
    document.addEventListener('copy', this._onCopy, false);
    const container = this._container.current;
    if (!container) {
      throw new Error(
        'The container was assumed to exist while mounting The VirtualList.'
      );
    }

    getResizeObserverWrapper().subscribe(container, this._resizeListener);
  }

  componentWillUnmount() {
    document.removeEventListener('copy', this._onCopy, false);
    const container = this._container.current;
    if (!container) {
      throw new Error(
        'The container was assumed to exist while unmounting The VirtualList.'
      );
    }
    getResizeObserverWrapper().unsubscribe(container, this._resizeListener);
  }

  // The listener is only called when the document is visible.
  _resizeListener = (contentRect: DOMRectReadOnly) => {
    this.setState({ containerHeight: contentRect.height });
  };

  _onScroll = (event: SyntheticEvent<HTMLElement>) => {
    this.setState({
      scrollTop: event.currentTarget.scrollTop,
    });
  };

  _onCopy = (event: ClipboardEvent) => {
    const { onCopy } = this.props;
    if (onCopy && document.activeElement === this._container.current) {
      onCopy(event);
    }
  };

  computeVisibleRange() {
    const { itemHeight, disableOverscan } = this.props;
    const { scrollTop, containerHeight } = this.state;
    const overscan = disableOverscan ? 0 : 25;
    const chunkSize = 16;
    let visibleRangeStart = Math.floor(scrollTop / itemHeight) - overscan;
    let visibleRangeEnd =
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan;
    if (!disableOverscan) {
      visibleRangeStart = Math.floor(visibleRangeStart / chunkSize) * chunkSize;
      visibleRangeEnd = Math.ceil(visibleRangeEnd / chunkSize) * chunkSize;
    }
    return { visibleRangeStart, visibleRangeEnd };
  }

  /**
   * Scroll the container horizontally if necessary.
   *
   * - container is the container to be scrolled.
   * - itemX is the horizontal position of the item.
   * - offsetX is the offset at the left of the scrolled column, if there are
   *   sticky columns at the left. This is basically the width of the sticky
   *   elements.
   *
   * Here is a diagram showing this visually:
   *
   * |------|---------------item---------|
   *                  itemX ^
   *        ^ offsetX
   *         <-------------------------->   The part that will be scrolled.
   *  <--------------------------------->   The container.
   *
   * The gotcha here is that scrollLeft applies to the container, but only the
   * right part is scrolled, because of the sticky positioning for the offset
   * part.
   */
  _scrollContainerHorizontally(
    container: HTMLDivElement,
    itemX: CssPixels,
    offsetX: CssPixels
  ) {
    const interestingWidth = 400;
    const itemLeft = itemX;
    const itemRight = itemX + interestingWidth;
    const scrollingColumnWidth = container.clientWidth - offsetX;

    if (container.scrollLeft > itemLeft) {
      // Is the item scrolled to much towards the left (which means the
      // container is scrolled to the right too much, scrollLeft is too high)?
      // If yes, scroll so that its left edge is visible.
      container.scrollLeft = itemLeft;
    } else if (container.scrollLeft + scrollingColumnWidth < itemRight) {
      // Is the item scrolled to much towards the right (which means the
      // container is scrolled too much to the left, scrollLeft is too small)?
      // If yes, scroll so that its right edge is visible.

      // The Math.min operation accounts for the case where the
      // scrollingColumnWidth is smaller than interestingWidth. In that case we
      // want to align with the left edge.
      container.scrollLeft = Math.min(
        itemLeft,
        itemRight - scrollingColumnWidth
      );
    }
  }

  /**
   * Scroll the minimum amount so that the requested item is fully visible
   * in the viewport. If the item is not already visible, this means that
   * it'll be shown near one of the edges of the viewport.
   * We're keeping a margin of a few items after and before the intended item,
   * if there are any.
   * * itemIndex is the index for the item to scroll to
   * * itemX is it's horizontal position in its column
   * * offsetX is how much the horizontal position is offset by fixed columns, if applicable.
   */
  /* This method is used by users of this component. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  scrollItemIntoView(
    itemIndex: number,
    itemX: CssPixels,
    offsetX: CssPixels = 0
  ) {
    const container = this._container.current;
    if (!container) {
      return;
    }

    let scrollMargin = 3 * this.props.itemHeight;
    if (container.clientHeight < 2 * scrollMargin) {
      // The container is too small to use a margin.
      scrollMargin = 0;
    }

    const itemTop = itemIndex * this.props.itemHeight;
    const itemTopWithMargin = itemTop - scrollMargin;
    const itemBottom = itemTop + this.props.itemHeight;
    const itemBottomWithMargin = itemBottom + scrollMargin;

    const bigJump = 16 * this.props.itemHeight;
    if (
      itemTop + bigJump < container.scrollTop ||
      itemBottom - bigJump > container.scrollTop + container.clientHeight
    ) {
      // The item we want to scroll to is located more than 16 lines away from
      // one of the edges. This is a "big jump", and in this case we put the
      // scrolled item at the center of the panel.
      const scrollTopToCenterItem =
        itemTop - (container.clientHeight - this.props.itemHeight) / 2;
      // This Math.min operation handles the unlikely case where clientHeight is
      // smaller than itemHeight.
      container.scrollTop = Math.min(itemTopWithMargin, scrollTopToCenterItem);
    } else if (itemTopWithMargin < container.scrollTop) {
      // The item is above (either above the current visible items or in the margin).
      container.scrollTop = itemTopWithMargin;
    } else if (
      itemBottomWithMargin >
      container.scrollTop + container.clientHeight
    ) {
      // The item is below (either below the current visible items or in the
      // bottom margin).

      // This Math.min operation handles the unlikely case where clientHeight is
      // smaller than itemHeight. In that case we make sure that the top of the
      // container is aligned with the top of the item.
      container.scrollTop = Math.min(
        itemTopWithMargin,
        itemBottomWithMargin - container.clientHeight
      );
    }

    this._scrollContainerHorizontally(container, itemX, offsetX);
  }

  /* This method is used by users of this component. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus() {
    const container = this._container.current;
    if (container) {
      container.focus();
    }
  }

  _onMouseLeaveInnerWrapper = () => {
    if (this.props.onMouseLeaveRenderedList) {
      this.props.onMouseLeaveRenderedList();
    }
  };

  render() {
    const {
      itemHeight,
      className,
      renderItem,
      items,
      focusable,
      specialItems,
      onKeyDown,
      containerWidth,
      forceRender,
      ariaRole,
      ariaLabel,
      ariaActiveDescendant,
    } = this.props;
    const columnCount = this.props.columnCount || 1;
    const { visibleRangeStart, visibleRangeEnd } = this.computeVisibleRange();
    return (
      <div
        className={className}
        ref={this._container}
        tabIndex={focusable ? 0 : -1}
        onKeyDown={onKeyDown}
        role={ariaRole}
        aria-label={ariaLabel}
        aria-activedescendant={ariaActiveDescendant}
        onScroll={this._onScroll}
      >
        <div
          className={`${className}InnerWrapper`}
          onMouseLeave={this._onMouseLeaveInnerWrapper}
        >
          {range(columnCount).map((columnIndex) => (
            <VirtualListInner
              className={classNames(
                `${className}Inner`,
                `${className}Inner${columnIndex}`
              )}
              visibleRangeStart={Math.max(0, visibleRangeStart)}
              visibleRangeEnd={Math.min(items.length, visibleRangeEnd)}
              itemHeight={itemHeight}
              renderItem={renderItem}
              items={items}
              specialItems={specialItems}
              columnIndex={columnIndex}
              containerWidth={containerWidth}
              forceRender={forceRender}
              key={columnIndex}
            />
          ))}
        </div>
      </div>
    );
  }
}
