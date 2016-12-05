import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';
import { getJSOnly, getInvertCallstack, getSearchString } from '../selectors';
import IdleSearchField from '../components/IdleSearchField';

import './ProfileCallTreeSettings.css';

class ProfileCallTreeSettings extends Component {
  constructor(props) {
    super(props);
    this._onJSOnlyClick = this._onJSOnlyClick.bind(this);
    this._onInvertCallstackClick = this._onInvertCallstackClick.bind(this);
    this._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(this);
  }

  _onJSOnlyClick(e) {
    this.props.changeJSOnly(e.target.checked);
  }

  _onInvertCallstackClick(e) {
    this.props.changeInvertCallstack(e.target.checked);
  }

  _onSearchFieldIdleAfterChange(value) {
    this.props.changeCallTreeSearchString(value);
  }

  render() {
    const { jsOnly, invertCallstack, searchString } = this.props;
    return (
      <div className='profileCallTreeSettings'>
        <ul className='profileCallTreeSettingsList'>
          <li className='profileCallTreeSettingsListItem'>
            <label className='profileCallTreeSettingsLabel'>
              <input type='checkbox'
                     className='profileCallTreeSettingsCheckbox'
                     onChange={this._onJSOnlyClick}
                     checked={jsOnly}/>
              { ' JavaScript only' }
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
  jsOnly: PropTypes.bool.isRequired,
  changeJSOnly: PropTypes.func.isRequired,
  invertCallstack: PropTypes.bool.isRequired,
  changeInvertCallstack: PropTypes.func.isRequired,
  changeCallTreeSearchString: PropTypes.func.isRequired,
  searchString: PropTypes.string.isRequired,
};

export default connect((state, props) => ({
  invertCallstack: getInvertCallstack(state, props),
  jsOnly: getJSOnly(state, props),
  searchString: getSearchString(state, props),
}), actions)(ProfileCallTreeSettings);
