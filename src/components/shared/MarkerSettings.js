/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { changeMarkersSearchString } from 'firefox-profiler/actions/profile-view';
import { getMarkersSearchString } from 'firefox-profiler/selectors/url-state';
import PanelSearch from 'firefox-profiler/components/shared/PanelSearch';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './MarkerSettings.css';

type StateProps = {|
  +searchString: string,
|};

type DispatchProps = {|
  +changeMarkersSearchString: typeof changeMarkersSearchString,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class Settings extends PureComponent<Props> {
  _onSearch = (value: string) => {
    this.props.changeMarkersSearchString(value);
  };

  render() {
    const { searchString } = this.props;
    return (
      <div className="markerSettings">
        <div className="markerSettingsSpacer" />
        <PanelSearch
          className="markerSettingsSearchField"
          label="Filter Markers: "
          title="Only display markers that match a certain name"
          currentSearchString={searchString}
          onSearch={this._onSearch}
        />
      </div>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    searchString: getMarkersSearchString(state),
  }),
  mapDispatchToProps: { changeMarkersSearchString },
  component: Settings,
});
