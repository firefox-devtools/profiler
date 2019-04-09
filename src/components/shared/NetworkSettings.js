/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import { changeNetworkSearchString } from '../../actions/profile-view';
import { getNetworkSearchString } from '../../selectors/url-state';
import IdleSearchField from '../shared/IdleSearchField';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './NetworkSettings.css';

type StateProps = {|
  +searchString: string,
|};

type DispatchProps = {|
  +changeNetworkSearchString: typeof changeNetworkSearchString,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class Settings extends PureComponent<Props> {
  _onSearchFieldIdleAfterChange = (value: string) => {
    this.props.changeNetworkSearchString(value);
  };

  render() {
    const { searchString } = this.props;
    return (
      <div className="networkSettings">
        <div className="networkSettingsSpacer" />
        <div className="networkSettingsSearchbar">
          <label className="networkSettingsSearchbarLabel">
            {'Filter Networks: '}
            <IdleSearchField
              className="networkSettingsSearchField"
              title="Only display network requests that match a certain name"
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

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    searchString: getNetworkSearchString(state),
  }),
  mapDispatchToProps: { changeNetworkSearchString },
  component: Settings,
};
// $FlowFixMe Error introduced by upgrading to v0.96.0.
export default explicitConnect(options);
