/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { changeNetworkSearchString } from 'firefox-profiler/actions/profile-view';
import { getNetworkSearchString } from 'firefox-profiler/selectors/url-state';
import { PanelSearch } from './PanelSearch';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './NetworkSettings.css';

type StateProps = {
  +searchString: string,
};

type DispatchProps = {
  +changeNetworkSearchString: typeof changeNetworkSearchString,
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class NetworkSettingsImpl extends PureComponent<Props> {
  _onSearch = (value: string) => {
    this.props.changeNetworkSearchString(value);
  };

  render() {
    const { searchString } = this.props;
    return (
      <div className="networkSettings">
        <div className="networkSettingsSpacer" />
        <Localized
          id="NetworkSettings--panel-search"
          attrs={{ label: true, title: true }}
        >
          <PanelSearch
            className="networkSettingsSearchField"
            label="Filter Networks:"
            title="Only display network requests that match a certain name"
            currentSearchString={searchString}
            onSearch={this._onSearch}
          />
        </Localized>
      </div>
    );
  }
}

export const NetworkSettings = explicitConnect<{}, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      searchString: getNetworkSearchString(state),
    }),
    mapDispatchToProps: { changeNetworkSearchString },
    component: NetworkSettingsImpl,
  }
);
