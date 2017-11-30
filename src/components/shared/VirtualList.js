/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import range from 'array-range';

import type { CssPixels } from '../../types/units';

type RenderItem = (*, number, number) => React.Node;

type VirtualListRowProps = {|
  +renderItem: RenderItem,
  +item: *,
  +index: number,
  +columnIndex: number,
  +isSpecial: boolean,
  // Items are not used directly, but are needed for strict equality checks so that
  // the components update correctly.
  +items: *,
|};

class VirtualListRow extends React.PureComponent<VirtualListRowProps> {
  render() {
    const { renderItem, item, index, columnIndex } = this.props;
    return renderItem(item, index, columnIndex);
  }
}

VirtualListRow.propTypes = {
  renderItem: PropTypes.func.isRequired,
  item: PropTypes.any.isRequired,
  index: PropTypes.number.isRequired,
  columnIndex: PropTypes.number.isRequired,
  // This prop is not used directly, it's used merely to force its rerendering,
  // especially when it's selected / unselected.
  isSpecial: PropTypes.bool, // eslint-disable-line react/no-unused-prop-types
};

type VirtualListInnerChunkProps = {|
  +className: string,
  +renderItem: RenderItem,
  +items: Array<*>,
  +specialItems: Array<*>,
  +visibleRangeStart: number,
  +visibleRangeEnd: number,
  +columnIndex: number,
|};

class VirtualListInnerChunk extends React.PureComponent<
  VirtualListInnerChunkProps
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
            />
          );
        })}
      </div>
    );
  }
}

VirtualListInnerChunk.propTypes = {
  className: PropTypes.string,
  renderItem: PropTypes.func.isRequired,
  items: PropTypes.array.isRequired,
  specialItems: PropTypes.array.isRequired,
  visibleRangeStart: PropTypes.number.isRequired,
  visibleRangeEnd: PropTypes.number.isRequired,
  columnIndex: PropTypes.number.isRequired,
};

type VirtualListInnerProps = {
  itemHeight: CssPixels,
  className: string,
  renderItem: RenderItem,
  items: *[],
  specialItems: *[],
  visibleRangeStart: number,
  visibleRangeEnd: number,
  columnIndex: number,
};

class VirtualListInner extends React.PureComponent<VirtualListInnerProps> {
  _container: ?HTMLElement;

  _containerCreated(element: ?HTMLDivElement) {
    this._container = element;
  }

  constructor(props) {
    super(props);
    (this: any)._containerCreated = this._containerCreated.bind(this);
  }

  getBoundingClientRect() {
    if (this._container) {
      return this._container.getBoundingClientRect();
    }
    return new window.DOMRect();
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
        ref={this._containerCreated}
        style={{
          height: `${items.length * itemHeight}px`,
          width: columnIndex === 1 ? '3000px' : undefined,
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
            />
          );
        })}
      </div>
    );
  }
}

VirtualListInner.propTypes = {
  itemHeight: PropTypes.number.isRequired,
  className: PropTypes.string,
  renderItem: PropTypes.func.isRequired,
  items: PropTypes.array.isRequired,
  specialItems: PropTypes.array.isRequired,
  visibleRangeStart: PropTypes.number.isRequired,
  visibleRangeEnd: PropTypes.number.isRequired,
  columnIndex: PropTypes.number.isRequired,
};

type VirtualListProps = {|
  +itemHeight: CssPixels,
  +className: string,
  +renderItem: RenderItem,
  +items: *[],
  +focusable: boolean,
  +specialItems: *[],
  +onKeyDown: KeyboardEvent => void,
  +onCopy: Event => void,
  +disableOverscan: boolean,
  +columnCount: number,
|};

type Geometry = {
  outerRect: DOMRect | ClientRect,
  innerRectY: CssPixels,
};

class VirtualList extends React.PureComponent<VirtualListProps> {
  _container: ?HTMLDivElement;
  _inner: ?VirtualListInner;
  _geometry: ?Geometry;

  constructor(props: VirtualListProps) {
    super(props);
    (this: any)._onScroll = this._onScroll.bind(this);
    (this: any)._onCopy = this._onCopy.bind(this);
    (this: any)._containerCreated = this._containerCreated.bind(this);
    (this: any)._innerCreated = this._innerCreated.bind(this);
  }

  _containerCreated(element: ?HTMLDivElement) {
    this._container = element;
  }

  _innerCreated(element: ?VirtualListInner) {
    this._inner = element;
  }

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

  _onScroll() {
    this._geometry = this._queryGeometry();
    this.forceUpdate();
  }

  _onCopy(event: Event) {
    if (document.activeElement === this._container) {
      this.props.onCopy(event);
    }
  }

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
    } = this.props;
    const columnCount = this.props.columnCount || 1;
    const { visibleRangeStart, visibleRangeEnd } = this.computeVisibleRange();
    return (
      <div
        className={className}
        ref={this._containerCreated}
        tabIndex={focusable ? 0 : -1}
        onKeyDown={onKeyDown}
      >
        <div className={`${className}InnerWrapper`}>
          {range(columnCount).map(columnIndex =>
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
              key={columnIndex}
              ref={columnIndex === 0 ? this._innerCreated : undefined}
            />
          )}
        </div>
      </div>
    );
  }
}

VirtualList.propTypes = {
  itemHeight: PropTypes.number.isRequired,
  className: PropTypes.string,
  renderItem: PropTypes.func.isRequired,
  items: PropTypes.array.isRequired,
  focusable: PropTypes.bool.isRequired,
  specialItems: PropTypes.array.isRequired,
  onKeyDown: PropTypes.func.isRequired,
  onCopy: PropTypes.func.isRequired,
  disableOverscan: PropTypes.bool,
  columnCount: PropTypes.number,
};

export default VirtualList;
