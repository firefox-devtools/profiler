/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import actions from '../../actions';
import {
  getHidePlatformDetails,
  getInvertCallstack,
  getSearchString,
} from '../../reducers/url-state';
import IdleSearchField from '../shared/IdleSearchField';

import './FlameChartSettings.css';

type Props = {
  hidePlatformDetails: boolean,
  invertCallstack: boolean,
  searchString: string,
  changeHidePlatformDetails: boolean => void,
  changeInvertCallstack: boolean => void,
  changeCallTreeSearchString: string => void,
};

class FlameChartSettings extends PureComponent {
  props: Props;

  constructor(props) {
    super(props);
    (this: any)._onHidePlatformDetailsClick = this._onHidePlatformDetailsClick.bind(
      this
    );
    (this: any)._onInvertCallstackClick = this._onInvertCallstackClick.bind(
      this
    );
    (this: any)._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(
      this
    );
  }

  _onHidePlatformDetailsClick(e: Event & { target: HTMLInputElement }) {
    this.props.changeHidePlatformDetails(e.target.checked);
  }

  _onInvertCallstackClick(e: Event & { target: HTMLInputElement }) {
    this.props.changeInvertCallstack(e.target.checked);
  }

  _onSearchFieldIdleAfterChange(value: string) {
    this.props.changeCallTreeSearchString(value);
  }

  render() {
    const { hidePlatformDetails, invertCallstack, searchString } = this.props;
    return (
      <div className="flameChartSettings">
        <ul className="flameChartSettingsList">
          <li className="flameChartSettingsListItem">
            <label className="flameChartSettingsLabel">
              <input
                type="checkbox"
                className="flameChartSettingsCheckbox"
                onChange={this._onHidePlatformDetailsClick}
                checked={hidePlatformDetails}
              />
              {' Hide platform details'}
            </label>
          </li>
          <li className="flameChartSettingsListItem">
            <label className="flameChartSettingsLabel">
              <input
                type="checkbox"
                className="flameChartSettingsCheckbox"
                onChange={this._onInvertCallstackClick}
                checked={invertCallstack}
              />
              {' Invert call stack'}
            </label>
          </li>
        </ul>
        <div className="flameChartSettingsSearchbar">
          <label className="flameChartSettingsSearchbarLabel">
            {'Filter stacks: '}
            <IdleSearchField
              className="flameChartSettingsSearchField"
              title="Only display stacks which contain a function whose name matches this substring"
              idlePeriod={200}
              defaultValue={searchString}
              onIdleAfterChange={this._onSearchFieldIdleAfterChange}
            />
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

export default connect(
  state => ({
    invertCallstack: getInvertCallstack(state),
    hidePlatformDetails: getHidePlatformDetails(state),
    searchString: getSearchString(state),
  }),
  actions
)(FlameChartSettings);
