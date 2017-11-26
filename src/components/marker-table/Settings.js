/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { changeMarkersSearchString } from '../../actions/profile-view';
import { getMarkersSearchString } from '../../reducers/url-state';
import IdleSearchField from '../shared/IdleSearchField';

import './Settings.css';

type Props = {
  searchString: string,
  changeMarkersSearchString: string => void,
};

class Settings extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    (this: any)._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(
      this
    );
  }
  _onSearchFieldIdleAfterChange(value: string) {
    this.props.changeMarkersSearchString(value);
  }

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

export default connect(
  state => ({
    searchString: getMarkersSearchString(state),
  }),
  { changeMarkersSearchString }
)(Settings);
