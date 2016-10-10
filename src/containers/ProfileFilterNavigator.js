import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';
import { getRangeFilters } from '../selectors';

// const MyLink = ({ to, children, push }) => {
//   // Ideally this should be an <a href>, but need a way to convert 'to' (which
//   // is a location-like object) to a string href.
//   return <span onClick={e => {push(to); e.preventDefault(); }}>{children}</span>;
// };

class ProfileFilterNavigator extends Component {
  constructor(props) {
    super(props);
    this._onJSOnlyClick = this._onJSOnlyClick.bind(this);
    this._onInvertCallstackClick = this._onInvertCallstackClick.bind(this);
  }

  render() {
    const { rangeFilters, popRangeFiltersAndUnsetSelection, location } = this.props;
    const rangeItems = rangeFilters.map(range => `Range: ${(range.start / 1000).toFixed(2)}s–${(range.end / 1000).toFixed(2)}s`);
    const items = ['Complete Profile', ...rangeItems];
    const selectedItem = items.length - 1;
    return (
      <ol className='profileFilterNavigator'>
        {
          items.map((item, i) => {
            const classList = ['profileFilterNavigatorItem'];
            if (i === 0) {
              classList.push('profileFilterNavigatorRootItem');
            }
            if (i === selectedItem - 1) {
              classList.push('profileFilterNavigatorBeforeSelectedItem');
            } else if (i === selectedItem) {
              classList.push('profileFilterNavigatorSelectedItem');
            }
            if (i === items.length - 1) {
              classList.push('profileFilterNavigatorLeafItem');
            }
            // I'd like to have a link here instead of a <li onclick>, but it's tricky.
            // There must be a better way to do it than this...
            // const targetLocation = {
            //   query: actions.queryRootReducer(location.query, {
            //     type: 'POP_RANGE_FILTERS',
            //     firstRemovedFilterIndex: i,
            //   }),
            // };
            // return <li key={i} className={classList.join(' ')}><MyLink to={targetLocation} push={push}>{item}</MyLink></li>;
            return (
              <li key={i}
                  className={classList.join(' ')}
                  onClick={() => popRangeFiltersAndUnsetSelection(i, location)}>
                {item}
              </li>
            );
          })
        }
      </ol>
    );
    // <li className='profileFilterNavigatorItem profileFilterNavigatorRootItem'>Complete profile</li>
    // <li className='profileFilterNavigatorItem profileFilterNavigatorBeforeSelectedItem'>Range: 2.12s-5.23s</li>
    // <li className='profileFilterNavigatorItem profileFilterNavigatorSelectedItem'>Range: 2.12s-5.23s</li>
    // <li className='profileFilterNavigatorItem'>Range: 2.12s-5.23s</li>
    // <li className='profileFilterNavigatorItem profileFilterNavigatorLeafItem'>Range: 2.12s-5.23s</li>
  }
}

ProfileFilterNavigator.propTypes = {
  rangeFilters: PropTypes.array.isRequired,
  popRangeFiltersAndUnsetSelection: PropTypes.func.isRequired,
  location: PropTypes.object.isRequired,
};

export default connect((state, props) => ({
  rangeFilters: getRangeFilters(state, props),
}), actions)(ProfileFilterNavigator);
