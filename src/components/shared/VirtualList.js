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

import type { CssPixels } from '../../types/units';

type RenderItem = (*, number, number) => React.Node;

type VirtualListRowProps = {|
  +renderItem: RenderItem,
  +item: *,
  +index: number,
  +columnIndex: number,
  // These properties are not used directly, but are needed for strict equality
  // checks so that the components update correctly.
  // * `isSpecial` is used when we want to update one row or a few rows only,
  //   this is typically when the selection changes and both the old and the new
  //   selection need to be changed.
  +isSpecial: boolean,
  // * `items` contains the full items, so that we update the whole list
  //   whenever the source changes. This is necessary because often `item` is a
  //   native value (eg a number), and shallow checking only `item` won't always
  //   give the expected behavior.
  +items: *,
  // * `forceRender` is passed through directly from the main VirtualList
  //   component to the row as a way to update the full list for reasons
  //   unbeknownst to this component. This can be used for example in chart-like
  //   panels where we'd want to redraw if some source value necessary to the
  //   computation changes.
  +forceRender?: number | string,
|};

class VirtualListRow extends React.PureComponent<VirtualListRowProps> {
  render() {
    const { renderItem, item, index, columnIndex } = this.props;
    return renderItem(item, index, columnIndex);
  }
}

type VirtualListInnerChunkProps = {|
  +className: string,
  +renderItem: RenderItem,
  +items: *[],
  +specialItems: *[],
  +visibleRangeStart: number,
  +visibleRangeEnd: number,
  +columnIndex: number,
  +forceRender?: number | string,
|};

class VirtualListInnerChunk extends React.PureComponent<VirtualListInnerChunkProps> {
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
        ).map(i => {
          const item = items[i];
          return (
            <VirtualListRow
              key={i}
              index={i}
              columnIndex={columnIndex}
              renderItem={renderItem}
              item={item}
              items={items}
              isSpecial={specialItems.includes(item)}
              forceRender={forceRender}
            />
          );
        })}
      </div>
    );
  }
}

type VirtualListInnerProps = {|
  +itemHeight: CssPixels,
  +className: string,
  +renderItem: RenderItem,
  +items: *[],
  +specialItems: *[],
  +visibleRangeStart: number,
  +visibleRangeEnd: number,
  +columnIndex: number,
  +containerWidth: CssPixels,
  +forceRender?: number | string,
|};

class VirtualListInner extends React.PureComponent<VirtualListInnerProps> {
  _container: ?HTMLElement;

  _takeContainerRef = (element: ?HTMLDivElement) => {
    this._container = element;
  };

