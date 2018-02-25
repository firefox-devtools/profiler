/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import {
  changeImplementationFilter,
  changeInvertCallstack,
} from '../../actions/profile-view';
import {
  getImplementationFilter,
  getInvertCallstack,
} from '../../reducers/url-state';
import StackSearchField from '../shared/StackSearchField';
import { toValidImplementationFilter } from '../../profile-logic/profile-data';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { ImplementationFilter } from '../../types/actions';

import './Settings.css';

type StateProps = {|
  +implementationFilter: ImplementationFilter,
  +invertCallstack: boolean,
|};

type DispatchProps = {|
  +changeImplementationFilter: typeof changeImplementationFilter,
  +changeInvertCallstack: typeof changeInvertCallstack,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class FlameGraphSettings extends PureComponent<Props> {
  _onImplementationFilterChange = (e: SyntheticEvent<HTMLSelectElement>) => {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.currentTarget.value)
    );
  };

  _onInvertCallstackClick = (e: SyntheticMouseEvent<HTMLInputElement>) => {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  };

  render() {
    const { implementationFilter, invertCallstack } = this.props;
    return (
      <div className="flameGraphSettings">
        <ul className="flameGraphSettingsList">
          <li className="flameGraphSettingsListItem">
            <label className="flameGraphSettingsLabel">
              Filter:
              <select
                className="flameGraphSettingsSelect"
                onChange={this._onImplementationFilterChange}
                value={implementationFilter}
              >
                <option value="combined">Combined stacks</option>
                <option value="js">JS only</option>
                <option value="cpp">C++ only</option>
              </select>
            </label>
          </li>

          <li className="flameGraphSettingsListItem">
            <label className="flameGraphSettingsLabel">
              <input
                type="checkbox"
                className="flameGraphSettingsCheckbox"
                onChange={this._onInvertCallstackClick}
                checked={invertCallstack}
              />
              {' Invert call stack'}
            </label>
          </li>
        </ul>
        <StackSearchField className="flameGraphSettingsSearchField" />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    implementationFilter: getImplementationFilter(state),
    invertCallstack: getInvertCallstack(state),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
    changeInvertCallstack,
  },
  component: FlameGraphSettings,
};
export default explicitConnect(options);
