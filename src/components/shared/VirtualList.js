/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';
import range from 'array-range';

class VirtualListRow extends PureComponent {
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
  isSpecial: PropTypes.bool,
};

class VirtualListInnerChunk extends PureComponent {
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

class VirtualListInner extends PureComponent {
  constructor(props) {
    super(props);
    this._containerCreated = e => {
      this._container = e;
    };
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

class VirtualList extends PureComponent {
  constructor(props) {
    super(props);
    this._onScroll = this._onScroll.bind(this);
    this._onCopy = this._onCopy.bind(this);
    this._geometry = undefined;
    this._containerCreated = elem => {
      this._container = elem;
    };
    this._innerCreated = elem => {
      this._inner = elem;
    };
  }

  componentDidMount() {
    document.addEventListener('copy', this._onCopy, false);
    this._container.addEventListener('scroll', this._onScroll);
    this._onScroll(); // for initial size
  }

  componentWillUnmount() {
    document.removeEventListener('copy', this._onCopy, false);
    this._container.removeEventListener('scroll', this._onScroll);
  }

  _onScroll() {
    this._geometry = this._queryGeometry();
    this.forceUpdate();
  }

  _onCopy(event) {
    if (document.activeElement === this._container) {
      this.props.onCopy(event);
    }
  }

  _queryGeometry() {
    if (!this._container) {
      return undefined;
    }
    const outerRect = this._container.getBoundingClientRect();
    const innerRectY = this._inner.getBoundingClientRect().top;
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

  scrollItemIntoView(itemIndex, offsetX) {
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
    this._container.focus();
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
