/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import actions from '../../actions';
import {
  getHidePlatformDetails,
  getInvertCallstack,
  getSearchString,
} from '../../reducers/url-state';
import IdleSearchField from '../shared/IdleSearchField';

import './Settings.css';

type Props = {
  hidePlatformDetails: boolean,
  invertCallstack: boolean,
  searchString: string,
  changeHidePlatformDetails: boolean => void,
  changeInvertCallstack: boolean => void,
  changeCallTreeSearchString: string => void,
};

class StackChartSettings extends PureComponent<Props> {
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

  _onHidePlatformDetailsClick(e: SyntheticMouseEvent<HTMLInputElement>) {
    this.props.changeHidePlatformDetails(e.currentTarget.checked);
  }

  _onInvertCallstackClick(e: SyntheticMouseEvent<HTMLInputElement>) {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  }

  _onSearchFieldIdleAfterChange(value: string) {
    this.props.changeCallTreeSearchString(value);
  }

  render() {
    const { hidePlatformDetails, invertCallstack, searchString } = this.props;
    return (
      <div className="stackChartSettings">
        <ul className="stackChartSettingsList">
          <li className="stackChartSettingsListItem">
            <label className="stackChartSettingsLabel">
              <input
                type="checkbox"
                className="stackChartSettingsCheckbox"
                onChange={this._onHidePlatformDetailsClick}
                checked={hidePlatformDetails}
              />
              {' Hide platform details'}
            </label>
          </li>
          <li className="stackChartSettingsListItem">
            <label className="stackChartSettingsLabel">
              <input
                type="checkbox"
                className="stackChartSettingsCheckbox"
                onChange={this._onInvertCallstackClick}
                checked={invertCallstack}
              />
              {' Invert call stack'}
            </label>
          </li>
        </ul>
        <div className="stackChartSettingsSearchbar">
          <label className="stackChartSettingsSearchbarLabel">
            {'Filter stacks: '}
            <IdleSearchField
              className="stackChartSettingsSearchField"
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

StackChartSettings.propTypes = {
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
)(StackChartSettings);
