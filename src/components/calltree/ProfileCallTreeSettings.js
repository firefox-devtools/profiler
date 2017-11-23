/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
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

import './ProfileCallTreeSettings.css';

import type { ImplementationFilter } from '../../types/actions';

type Props = {|
  +implementationFilter: ImplementationFilter,
  +invertCallstack: boolean,
  +changeImplementationFilter: typeof changeImplementationFilter,
  +changeInvertCallstack: typeof changeInvertCallstack,
|};

class ProfileCallTreeSettings extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    (this: any)._onImplementationFilterChange = this._onImplementationFilterChange.bind(
      this
    );
    (this: any)._onInvertCallstackClick = this._onInvertCallstackClick.bind(
      this
    );
  }

  _onImplementationFilterChange(e: SyntheticEvent<HTMLSelectElement>) {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.currentTarget.value)
    );
  }

  _onInvertCallstackClick(e: SyntheticEvent<HTMLInputElement>) {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  }

  render() {
    const { implementationFilter, invertCallstack } = this.props;

    return (
      <div className="profileCallTreeSettings">
        <ul className="profileCallTreeSettingsList">
          <li className="profileCallTreeSettingsListItem">
            <label className="profileCallTreeSettingsLabel">
              Filter:
              <select
                className="profileCallTreeSettingsSelect"
                onChange={this._onImplementationFilterChange}
                value={implementationFilter}
              >
                <option value="combined">Combined stacks</option>
                <option value="js">JS only</option>
                <option value="cpp">C++ only</option>
              </select>
            </label>
          </li>
          <li className="profileCallTreeSettingsListItem">
            <label className="profileCallTreeSettingsLabel">
              <input
                type="checkbox"
                className="profileCallTreeSettingsCheckbox"
                onChange={this._onInvertCallstackClick}
                checked={invertCallstack}
              />
              {' Invert call stack'}
            </label>
          </li>
        </ul>
        <StackSearchField className="profileCallTreeSettingsSearchField" />
      </div>
    );
  }
}

export default connect(
  state => ({
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
  }),
  {
    changeImplementationFilter,
    changeInvertCallstack,
  }
)(ProfileCallTreeSettings);