  getBoundingClientRect() {
    if (this._container) {
      return this._container.getBoundingClientRect();
    }
    return new DOMRect(0, 0, 0, 0);
  }

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
    ).map(c => c * chunkSize);

    return (
      <div
        className={className}
        ref={this._takeContainerRef}
        style={{
          height: `${items.length * itemHeight}px`,
          width: columnIndex === 1 ? containerWidth : undefined,
        }}
      >
        <div
          className={`${className}TopSpacer`}
          key={-1}
          style={{ height: Math.max(0, visibleRangeStart) * itemHeight + 'px' }}
        />
        {chunks.map(chunkStart => {
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

type VirtualListProps = {|
  +itemHeight: CssPixels,
  +className: string,
  +renderItem: RenderItem,
  +items: *[],
  +focusable: boolean,
  +specialItems: *[],
  +onKeyDown: KeyboardEvent => void,
  +onCopy: Event => void,
  // Set `disableOverscan` to `true` when you expect a lot of updates in a short
  // time: this will render only the visible part, which makes each update faster.
  +disableOverscan: boolean,
  +columnCount: number,
  +containerWidth: CssPixels,
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
|};

type Geometry = {
  // getBoundingClientRect in the Flow definitions is wrong, and labels the return values
  // as a ClientRect, and not a DOMRect. https://github.com/facebook/flow/issues/5475
  //
  // Account for that here:
  outerRect: DOMRect | ClientRect,
  innerRectY: CssPixels,
};

class VirtualList extends React.PureComponent<VirtualListProps> {
  _container: ?HTMLDivElement;
  _inner: ?VirtualListInner;
  _geometry: ?Geometry;

  _takeContainerRef = (element: ?HTMLDivElement) => {
    this._container = element;
  };

  _innerCreated = (element: ?VirtualListInner) => {
    this._inner = element;
  };

  componentDidMount() {
    document.addEventListener('copy', this._onCopy, false);
    const container = this._container;
    if (!container) {
      throw new Error(
        'The container was assumed to exist while mounting The VirtualList.'
      );
    }
    container.addEventListener('scroll', this._onScroll);
    this._onScroll(); // for initial size
  }

  componentWillUnmount() {
    document.removeEventListener('copy', this._onCopy, false);
    const container = this._container;
    if (!container) {
      throw new Error(
        'The container was assumed to exist while unmounting The VirtualList.'
      );
    }
    container.removeEventListener('scroll', this._onScroll);
  }

  _onScroll = () => {
    this._geometry = this._queryGeometry();
    this.forceUpdate();
  };

  _onCopy = (event: Event) => {
    if (document.activeElement === this._container) {
      this.props.onCopy(event);
    }
  };

  _queryGeometry(): Geometry | void {
    const container = this._container;
    const inner = this._inner;
    if (!container || !inner) {
      return undefined;
    }
    const outerRect = container.getBoundingClientRect();
    const innerRectY = inner.getBoundingClientRect().top;
    return { outerRect, innerRectY };
  }

  computeVisibleRange() {
    const { itemHeight, disableOverscan } = this.props;
    if (!this._geometry) {
      return { visibleRangeStart: 0, visibleRangeEnd: 100 };
    }
    const { outerRect, innerRectY } = this._geometry;
    const overscan = disableOverscan ? 0 : 25;
    const chunkSize = 16;
    let visibleRangeStart =
      Math.floor((outerRect.top - innerRectY) / itemHeight) - overscan;
    let visibleRangeEnd =
      Math.ceil((outerRect.bottom - innerRectY) / itemHeight) + overscan;
    if (!disableOverscan) {
      visibleRangeStart = Math.floor(visibleRangeStart / chunkSize) * chunkSize;
      visibleRangeEnd = Math.ceil(visibleRangeEnd / chunkSize) * chunkSize;
    }
    return { visibleRangeStart, visibleRangeEnd };
  }

  scrollItemIntoView(itemIndex: number, offsetX: CssPixels) {
    if (!this._container) {
      return;
    }
    const itemTop = itemIndex * this.props.itemHeight;
    const itemBottom = itemTop + this.props.itemHeight;
    const container = this._container;

    if (container.scrollTop > itemTop) {
      container.scrollTop = itemTop;
    } else if (container.scrollTop + container.clientHeight < itemBottom) {
      container.scrollTop = Math.min(
        itemTop,
        itemBottom - container.clientHeight
      );
    }

    const interestingWidth = 400;
    const itemLeft = offsetX;
    const itemRight = itemLeft + interestingWidth;

    if (container.scrollLeft > itemLeft) {
      container.scrollLeft = itemLeft;
    } else if (container.scrollLeft + container.clientWidth < itemRight) {
      container.scrollLeft = Math.min(
        itemLeft,
        itemRight - container.clientWidth
      );
    }
  }

  focus() {
    const container = this._container;
    if (container) {
      container.focus();
    }
  }

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
        ref={this._takeContainerRef}
        tabIndex={focusable ? 0 : -1}
        onKeyDown={onKeyDown}
        role={ariaRole}
        aria-label={ariaLabel}
        aria-activedescendant={ariaActiveDescendant}
      >
        <div className={`${className}InnerWrapper`}>
          {range(columnCount).map(columnIndex => (
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
              ref={columnIndex === 0 ? this._innerCreated : undefined}
            />
          ))}
        </div>
      </div>
    );
  }
}

export default VirtualList;
