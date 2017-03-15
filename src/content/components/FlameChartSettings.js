import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import actions from '../actions';
import { getHidePlatformDetails, getInvertCallstack, getSearchString } from '../reducers/url-state';
import IdleSearchField from '../components/IdleSearchField';

import './FlameChartSettings.css';

class FlameChartSettings extends Component {
  constructor(props) {
    super(props);
    this._onHidePlatformDetailsClick = this._onHidePlatformDetailsClick.bind(this);
    this._onInvertCallstackClick = this._onInvertCallstackClick.bind(this);
    this._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(this);
  }

  _onHidePlatformDetailsClick(e) {
    this.props.changeHidePlatformDetails(e.target.checked);
  }

  _onInvertCallstackClick(e) {
    this.props.changeInvertCallstack(e.target.checked);
  }

  _onSearchFieldIdleAfterChange(value) {
    this.props.changeCallTreeSearchString(value);
  }

  render() {
    const { hidePlatformDetails, invertCallstack, searchString } = this.props;
    return (
      <div className='flameChartSettings'>
        <ul className='flameChartSettingsList'>
          <li className='flameChartSettingsListItem'>
            <label className='flameChartSettingsLabel'>
              <input type='checkbox'
                     className='flameChartSettingsCheckbox'
                     onChange={this._onHidePlatformDetailsClick}
                     checked={hidePlatformDetails}/>
              { ' Hide platform details' }
            </label>
          </li>
          <li className='flameChartSettingsListItem'>
            <label className='flameChartSettingsLabel'>
              <input type='checkbox'
                     className='flameChartSettingsCheckbox'
                     onChange={this._onInvertCallstackClick}
                     checked={invertCallstack}/>
              { ' Invert call stack' }
            </label>
          </li>
        </ul>
        <div className='flameChartSettingsSearchbar'>
          <label className='flameChartSettingsSearchbarLabel'>
            {'Filter stacks: '}
            <IdleSearchField className='flameChartSettingsSearchField'
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

FlameChartSettings.propTypes = {
  hidePlatformDetails: PropTypes.bool.isRequired,
  changeHidePlatformDetails: PropTypes.func.isRequired,
  invertCallstack: PropTypes.bool.isRequired,
  changeInvertCallstack: PropTypes.func.isRequired,
  changeCallTreeSearchString: PropTypes.func.isRequired,
  searchString: PropTypes.string.isRequired,
};

export default connect(state => ({
  invertCallstack: getInvertCallstack(state),
  hidePlatformDetails: getHidePlatformDetails(state),
  searchString: getSearchString(state),
}), actions)(FlameChartSettings);
