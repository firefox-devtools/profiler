/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import {
  changeHidePlatformDetails,
  changeInvertCallstack,
} from '../../actions/profile-view';
import {
  getHidePlatformDetails,
  getInvertCallstack,
} from '../../reducers/url-state';
import StackSearchField from '../shared/StackSearchField';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './Settings.css';

type StateProps = {|
  +invertCallstack: boolean,
  +hidePlatformDetails: boolean,
|};

type DispatchProps = {|
  +changeHidePlatformDetails: typeof changeHidePlatformDetails,
  +changeInvertCallstack: typeof changeInvertCallstack,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class StackChartSettings extends PureComponent<Props> {
  constructor(props) {
    super(props);
    (this: any)._onHidePlatformDetailsClick = this._onHidePlatformDetailsClick.bind(
      this
    );
    (this: any)._onInvertCallstackClick = this._onInvertCallstackClick.bind(
      this
    );
  }

  _onHidePlatformDetailsClick(e: SyntheticMouseEvent<HTMLInputElement>) {
    this.props.changeHidePlatformDetails(e.currentTarget.checked);
  }

  _onInvertCallstackClick(e: SyntheticMouseEvent<HTMLInputElement>) {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  }

  render() {
    const { hidePlatformDetails, invertCallstack } = this.props;
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
        <StackSearchField className="stackChartSettingsSearchField" />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    invertCallstack: getInvertCallstack(state),
    hidePlatformDetails: getHidePlatformDetails(state),
  }),
  mapDispatchToProps: {
    changeHidePlatformDetails,
    changeInvertCallstack,
  },
  component: StackChartSettings,
};
export default explicitConnect(options);
