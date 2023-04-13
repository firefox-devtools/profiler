/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { changeImplementationFilter } from 'firefox-profiler/actions/profile-view';
import { getImplementationFilter } from 'firefox-profiler/selectors/url-state';

import { toValidImplementationFilter } from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import { getProfileUsesMultipleStackTypes } from 'firefox-profiler/selectors/profile';

import './PanelSettingsList.css';

import type { ImplementationFilter } from 'firefox-profiler/types';

type OwnProps = {||};

type StateProps = {|
  +implementationFilter: ImplementationFilter,
  +allowSwitchingStackType: boolean,
|};

type DispatchProps = {|
  +changeImplementationFilter: typeof changeImplementationFilter,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackImplementationSettingImpl extends PureComponent<Props> {
  _onImplementationFilterChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.currentTarget.value)
    );
  };

  _renderImplementationRadioButton(
    labelL10nId: string,
    implementationFilter: ImplementationFilter
  ) {
    return (
      <label className="photon-label photon-label-micro photon-label-horiz-padding">
        <input
          type="radio"
          className="photon-radio photon-radio-micro"
          value={implementationFilter}
          name="stack-settings-filter"
          title="Filter stack frames to a type."
          onChange={this._onImplementationFilterChange}
          checked={this.props.implementationFilter === implementationFilter}
        />
        <Localized id={labelL10nId}></Localized>
      </label>
    );
  }

  render() {
    const { allowSwitchingStackType } = this.props;

    return allowSwitchingStackType ? (
      <li className="panelSettingsListItem">
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-all-stacks',
          'combined'
        )}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-javascript',
          'js'
        )}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-native',
          'cpp'
        )}
      </li>
    ) : null;
  }
}

export const StackImplementationSetting = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    implementationFilter: getImplementationFilter(state),
    allowSwitchingStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
  },
  component: StackImplementationSettingImpl,
});
