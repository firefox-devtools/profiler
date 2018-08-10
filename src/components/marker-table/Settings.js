/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import { changeMarkersSearchString } from '../../actions/profile-view';
import { getMarkersSearchString } from '../../reducers/url-state';
import IdleSearchField from '../shared/IdleSearchField';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './Settings.css';

type StateProps = {|
  +searchString: string,
|};

type DispatchProps = {|
  +changeMarkersSearchString: typeof changeMarkersSearchString,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class Settings extends PureComponent<Props> {
  _onSearchFieldIdleAfterChange = (value: string) => {
    this.props.changeMarkersSearchString(value);
  };

  render() {
    const { searchString } = this.props;
    return (
      <div className="markerTableSettings">
        <div className="markerTableSettingsSpacer" />
        <div className="markerTableSettingsSearchbar">
          <label className="markerTableSettingsSearchbarLabel">
            {'Filter Markers: '}
            <IdleSearchField
              className="markerTableSettingsSearchField"
              title="Only display markers that match a certain name"
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
    searchString: getMarkersSearchString(state),
  }),
  mapDispatchToProps: { changeMarkersSearchString },
  component: Settings,
};
export default explicitConnect(options);
