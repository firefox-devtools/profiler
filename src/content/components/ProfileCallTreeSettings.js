import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import actions from '../actions';
import { getImplementationFilter, getInvertCallstack, getSearchString } from '../reducers/url-state';
import IdleSearchField from '../components/IdleSearchField';

import './ProfileCallTreeSettings.css';

class ProfileCallTreeSettings extends Component {
  constructor(props) {
    super(props);
    this._onImplementationFilterChange = this._onImplementationFilterChange.bind(this);
    this._onInvertCallstackClick = this._onInvertCallstackClick.bind(this);
    this._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(this);
  }

  _onImplementationFilterChange(e) {
    this.props.changeImplementationFilter(e.target.value);
  }

  _onInvertCallstackClick(e) {
    this.props.changeInvertCallstack(e.target.checked);
  }

  _onSearchFieldIdleAfterChange(value) {
    this.props.changeCallTreeSearchString(value);
  }

  render() {
    const { implementationFilter, invertCallstack, searchString } = this.props;
    return (
      <div className='profileCallTreeSettings'>
        <ul className='profileCallTreeSettingsList'>
          <li className='profileCallTreeSettingsListItem'>
            <label className='profileCallTreeSettingsLabel'>
              Filter:
              <select
                     className='profileCallTreeSettingsCheckbox'
                     onChange={this._onImplementationFilterChange}
                     value={implementationFilter}>
                <option value='all'>All samples</option>
                <option value='js'>JS Only</option>
                <option value='cpp'>C++ Only</option>
              </select>
            </label>
          </li>
          <li className='profileCallTreeSettingsListItem'>
            <label className='profileCallTreeSettingsLabel'>
              <input type='checkbox'
                     className='profileCallTreeSettingsCheckbox'
                     onChange={this._onInvertCallstackClick}
                     checked={invertCallstack}/>
              { ' Invert call stack' }
            </label>
          </li>
        </ul>
        <div className='profileCallTreeSettingsSearchbar'>
          <label className='profileCallTreeSettingsSearchbarLabel'>
            {'Filter stacks: '}
            <IdleSearchField className='profileCallTreeSettingsSearchField'
                             title='Only display stacks which contain a function whose name matches this substring'
                             idlePeriod={200}
                             defaultValue={searchString}
                             onIdleAfterChange={this._onSearchFieldIdleAfterChange}/>
          </label>
        </div>
      </div>
    );
  }
}

ProfileCallTreeSettings.propTypes = {
  implementationFilter: PropTypes.string.isRequired,
  changeImplementationFilter: PropTypes.func.isRequired,
  invertCallstack: PropTypes.bool.isRequired,
  changeInvertCallstack: PropTypes.func.isRequired,
  changeCallTreeSearchString: PropTypes.func.isRequired,
  searchString: PropTypes.string.isRequired,
};

export default connect(state => ({
  invertCallstack: getInvertCallstack(state),
  implementationFilter: getImplementationFilter(state),
  searchString: getSearchString(state),
}), actions)(ProfileCallTreeSettings);
