/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import {
  changeHidePlatformDetails,
  changeInvertCallstack,
  changeCurrentCallTreeSearchString,
} from '../../actions/profile-view';
import {
  getHidePlatformDetails,
  getInvertCallstack,
  getCurrentSearchString,
} from '../../reducers/url-state';
import IdleSearchField from '../shared/IdleSearchField';

import './Settings.css';

type Props = {
  hidePlatformDetails: boolean,
  invertCallstack: boolean,
  currentSearchString: string,
  changeHidePlatformDetails: boolean => void,
  changeInvertCallstack: boolean => void,
  changeCurrentCallTreeSearchString: string => void,
};

class StackChartSettings extends PureComponent {
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
    this.props.changeCurrentCallTreeSearchString(value);
  }

  render() {
    const {
      hidePlatformDetails,
      invertCallstack,
      currentSearchString,
    } = this.props;
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
              defaultValue={currentSearchString}
              onIdleAfterChange={this._onSearchFieldIdleAfterChange}
            />
          </label>
        </div>
      </div>
    );
  }
}

export default connect(
  state => ({
    invertCallstack: getInvertCallstack(state),
    hidePlatformDetails: getHidePlatformDetails(state),
    currentSearchString: getCurrentSearchString(state),
  }),
  {
    changeHidePlatformDetails,
    changeInvertCallstack,
    changeCurrentCallTreeSearchString,
  }
)(StackChartSettings);
