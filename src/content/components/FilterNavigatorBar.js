import React, { Component, PropTypes } from 'react';
import classNames from 'classnames';

import './FilterNavigatorBar.css';

class FilterNavigatorBar extends Component {
  constructor(props) {
    super(props);
    this._onLiClick = this._onLiClick.bind(this);
  }

  _onLiClick(e) {
    const index = e.target.closest('.filterNavigatorBarItem').dataset.index|0;
    this.props.onPop(index);
  }

  render() {
    const { className, items, selectedItem } = this.props;
    return (
      <ol className={classNames('filterNavigatorBar', className)}>
        {
          items.map((item, i) => (
            <li key={i}
                data-index={i}
                className={classNames(
                  'filterNavigatorBarItem', {
                    'filterNavigatorBarRootItem': i === 0,
                    'filterNavigatorBarBeforeSelectedItem': i === selectedItem - 1,
                    'filterNavigatorBarSelectedItem': i === selectedItem,
                    'filterNavigatorBarLeafItem': i === items.length - 1,
                  })}
                onClick={this._onLiClick}>
              <span className='filterNavigatorBarItemContent'>{item}</span>
            </li>
          ))
        }
      </ol>
    );
  }
}

FilterNavigatorBar.propTypes = {
  className: PropTypes.string,
  items: PropTypes.array.isRequired,
  selectedItem: PropTypes.number.isRequired,
  onPop: PropTypes.func.isRequired,
};

export default FilterNavigatorBar;
