import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';
import { getJSOnly, getInvertCallstack } from '../selectors';
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
    this.props.changeJSOnly(e.target.checked, this.props.location);
  }

  _onInvertCallstackClick(e) {
    this.props.changeInvertCallstack(e.target.checked, this.props.location);
  }

  _onSearchFieldIdleAfterChange(value) {
    this.props.changeCallTreeSearchString(value, this.props.location);
  }

  render() {
    const { jsOnly, invertCallstack } = this.props;
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
          <IdleSearchField className='profileCallTreeSettingsSearchField'
                           idlePeriod={200}
                           onIdleAfterChange={this._onSearchFieldIdleAfterChange}/>
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
  location: PropTypes.any.isRequired,
};

export default connect((state, props) => ({
  invertCallstack: getInvertCallstack(state, props),
  jsOnly: getJSOnly(state, props),
}), actions)(ProfileCallTreeSettings);
