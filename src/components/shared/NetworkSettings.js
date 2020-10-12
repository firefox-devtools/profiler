/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { changeNetworkSearchString } from 'firefox-profiler/actions/profile-view';
import { getNetworkSearchString } from 'firefox-profiler/selectors/url-state';
import PanelSearch from 'firefox-profiler/components/shared/PanelSearch';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './NetworkSettings.css';

type StateProps = {|
  +searchString: string,
|};

type DispatchProps = {|
  +changeNetworkSearchString: typeof changeNetworkSearchString,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class Settings extends PureComponent<Props> {
  _onSearch = (value: string) => {
    this.props.changeNetworkSearchString(value);
  };

  render() {
    const { searchString } = this.props;
    return (
      <div className="networkSettings">
        <div className="networkSettingsSpacer" />
        <PanelSearch
          className="networkSettingsSearchField"
          label="Filter Networks: "
          title="Only display network requests that match a certain name"
          currentSearchString={searchString}
          onSearch={this._onSearch}
        />
      </div>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    searchString: getNetworkSearchString(state),
  }),
  mapDispatchToProps: { changeNetworkSearchString },
  component: Settings,
});
