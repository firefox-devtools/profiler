import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';

class VirtualListRow extends Component {
  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  render() {
    const { renderItem, item, index } = this.props;
    return renderItem(item, index);
  }
}

VirtualListRow.propTypes = {
  renderItem: PropTypes.func.isRequired,
  item: PropTypes.any.isRequired,
  index: PropTypes.number.isRequired,
  isSpecial: PropTypes.bool,
};

class VirtualList extends Component {

  constructor(props) {
    super(props);
    this._scrollListener = () => this.forceUpdate();
  }

  componentDidMount() {
    this.refs.container.addEventListener('scroll', this._scrollListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    this.refs.container.removeEventListener('scroll', this._scrollListener);
  }

  computeVisibleRange() {
    if (!this.refs.container) {
      return { visibleRangeStart: 0, visibleRangeEnd: 100 };
    }
    const { itemHeight } = this.props;
    const outerRect = this.refs.container.getBoundingClientRect();
    const innerRect = this.refs.inner.getBoundingClientRect();
    const overscan = 5;
    const chunkSize = 16;
    let visibleRangeStart = Math.floor((outerRect.top - innerRect.top) / itemHeight) - overscan;
    visibleRangeStart = Math.floor(visibleRangeStart / chunkSize) * chunkSize;
    let visibleRangeEnd = Math.ceil((outerRect.bottom - innerRect.top) / itemHeight) + overscan;
    visibleRangeEnd = Math.ceil(visibleRangeEnd / chunkSize) * chunkSize;
    return { visibleRangeStart, visibleRangeEnd };
  }

  scrollItemIntoView(itemIndex, offsetX) {
    if (!this.refs.container) {
      return;
    }
    const itemTop = itemIndex * this.props.itemHeight;
    const itemBottom = itemTop + this.props.itemHeight;
    const { container } = this.refs;

    if (container.scrollTop > itemTop) {
      container.scrollTop = itemTop;
    } else if (container.scrollTop + container.clientHeight < itemBottom) {
      container.scrollTop = Math.min(itemTop, itemBottom - container.clientHeight);
    }

    const interestingWidth = 400;
    const itemLeft = offsetX;
    const itemRight = itemLeft + interestingWidth;

    if (container.scrollLeft > itemLeft) {
      container.scrollLeft = itemLeft;
    } else if (container.scrollLeft + container.clientWidth < itemRight) {
      container.scrollLeft = Math.min(itemLeft, itemRight - container.clientWidth);
    }
  }

  focus() {
    this.refs.container.focus();
  }

  render() {
    const { itemHeight, className, renderItem, items, focusable, specialItems, onKeyDown } = this.props;

    const range = this.computeVisibleRange();
    const { visibleRangeStart, visibleRangeEnd } = range;
    return (
      <div className={className} ref='container' tabIndex={ focusable ? 0 : -1 } onKeyDown={onKeyDown}>
        <div className={`${className}Inner`} ref='inner'
              style={{
                height: `${items.length * itemHeight}px`,
                width: '3000px',
              }}>
          <div className={`${className}TopSpacer`}
               key={-1}
               style={{height: Math.max(0, visibleRangeStart) * itemHeight + 'px'}} />
          {
            items.map((item, i) => {
              if (i < visibleRangeStart || i >= visibleRangeEnd) {
                return null;
              }
              return <VirtualListRow key={i} index={i} renderItem={renderItem} item={item} items={items} isSpecial={specialItems.includes(item)}/>;
            })
          }
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
};

export default VirtualList;
